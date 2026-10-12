// dsh-rea — HOST half. Mounts the REA reverse-engineering MCP server through
// @deepseek-ai/dsh-mcp-client so the model sees the full REA tool catalog as
// mcp__rea__<name> native tools (170+ tools: analyze_function, inspect_artifact,
// recover_javascript_sources, trace_call_path, ...).
//
// The REA runtime is vendored into lib/rea-runtime by scripts/build.mjs
// (npm-installed rea-agents package + its dependency tree). This Host half
// only resolves that runtime and delegates transport, discovery, tool
// registration and reconnect to the official MCP client bridge.

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as mcpClient from '@deepseek-ai/dsh-mcp-client'

export const name = 'dsh-rea'
export const inject = ['tools']

const SERVER_NAME = 'rea'

// After build the Host half is <pkg>/lib/index.mjs and the vendored runtime is
// <pkg>/lib/rea-runtime/node_modules/rea-agents/scripts/rea.mjs. When the whole
// plugin tree is copied (legacy layout) the entry is <pkg>/src/index.mjs and the
// runtime sits under <pkg>/runtime. Probe both.
function runtimeCli() {
  const here = fileURLToPath(import.meta.url)
  const sep = process.platform === 'win32' ? '\\' : '/'
  const inSrc = here.includes(`${sep}src${sep}`)
  const candidates = inSrc
    ? [join(dirname(dirname(here)), 'runtime', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs')]
    : [
      join(dirname(here), 'rea-runtime', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs'),
      join(dirname(dirname(dirname(here))), 'rea-runtime', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs'),
    ]
  return candidates.find(existsSync)
}

export async function apply(ctx) {
  const cli = runtimeCli()
  if (!cli) {
    ctx.logger?.warn?.(
      '[dsh-rea] REA runtime not found; run "pnpm run plugin:build" in the desktop repo to vendor rea-agents into lib/rea-runtime',
    )
    return
  }
  const cwd = dirname(dirname(dirname(cli)))
  ctx.logger?.info?.(`[dsh-rea] mounting REA MCP server (${SERVER_NAME}) at ${cli}`)
  await ctx.plugin(mcpClient, {
    serverName: SERVER_NAME,
    transport: 'stdio',
    command: process.execPath,
    args: [cli, 'mcp'],
    cwd,
    toolCallTimeoutMs: 300_000,
    failOnStartupError: false,
  })
}
