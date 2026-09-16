/**
 * @deepseek-ai/dsh-tui — interactive REPL runner. Creates one persistent Agent
 * through the core registry, accepts user lines from stdin, submits each as
 * a follow-up turn, and prints the final assistant text after quiescence.
 * `/new` resets to a fresh session; `/quit` requests process exit.
 *
 * @module @deepseek-ai/dsh-tui
 */

import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'tui-runner'

/** Core services required before the REPL loop can start. */
export const inject = ['agentDefaultModel', 'agents', 'sessions', 'tuiStartup']

/** Plugin config: boot values resolved from this app's injected provider service. */
export interface Config {
  /** Stable session id; fresh random when absent. */
  sessionId?: string
  /** Optional initial task submitted before the REPL prompt. */
  initialTask?: string
  /** Provider route override; empty keeps the settings default. */
  provider?: string
  /** Model id override; empty keeps the settings default. */
  model?: string
  /** Print the loaded plugin/tool inventory and exit without entering the REPL. */
  check?: boolean
}

export const Config: z<Config> = z.object({
  sessionId: z.string().default(''),
  initialTask: z.string().default(''),
  provider: z.string().default(''),
  model: z.string().default(''),
  check: z.boolean().default(false),
})

/** Why one REPL session ended. */
export type ReplExitReason = 'quit' | 'new' | 'eof'

/** Process-facing effects of one run: output streams plus the launcher's bounded exit request. */
interface TuiIo {
  stdout: { write(chunk: string): unknown }
  stderr: { write(chunk: string): unknown }
  stdin: NodeJS.ReadableStream
  /** Request process exit with `code` after the tree disposes. */
  exit(code: number): void
}

/** Process streams the runner writes to; tests substitute captures. */
export const internals: { stdout: TuiIo['stdout']; stderr: TuiIo['stderr']; stdin: TuiIo['stdin'] } = {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
}

/* -------------------------------------------------------------------------- */
/*  Turn summarization (same logic as headless, scoped per turn)              */
/* -------------------------------------------------------------------------- */

interface TurnSummary {
  text: string
  reason: SessionEvent<'turn/end'>['data']['reason'] | undefined
}

function summarizeTurn(events: readonly SessionEvent[], firstSeq: number): TurnSummary {
  let started = false
  let text = ''
  let reason: SessionEvent<'turn/end'>['data']['reason'] | undefined
  for (const event of events) {
    if (event.seq < firstSeq) continue
    if (event.type === 'turn/start') { started = true; continue }
    if (!started) continue
    if (event.type === 'assistant/message') {
      const joined = event.data.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
      if (joined !== '') text = joined
    }
    if (event.type === 'turn/end') reason = event.data.reason
  }
  return { text, reason }
}

/* -------------------------------------------------------------------------- */
/*  REPL core (one session life)                                              */
/* -------------------------------------------------------------------------- */

async function runTurn(
  agent: { followup(message: any): void; whenIdle(): Promise<void>; session: Session },
  sessions: { flush(session: Session): Promise<boolean> },
  line: string,
): Promise<TurnSummary> {
  const firstSeq = agent.session.seq
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: line }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()
  await sessions.flush(agent.session)
  return summarizeTurn(agent.session.events, firstSeq)
}

/**
 * One interactive session: create an agent, optionally run the initial task,
 * then read-evaluate-print until `/quit`, `/exit`, `/new` or stdin EOF.
 * @param ctx - plugin context carrying core services.
 * @param config - validated boot config for THIS session.
 * @param io - process-facing effects.
 * @returns the reason the session ended.
 */
