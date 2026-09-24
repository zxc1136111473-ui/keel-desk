import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, cp, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = dirname(dirname(pluginRoot))
const outDir = join(pluginRoot, 'lib')
const clientId = '@deepseek-ai/dsh-desktop-manager'

const esbuildCandidates = [
  join(repositoryRoot, 'harness', 'node_modules', '.bin', 'esbuild'),
  '/tmp/package/bin/esbuild',
]
const esbuildPath = esbuildCandidates.find(p => existsSync(p))
if (!esbuildPath) throw new Error('esbuild not found')


function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)))
  })
}

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
await copyFile(join(pluginRoot, 'src', 'index.mjs'), join(outDir, 'index.mjs'))
await copyFile(join(pluginRoot, 'src', 'reverify.mjs'), join(outDir, 'reverify.mjs'))
await copyFile(join(pluginRoot, 'src', 'reverify-bridge.py'), join(outDir, 'reverify-bridge.py'))
await copyFile(join(pluginRoot, 'src', 'pentagi.mjs'), join(outDir, 'pentagi.mjs'))
await copyFile(join(pluginRoot, 'src', 'pentagi-runtime.mjs'), join(outDir, 'pentagi-runtime.mjs'))
await copyFile(join(pluginRoot, 'src', 'pentagi-providers.mjs'), join(outDir, 'pentagi-providers.mjs'))
// pentagi-runtime/pentagi-providers import it; omitting the copy breaks the
// whole Host plugin with ERR_MODULE_NOT_FOUND on load.
await copyFile(join(pluginRoot, 'src', 'harness-credentials.mjs'), join(outDir, 'harness-credentials.mjs'))
await copyFile(join(pluginRoot, 'src', 'embedder-server.py'), join(outDir, 'embedder-server.py'))
// 冷咖啡五个 profile 提示词是 host 端运行时资源（lib/index.mjs 相对路径读取）。
await cp(join(pluginRoot, 'src', 'profiles'), join(outDir, 'profiles'), { recursive: true })
// Vendored Reverify 0.9.0：纯 Python 核心，host 用系统/venv Python 直接调。
await cp(join(pluginRoot, 'vendor', 'reverify'), join(outDir, 'vendor', 'reverify'), { recursive: true })

const client = join(outDir, 'client.js')
await run(esbuildPath, [
  join(pluginRoot, 'src', 'client.tsx'),
  '--outfile=' + client,
  '--bundle',
  '--format=cjs',
  '--platform=browser',
  '--target=chrome105,safari15',
  '--jsx=automatic',
  '--sourcemap',
  // 样式以文本形式打进 bundle，由插件自己插入 <style>：这个 bundle 是单文件
  // 交付的，没有旁路 CSS 的加载入口。
  '--loader:.css=text',
  '--external:react',
  '--external:react/jsx-runtime',
  '--external:@deepseek-ai/cordis',
  '--external:@deepseek-ai/dsh-client-ui-primitives',
  '--banner:js=window.__ModuleLoader__.load({ id: ' + JSON.stringify(clientId) + ', factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  '--footer:js=return module.exports; } });',
  '--define:process.env.NODE_ENV="production"',
])

console.log(`[dsh-desktop-manager] Built Host and browser bundles in ${outDir}`)
