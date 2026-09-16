/**
 * The interactive app's ordinary command-line provider over a real Loader tree:
 * flags become injected runner config, while help and usage errors leave the
 * consumer pending.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { internals, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, TUI_STARTUP_SERVICE, type TuiStartupValues } from '../src/startup.ts'

/** What one boot of the fixture tree observed. */
interface Observed {
  exits: number[]
  out: string
  runnerConfig?: unknown
}

const disposers: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
  internals.stdout = process.stdout
  internals.stderr = process.stderr
})

/**
 * Mount the real provider over a runner stand-in.
 * @param args - the invocation's inner arguments.
 * @returns the resolved service value and observed runner/process effects.
 */
async function bootStartup(args: string[]): Promise<{ values: TuiStartupValues | undefined; observed: Observed }> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-tui-startup-'))
  const observed: Observed = { exits: [], out: '' }
  writeFileSync(join(dir, 'row.mjs'), 'export function apply(_ctx, config) { globalThis.__tuiStartupObserved.runnerConfig = config }\n')
  writeFileSync(join(dir, 'startup.mjs'), `
export const name = 'tui-startup'
export const inject = ['cmdlineArgs']
export const apply = ctx => globalThis.__tuiStartupApply(ctx)
`)
  const rowUrl = pathToFileURL(join(dir, 'row.mjs')).href
  writeFileSync(join(dir, 'cordis.yml'), [
    '- id: tui-runner',
    `  name: ${rowUrl}`,
    `  inject: [${TUI_STARTUP_SERVICE}]`,
    '  config:',
    '    sessionId: !!js ctx.tuiStartup.sessionId',
    '    initialTask: !!js ctx.tuiStartup.initialTask',
    '    provider: !!js ctx.tuiStartup.provider',
    '    model: !!js ctx.tuiStartup.model',
    '    check: !!js ctx.tuiStartup.check',
    '- id: tui-startup',
    `  name: ${pathToFileURL(join(dir, 'startup.mjs')).href}`,
    '',
  ].join('\n'))
  const observing = { write: (chunk: string) => { observed.out += chunk; return true } }
  internals.stdout = observing
  internals.stderr = observing
  const globals = globalThis as unknown as {
    __tuiStartupApply: typeof apply
    __tuiStartupObserved: Observed
  }
  globals.__tuiStartupApply = apply
  globals.__tuiStartupObserved = observed

  const ctx = new Context()
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  provideCmdline(ctx, { args, exit: code => void observed.exits.push(code) })
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(dir, 'cordis.yml')).href } })
  await ctx.loader.await()
  disposers.push(async () => { await ctx.fiber.dispose() })
  return {
    values: ctx.get(TUI_STARTUP_SERVICE) as TuiStartupValues | undefined,
    observed,
  }
}

describe('tui command-line provider', () => {
  const BASE = { sessionId: '', initialTask: '', provider: '', model: '', check: false }

  it('bare invocation starts a fresh session with no initial task', async () => {
    const { values, observed } = await bootStartup([])
    expect(values).toEqual(BASE)
    expect(observed.runnerConfig).toMatchObject({ sessionId: '', initialTask: '' })
    expect(observed.exits).toEqual([])
  })

  it('carries --session and --task into the runner config', async () => {
    const { values, observed } = await bootStartup(['--session', 'abc', '--task', 'recon the target'])
    const expected = { ...BASE, sessionId: 'abc', initialTask: 'recon the target' }
    expect(values).toEqual(expected)
    expect(observed.runnerConfig).toMatchObject({ sessionId: 'abc', initialTask: 'recon the target' })
    expect(observed.exits).toEqual([])
  })

  it('carries --provider, --model and --check into the runner config', async () => {
    const { values, observed } = await bootStartup(['--provider', 'kiro', '--model', 'claude-opus-4.8', '--check'])
    const expected = { ...BASE, provider: 'kiro', model: 'claude-opus-4.8', check: true }
    expect(values).toEqual(expected)
    expect(observed.runnerConfig).toMatchObject({
      sessionId: '', initialTask: '', provider: 'kiro', model: 'claude-opus-4.8', check: true,
    })
    expect(observed.exits).toEqual([])
  })

  it('prints its own help and leaves the runner pending', async () => {
    const { values, observed } = await bootStartup(['--help'])
    expect(observed.out).toContain('dsh --profile tui')
    expect(values).toBeUndefined()
    expect(observed.runnerConfig).toBeUndefined()
    expect(observed.exits).toEqual([0])
  })
})