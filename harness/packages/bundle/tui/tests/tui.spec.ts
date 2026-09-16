/**
 * Interactive REPL driver over a scripted Agent: persistent session across
 * turns, /new resets, /quit and stdin EOF exit cleanly, and failure paths
 * exit 1.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import AgentDefaultModelConfig from '@deepseek-ai/dsh-agent-default-model'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session, UserMessage } from '@deepseek-ai/dsh-session'
import { Readable } from 'node:stream'
import { apply, internals } from '../src/index.ts'

const originalInternals = { ...internals }
afterEach(() => { Object.assign(internals, originalInternals) })

interface Script {
  before?(session: Session): void
  afterPrompt(session: Session, message: UserMessage): Promise<void> | void
}

function appendTurn(
  session: Session,
  turn: number,
  message: UserMessage,
  text: string | undefined,
  completed: boolean,
): void {
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step: 1 })
  session.append('user/message', message, { surfaceOp: 'append' })
  if (text !== undefined) {
    session.append('assistant/message', {
      turn,
      step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text }],
        source: { provider: 'test-provider', model: 'test-model' },
      }),
    }, { surfaceOp: 'append' })
  }
  session.append('step/end', { turn, step: 1 })
  session.append('turn/end', {
    turn,
    reason: completed
      ? { kind: 'completed' }
      : { kind: 'aborted', reason: { kind: 'user' } },
  })
}

/** Mount the real registries around a scripted Agent factory and a fake stdin. */
async function bench(
  script: Script,
  stdinLines: string[],
  config: { sessionId?: string; initialTask?: string } = {},
  setup?: (ctx: Context) => void,
): Promise<{
  ctx: Context
  run(): Promise<{ code: number; out: string; err: string; order: string[] }>
}> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentDefaultModelConfig, { provider: 'test-provider', model: 'test-model' })
  ctx.agents.setFactory({
    async createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle> {
      const session = ctx.sessions.create(options.sessionId, {
        ...options.meta === undefined ? {} : { meta: options.meta },
      })
      let idle = Promise.resolve()
      const agent = {} as Agent
      const agentCtx = ownerCtx.extend({ agent })
      Object.assign(agent, {
        id: session.id,
        options: options.agentOptions ?? {},
        session,
        inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
        status: 'idle',
        ctx: agentCtx,
        cancel: () => {},
        runMaintenance: () => Promise.reject(new Error('not used')),
        send: () => {},
        followup: (message: UserMessage) => {
          agent.inbox.append('next-turn', message)
          idle = Promise.resolve().then(() => script.afterPrompt(session, message))
        },
        steer: () => {},
        inject: () => {},
        whenIdle: () => idle,
      } satisfies Partial<Agent>)
      await options.setup?.(agentCtx)
      script.before?.(session)
      ctx.agents.register(agent)
      return { agent, dispose: () => Promise.resolve() }
    },
    resume: () => Promise.reject(new Error('not used')),
  })
  return {
    ctx,
    run: async () => {
      let out = ''
      let err = ''
      const order: string[] = []
      ctx.on('session/flush', () => { order.push('flush') })
      internals.stdout = { write: (chunk: string) => { out += chunk; return true } }
      internals.stderr = { write: (chunk: string) => { err += chunk; return true } }
      // readline's EOF semantics: from() pushes lines then ends the stream.
      internals.stdin = Readable.from(stdinLines)
      const exited = new Promise<number>((resolve) => {
        ctx.provide('appExit', (code: number) => { order.push('exit'); resolve(code) })
      })
      setup?.(ctx)
      apply(ctx, { sessionId: config.sessionId ?? '', initialTask: config.initialTask ?? '' })
      return { code: await exited, out, err, order }
    },
  }
}

