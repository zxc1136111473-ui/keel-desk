import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const pluginRoot = join(dirname(dirname(fileURLToPath(import.meta.url))))
const libEntry = join(pluginRoot, 'lib', 'index.mjs')
const reaCli = join(pluginRoot, 'lib', 'rea-runtime', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs')
const reaDist = join(pluginRoot, 'lib', 'rea-runtime', 'node_modules', 'rea-agents', 'dist', 'main.js')
const reaRoot = join(pluginRoot, 'lib', 'rea-runtime', 'node_modules', 'rea-agents')

test('Host entry is built with the cordis plugin shape', async () => {
  assert.ok(existsSync(libEntry), 'lib/index.mjs must exist after build')
  const source = await readFile(libEntry, 'utf8')
  assert.match(source, /export const name = 'dsh-rea'/)
  assert.match(source, /export const inject = \['tools'\]/)
  assert.match(source, /export function apply/)
  assert.match(source, /@deepseek-ai\/dsh-mcp-client/)
  assert.match(source, /serverName:/)
})

test('REA runtime is vendored into lib/rea-runtime', () => {
  assert.ok(existsSync(reaCli), `REA CLI missing: ${reaCli}`)
  assert.ok(existsSync(reaDist), `REA dist missing: ${reaDist}`)
})

test('REA MCP server starts and stays alive on stdio', async () => {
  const { spawn } = await import('node:child_process')
  const child = spawn(process.execPath, [reaCli, 'mcp'], { cwd: reaRoot })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.stdout.on('data', () => {})
  await new Promise((resolve) => setTimeout(resolve, 4000))
  assert.ok(
    child.exitCode === null || child.exitCode === undefined,
    `REA MCP exited early: ${stderr.slice(0, 500)}`,
  )
  child.kill()
  await new Promise((resolve) => setTimeout(resolve, 300))
})
