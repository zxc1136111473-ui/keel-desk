// Build dsh-rea: copy the Host ESM entry verbatim and vendor the REA runtime
// (rea-agents npm package + its dependency tree) into lib/rea-runtime so the
// Host half can spawn `rea mcp` with no global install. The runtime directory
// is intentionally NOT committed (see .gitignore); it is (re)created here on
// every build when missing.
import { spawnSync } from 'node:child_process'
import { access, cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(pluginRoot, 'lib')
const runtimeDir = join(outDir, 'rea-runtime')
const runtimeMarker = join(runtimeDir, 'node_modules', 'rea-agents', 'dist', 'main.js')
const REA_VERSION = process.env.REA_VERSION ?? '6.4.0'

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function npmCommand() {
  // Prefer npm from the active Node install / PATH, then common Homebrew spot.
  const candidates = ['/opt/homebrew/bin/npm', '/usr/local/bin/npm', 'npm']
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' })
    if (probe.status === 0) return candidate
  }
  throw new Error('npm is required to vendor the REA runtime; install Node.js and retry')
}

async function vendorRuntime() {
  if (await pathExists(runtimeMarker)) {
    console.log(`[dsh-rea] REA runtime already vendored at ${runtimeDir}`)
    return
  }
  console.log(`[dsh-rea] Vendoring rea-agents@${REA_VERSION} into ${runtimeDir} …`)
  const npm = npmCommand()
  const result = spawnSync(npm, ['install', `rea-agents@${REA_VERSION}`, '--prefix', runtimeDir, '--no-audit', '--no-fund'], {
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`[dsh-rea] npm install rea-agents failed (status ${result.status}; ${result.error?.message ?? ''})`)
  }
  if (!(await pathExists(runtimeMarker))) {
    throw new Error(`[dsh-rea] rea-agents install did not produce ${runtimeMarker}`)
  }
  // npm --prefix leaves a stray package.json + lock at the runtime root; keep
  // only the node_modules tree to keep the vendored footprint tidy.
  for (const name of ['package.json', 'package-lock.json']) {
    const p = join(runtimeDir, name)
    if (await pathExists(p)) await rm(p, { force: true })
  }
  console.log('[dsh-rea] REA runtime vendored OK')
}

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
await cp(join(pluginRoot, 'src', 'index.mjs'), join(outDir, 'index.mjs'))
console.log('[dsh-rea] Copied Host entry to lib/index.mjs')

await vendorRuntime()

const runtimeSize = await stat(runtimeDir)
console.log(`[dsh-rea] Built Host + runtime in ${outDir} (${(runtimeSize.size / 1024 / 1024).toFixed(1)} MiB)`)
