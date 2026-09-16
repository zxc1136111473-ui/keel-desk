/**
 * The one-shot app's command-line provider: it parses the task positional and
 * `--help`, then publishes {@link HEADLESS_STARTUP_SERVICE}. The runner is an
 * ordinary consumer whose lazy config waits for that service.
 * @module @deepseek-ai/dsh-headless/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'headless-startup'

/** Services required before the task can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this plugin and injected by the one-shot runner. */
export const HEADLESS_STARTUP_SERVICE = 'headlessStartup'

/** What the runner row reads from {@link HEADLESS_STARTUP_SERVICE}. */
export interface HeadlessStartupValues {
  /** The task text this invocation asked for. */
  task: string
  /** Provider route override; empty keeps the settings default. */
  provider: string
  /** Model id override; empty keeps the settings default. */
  model: string
}

/**
 * This app's command: the task positional, model flags, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function headlessCommand(): Command {
  return new Command()
    .name('dsh --profile headless')
    .description('Answer one task, print the final assistant message, and exit.')
    .helpOption('-h, --help', 'show this help')
    .argument('[task...]', 'the task text; multiple words are joined by spaces')
    .option('--provider <name>', 'provider route override (empty keeps the settings default)')
    .option('--model <id>', 'model id override (empty keeps the settings default)')
    .addHelpText('after', `
Examples:
  dsh --profile headless "run the tests"                                        answer one task and exit
  dsh --profile headless --provider kiro --model claude-opus-4.8 "recon target"  use a different model
`)
}

/**
 * Parse and provide the one-shot task and model overrides as an ordinary Cordis service.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context): void {
  const program = headlessCommand()
  program.action(() => {
    const task = program.args.join(' ')
    if (task.trim() === '') program.error('error: a task is required, for example: dsh --profile headless "run the tests"')
    ctx.provide(HEADLESS_STARTUP_SERVICE, {
      task,
      provider: (program.getOptionValue('provider') as string | undefined) ?? '',
      model: (program.getOptionValue('model') as string | undefined) ?? '',
    } satisfies HeadlessStartupValues)
  })
  parseCmdline(ctx, program)
}