async function runSession(ctx: Context, config: Config, io: TuiIo): Promise<ReplExitReason> {
  await ctx.get('loader')?.await()
  const agents = ctx.get('agents')
  const defaultModel = ctx.get('agentDefaultModel')
  const sessions = ctx.get('sessions')
  if (agents === undefined || defaultModel === undefined || sessions === undefined) return 'quit'

  const selection = defaultModel.currentSelection()
  const requested = String(config.sessionId ?? '').trim()
  const sessionId = SessionId(requested === '' ? `session-${randomUUID()}` : requested)
  io.stdout.write(`(session ${sessionId})\n`)

  // Flag overrides win over the settings default; each side falls back
  // independently so `--provider kiro` alone keeps the default model id.
  const provider = String(config.provider ?? '').trim() || selection.provider
  const model = String(config.model ?? '').trim() || selection.model
  // A CLI override drops the settings' reasoning effort: that effort was
  // chosen for the settings default model and may not exist on the target
  // (e.g. max on a non-thinking provider). The provider default applies.
  const effective = (config.provider || config.model)
    ? { provider, model }
    : { ...selection, provider, model }
  if (config.provider || config.model) {
    io.stdout.write(`(model ${provider}/${model})\n`)
  }

  const { agent } = await agents.create({
    sessionId,
    meta: { cwd: process.cwd() },
    agentOptions: effective ? { provider: effective.provider, model: effective.model } : {},
    setup: (agentCtx) => {
      const selected: ModelSelectionRef = { current: effective, assembled: undefined }
      installModelSelection(agentCtx, selected)
    },
  })

  await agent.whenIdle()

  const prompt = () => io.stdout.write('\x1b[1mdsh>\x1b[0m ')

  if (config.initialTask && config.initialTask.trim() !== '') {
    const outcome = await runTurn(agent, sessions, config.initialTask)
    if (outcome.text !== '') io.stdout.write(outcome.text + '\n')
    if (outcome.reason?.kind === 'error') {
      io.stderr.write(`dsh: ${outcome.reason.error.code}: ${outcome.reason.error.message}\n`)
    }
  }

  const rl = createInterface({ input: io.stdin as NodeJS.ReadableStream, output: io.stdout as NodeJS.WriteStream })
  let busy = false
  // A command that arrived while a turn was in flight (`/quit`, `/new`) or a
  // stdin EOF: honored after the current turn settles, never mid-turn.
  let pending: ReplExitReason | undefined

  let done: (reason: ReplExitReason) => void = () => {}
  const finished = new Promise<ReplExitReason>((resolve) => { done = resolve })

  prompt()
  rl.on('line', async (line: string) => {
    const trimmed = line.trim()

    if (trimmed === '/quit' || trimmed === '/exit') {
      if (busy) { pending = 'quit'; return }
      done('quit'); return
    }
    if (trimmed === '/new') {
      io.stdout.write('(starting a new session)\n')
      if (busy) { pending = 'new'; return }
      done('new'); return
    }
    if (pending !== undefined) return

    if (trimmed === '/help') {
      io.stdout.write('Commands:  /quit /exit /new /help\nType a message to talk to the agent.\n')
      prompt(); return
    }
    if (trimmed === '') { prompt(); return }

    if (busy) {
      io.stdout.write('(still working — wait for the prompt)\n')
      return
    }

    busy = true
    try {
      const outcome = await runTurn(agent, sessions, trimmed)
      if (outcome.text !== '') io.stdout.write(outcome.text + '\n')
      if (outcome.reason?.kind === 'error') {
        io.stderr.write(`dsh: ${outcome.reason.error.code}: ${outcome.reason.error.message}\n`)
      }
    } catch (error) {
      io.stderr.write(`dsh: turn failed: ${error instanceof Error ? error.message : String(error)}\n`)
    } finally {
      busy = false
      if (pending !== undefined) { done(pending); return }
      prompt()
    }
  })

  rl.on('close', () => {
    // readline closes on stdin EOF (or explicit close). If a turn is in
    // flight, wait for it; otherwise resolve now.
    if (!busy) done(pending ?? 'eof')
  })

  return await finished
}

/** Report an unexpected direct-driver failure and request a failing exit. */
function fail(io: TuiIo, error: unknown): void {
  io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`)
  io.exit(1)
}

/**
 * Print the loaded plugin inventory (loader entries with activation status)
 * and the registered tool list, then request exit.
 * @param ctx - settled plugin context.
 * @param io - process-facing effects.
 */
function runCheck(ctx: Context, io: TuiIo): void {
  const loader = ctx.get('loader')
  const tools = ctx.get('tools')
  const defaultModel = ctx.get('agentDefaultModel')

  const selection = defaultModel?.currentSelection()
  io.stdout.write(`model: ${selection?.provider}/${selection?.model}\n`)
  io.stdout.write(`tools (registered): ${tools?.schemas().length ?? 0}\n`)

  let activated = 0
  let pending = 0
  let disabled = 0

  if (loader !== undefined) {
    io.stdout.write('\nplugins:\n')
    for (const entry of loader.entries()) {
      const status = entry.disabled
        ? 'disabled'
        : entry.fiber !== undefined
          ? 'active'
          : 'pending'
      if (status === 'active') activated += 1
      else if (status === 'pending') pending += 1
      else disabled += 1
      io.stdout.write(`  ${status.padEnd(8)} ${entry.id}`)
      if (entry.options.name !== undefined && entry.options.name !== entry.id) {
        io.stdout.write(`  (${entry.options.name})`)
      }
      io.stdout.write('\n')
    }
    io.stdout.write(`\nactivated ${activated}, pending ${pending}, disabled ${disabled}\n`)
  }

  if (tools !== undefined) {
    io.stdout.write('\nregistered tools:\n')
    for (const tool of tools.schemas()) {
      io.stdout.write(`  ${tool.name}\n`)
    }
  }

  // A clean check prints everything and exits 0; a failed inventory is
  // invisible because boot already failed before apply() ran.
  io.exit(0)
}

/**
 * Drive the REPL until the user quits; `/new` relaunches a fresh session.
 * @param ctx - plugin context carrying core services and the launcher-provided exit request.
 * @param config - validated boot config (sessionId reused only for the first session).
 * @param io - process-facing effects.
 */
export function apply(ctx: Context, config: Config): void {
  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error('tui-runner: the launcher must provide ctx.appExit before the tree mounts')
  }

  const io: TuiIo = { stdout: internals.stdout, stderr: internals.stderr, stdin: internals.stdin, exit }

  if (config.check === true) {
    // Print the inventory once the tree settles, then exit without a REPL.
    void (async () => {
      await ctx.get('loader')?.await()
      runCheck(ctx, io)
    })().catch((error: unknown) => { fail(io, error) })
    return
  }

  const drive = async (): Promise<void> => {
    let sessionConfig = config
    for (;;) {
      const reason = await runSession(ctx, sessionConfig, io)
      if (reason === 'new') {
        // Fresh identity per /new; the initial task only applies to the
        // first session, but provider/model overrides persist.
        sessionConfig = {
          sessionId: '',
          initialTask: '',
          provider: String(config.provider ?? ''),
          model: String(config.model ?? ''),
        }
        continue
      }
      io.exit(reason === 'quit' ? 0 : 0)
      return
    }
  }

  void drive().catch((error: unknown) => { fail(io, error) })
}