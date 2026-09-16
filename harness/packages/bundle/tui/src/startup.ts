/**
 * The interactive TUI app's command-line provider: it parses optional flags
 * (no task positional — the conversation is the command line), then publishes
 * {@link TUI_STARTUP_SERVICE}. The runner is an ordinary consumer whose lazy
 * config waits for that service.
 * @module @deepseek-ai/dsh-tui/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'tui-startup'

/** Services required before the run can resolve. */
export const inject = ['cmdlineArgs']

/** Service provided by this plugin and injected by the interactive runner. */
export const TUI_STARTUP_SERVICE = 'tuiStartup'

/** What the runner row reads from {@link TUI_STARTUP_SERVICE}. */
export interface TuiStartupValues {
  /** Stable session id to resume; empty string for a fresh random session. */
  sessionId: string
  /** First task submitted immediately after boot before the REPL prompt; empty when absent. */
  initialTask: string
  /** Provider override; empty keeps the settings default. */
  provider: string
  /** Model override; empty keeps the settings default. */
  model: string
  /** Print loaded plugin/tool inventory and exit without entering the REPL. */
  check: boolean
}

/** Parse flags and return the boot values. */
function parseFlags(program: Command): TuiStartupValues {
  return {
    sessionId: (program.getOptionValue('session') as string | undefined) ?? '',
    initialTask: (program.getOptionValue('task') as string | undefined) ?? '',
    provider: (program.getOptionValue('provider') as string | undefined) ?? '',
    model: (program.getOptionValue('model') as string | undefined) ?? '',
    check: (program.getOptionValue('check') as boolean | undefined) === true,
  }
}

/**
 * This app's command: interactive session flags, its description, and its
 * help text. No task positional: the REPL prompt is the conversation driver.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function tuiCommand(): Command {
  return new Command()
    .name('dsh --profile tui')
    .description('Start an interactive terminal conversation; type a message, /quit to exit.')
    .helpOption('-h, --help', 'show this help')
    .option('--session <id>', 'stable session id to resume or create')
    .option('-e, --task <task>', 'submit one task immediately after boot, then keep the REPL open')
    .option('--provider <name>', 'provider route override (empty keeps the settings default)')
    .option('--model <id>', 'model id override (empty keeps the settings default)')
    .option('--check', 'print the loaded plugin and tool inventory, then exit')
    .addHelpText('after', `
Commands in the REPL:
  /quit /exit       end the session and exit
  /help             show this help
  /new              reset to a fresh session (loses thread context)
Examples:
  dsh --profile tui                          start an interactive session
  dsh --profile tui -e "recon the target"    run one task, then continue interactively
  dsh --profile tui --provider kiro --model claude-opus-4.8
  dsh --profile tui --check                  verify plugins/tools loaded, then exit
`)
}

/**
 * Parse and provide the interactive boot values as an ordinary Cordis
 * service. There is no required positional: a bare `dsh --profile tui`
 * starts the REPL with an empty first prompt.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context): void {
  const program = tuiCommand()
  program.action(() => {
    ctx.provide(TUI_STARTUP_SERVICE, parseFlags(program) satisfies TuiStartupValues)
  })
  parseCmdline(ctx, program)
}