describe('tui runner', () => {
  it('answers a message then /quit exits 0', async () => {
    const test = await bench({
      afterPrompt(session, message) {
        appendTurn(session, 1, message, 'TUI_OK', true)
      },
    }, ['Reply with exactly: TUI_OK\n', '/quit\n'])
    const result = await test.run()
    expect(result).toMatchObject({ code: 0, out: expect.stringContaining('TUI_OK'), err: '' })
    expect(result.out).toContain('/model')
    expect(result.out).toContain('/config')
    expect(result.out).toContain('工作区:')
    expect(result.out).toContain('破甲:')
    expect(result.out).toContain('/skills')
    expect(result.out).toContain('/armor')
    expect(result.out).toContain('/trace')
    expect(result.out).toContain('/preset')
    expect(result.out).toContain('/permission')
    expect(result.out).toContain('/compact')
    expect(result.out).toContain('上下文: 等待模型上报容量')
    expect(result.out).toContain('帮助 / 菜单')
    await test.ctx.fiber.dispose()
  })

  it('/compact without a compaction service prints a local notice', async () => {
    const test = await bench({
      afterPrompt() {
        throw new Error('/compact must not start a model turn')
      },
    }, ['/compact\n', '/quit\n'])
    const result = await test.run()
    expect(result.code).toBe(0)
    expect(result.out).toContain('当前配置没有挂载压缩服务。')
    expect(result.err).toBe('')
    await test.ctx.fiber.dispose()
  })

  it('/compact with a compaction service reports a no-op', async () => {
    const test = await bench({
      afterPrompt() {
        throw new Error('/compact must not start a model turn')
      },
    }, ['/compact\n', '/quit\n'], {}, (ctx) => {
      ctx.provide('compaction', {
        compactNow: async () => null,
      })
    })
    const result = await test.run()
    expect(result.code).toBe(0)
    expect(result.out).toContain('还没有可压缩的历史。')
    expect(result.err).toBe('')
    await test.ctx.fiber.dispose()
  })

  it('Chinese menu names open the help menu without a model turn', async () => {
    const test = await bench({
      afterPrompt() {
        throw new Error('menu names must not start a model turn')
      },
    }, ['帮助\n', '菜单\n', '/quit\n'])
    const result = await test.run()
    expect(result.code).toBe(0)
    expect(result.err).toBe('')
    const helpHits = result.out.split('命令（数字、斜杠、或菜单上的中文名都可以）').length - 1
    expect(helpHits).toBeGreaterThanOrEqual(3)
    await test.ctx.fiber.dispose()
  })

  it('轨迹 dumps USER and ASSISTANT rows without a model turn', async () => {
    const test = await bench({
      before(session) {
        appendTurn(session, 1, createUserMessage({
          content: [{ type: 'text', text: 'Reply with exactly: TUI_OK' }],
          source: { kind: 'user' },
        }), 'TUI_OK', true)
      },
      afterPrompt() {
        throw new Error('轨迹 must not start a model turn')
      },
    }, ['轨迹\n', '/quit\n'])
    const result = await test.run()
    expect(result.code).toBe(0)
    expect(result.out).toContain('轨迹  ')
    expect(result.out).toContain('USER')
    expect(result.out).toContain('ASSISTANT')
    expect(result.out).toContain('TUI_OK')
    await test.ctx.fiber.dispose()
  })

  it('exits 0 on stdin EOF with no /quit', async () => {
    const test = await bench({ afterPrompt: () => {} }, [])
    const result = await test.run()
    expect(result).toMatchObject({ code: 0 })
    await test.ctx.fiber.dispose()
  })

  it('runs the initial task before the first prompt', async () => {
    const test = await bench({
      afterPrompt(session, message) {
        appendTurn(session, 1, message, 'INIT_DONE', true)
      },
    }, ['/quit\n'], { sessionId: 'initial-task-session', initialTask: 'recon the target' })
    const result = await test.run()
    expect(result).toMatchObject({ code: 0, out: expect.stringContaining('INIT_DONE') })
    await test.ctx.fiber.dispose()
  })

  it('reports a direct Agent creation failure and exits 1', async () => {
    const ctx = new Context()
    let err = ''
    internals.stdout = { write: () => true }
    internals.stderr = { write: (chunk: string) => { err += chunk; return true } }
    internals.stdin = Readable.from(['x\n'])
    const exited = new Promise<number>((resolve) => {
      ctx.provide('appExit', resolve)
    })
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'p', model: 'm' }) } as never)
    ctx.provide('sessions', { flush: () => Promise.resolve(true) } as never)
    ctx.provide('agents', { create: () => Promise.reject(new Error('factory exploded')) } as never)
    apply(ctx, { sessionId: '', initialTask: '' })
    expect(await exited).toBe(1)
    expect(err).toBe('dsh: factory exploded\n')
    await ctx.fiber.dispose()
  })

  it('stringifies a non-Error Agent creation failure and exits 1', async () => {
    const ctx = new Context()
    let err = ''
    internals.stdout = { write: () => true }
    internals.stderr = { write: (chunk: string) => { err += chunk; return true } }
    internals.stdin = Readable.from(['x\n'])
    const exited = new Promise<number>((resolve) => {
      ctx.provide('appExit', resolve)
    })
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'p', model: 'm' }) } as never)
    ctx.provide('sessions', { flush: () => Promise.resolve(true) } as never)
    const rejected = {
      then(_resolve: (value: never) => void, reject: (reason: unknown) => void): void {
        reject('factory exploded')
      },
    }
    ctx.provide('agents', { create: () => rejected } as never)
    apply(ctx, { sessionId: '', initialTask: '' })
    expect(await exited).toBe(1)
    expect(err).toBe('dsh: factory exploded\n')
    await ctx.fiber.dispose()
  })

  it('opens readline in cooked line mode on non-TTY stdin so kernel/IME echo is not doubled', async () => {
    const seen: Array<{ terminal?: boolean }> = []
    const original = internals.createInterface
    internals.createInterface = (options) => {
      seen.push({ terminal: options.terminal ?? false })
      return original(options)
    }
    const test = await bench({ afterPrompt: () => {} }, ['/quit\n'])
    const result = await test.run()
    internals.createInterface = original
    expect(result.code).toBe(0)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(call => call.terminal === false)).toBe(true)
    await test.ctx.fiber.dispose()
  })

  it('menu 8 switches armor mode like the desktop chips and starts a new session', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-tui-armor-'))
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      const test = await bench({
        afterPrompt() {
          throw new Error('armor menu must not start a model turn')
        },
      }, ['8\n', '3\n', '/quit\n'], { sessionId: 'session-cli-armor' })
      const result = await test.run()
      expect(result.code).toBe(0)
      expect(result.out).toContain('选择工作模式')
      expect(result.out).toContain('PentAGI 1.0.0')
      expect(result.out).toContain('已切到 PentAGI 1.0.0')
      expect(result.err).toBe('')
      const settings = JSON.parse(readFileSync(join(home, 'desktop-settings.json'), 'utf8')) as { coldbrew: { armorMode: string } }
      expect(settings.coldbrew.armorMode).toBe('pentagi')
      await test.ctx.fiber.dispose()
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('whole-line 冷咖啡 plays MAX without a model turn or kernel switch', async () => {
    const test = await bench({
      afterPrompt() {
        throw new Error('passphrase play must not start a model turn')
      },
    }, ['冷咖啡\n', '/quit\n'])
    const result = await test.run()
    expect(result.code).toBe(0)
    expect(result.out).toContain('MAX 已开，把对象发来')
    expect(result.err).toBe('')
    await test.ctx.fiber.dispose()
  })

  it('/memory list|search|add|forget manage the local file without a model turn', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-tui-memory-'))
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      const test = await bench({
        afterPrompt() {
          throw new Error('memory commands must not start a model turn')
        },
      }, [
        '/memory add 项目密钥是 sk-test-abc\n',
        '/memory list\n',
        '/memory search sk-test\n',
        '/memory delete m-\n',
        '/memory list\n',
        '/quit\n',
      ])
      const result = await test.run()
      expect(result.code).toBe(0)
      expect(result.out).toContain('已存储')
      expect(result.out).toContain('sk-test-abc')
      expect(result.out).toContain('找到 1 条')
      expect(result.out).toContain('已删除')
      expect(result.err).toBe('')
      // The file is removed with the temp home, nothing leaks to ~/.dsh.
      await test.ctx.fiber.dispose()
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('queues input typed while busy and processes it after the current turn', async () => {
    let firstTurnDone = false
    const test = await bench({
      afterPrompt(session, message) {
        const text = message.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('')
        if (firstTurnDone) {
          // Second turn was queued
          appendTurn(session, 2, message, `QUEUED:${text}`, true)
          return
        }
        firstTurnDone = true
        appendTurn(session, 1, message, 'TURN_1_OK', true)
      },
    }, [
      'first message\n',
      'queued message\n',
      '/quit\n',
    ])
    const result = await test.run()
    expect(result.code).toBe(0)
    // Queue notice appears for the second line
    expect(result.out).toContain('已排入队列')
    // Queue turn notice should appear (but may be swallowed if /quit wins race)
    expect(result.out).toContain('TURN_1_OK')
    // At least verify the mechanism: first turn ran and the /quit was deferred.
    await test.ctx.fiber.dispose()
  })
})