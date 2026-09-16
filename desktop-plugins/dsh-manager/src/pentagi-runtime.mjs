import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import https from 'node:https'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'

const here = dirname(fileURLToPath(import.meta.url))

const EXTRA_PATH = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/Applications/Docker.app/Contents/Resources/bin',
  'C:\\Program Files\\Docker\\Docker\\resources\\bin',
  'C:\\Program Files\\Docker\\Docker\\resources',
  join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'resources', 'bin'),
  join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker'),
  join(process.env.LOCALAPPDATA || '', 'Docker', 'resources', 'bin'),
  join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps'),
  join(process.env.SystemRoot || 'C:\\Windows', 'System32'),
  join(process.env.SystemRoot || 'C:\\Windows', 'SysWOW64'),
]
const DEFAULT_PENTEST_IMAGE = 'vxcontrol/kali-linux'
const DEFAULT_ADMIN = 'admin@pentagi.com'
const DEFAULT_PASSWORD = 'admin'
const LOCAL_PASSWORD = 'DshPentagi1!'
const DEFAULT_PORT = 8443
const LOCAL_EMBED_PORT = 63229
const LOCAL_EMBED_MODEL = 'BAAI/bge-small-en-v1.5'

function readPentagiSettings(env = process.env) {
  try {
    const settings = JSON.parse(readFileSync(join(userHome(env), 'desktop-settings.json'), 'utf8'))
    return settings?.coldbrew?.pentagi ?? {}
  } catch {
    return {}
  }
}

export function pentagiListenPort(env = process.env) {
  const fromEnv = Number(env.PENTAGI_LISTEN_PORT || env.DSH_PENTAGI_PORT)
  if (fromEnv >= 1 && fromEnv <= 65535) return fromEnv
  const saved = Number(readPentagiSettings(env).port)
  if (saved >= 1 && saved <= 65535) return saved
  return DEFAULT_PORT
}

export function pentagiApiUrl(env = process.env) {
  const fromEnv = String(env.DSH_PENTAGI_URL ?? env.PENTAGI_URL ?? '').trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const saved = String(readPentagiSettings(env).url ?? '').trim()
  if (saved) return saved.replace(/\/$/, '')
  return `https://127.0.0.1:${pentagiListenPort(env)}`
}

export function pentagiStopOnExit(env = process.env) {
  const v = readPentagiSettings(env).stopOnExit
  return v !== false
}

export function pentagiSandboxEnabled(env = process.env) {
  if (String(env.DSH_PENTAGI_SANDBOX ?? '') === '1') return true
  if (String(env.DSH_PENTAGI_SANDBOX ?? '') === '0') return false
  return readPentagiSettings(env).sandbox !== false
}

export function pentagiDindEnabled(env = process.env) {
  if (String(env.DSH_PENTAGI_DIND ?? '') === '1') return true
  if (String(env.DSH_PENTAGI_DIND ?? '') === '0') return false
  return readPentagiSettings(env).dind === true
}

/** Colima/Linux VM 内的 docker.sock。挂进 Kali 才能让容器里的 docker CLI 说话。macOS 转发 sock 对不上。 */
export function dockerSocketInVm() {
  return '/var/run/docker.sock'
}

function API_URL(env = process.env) {
  return pentagiApiUrl(env)
}

function userHome(env = process.env) {
  const configured = String(env.DSH_HOME ?? '').trim()
  if (!configured) return join(homedir(), '.dsh')
  return resolve(configured)
}

function dockerHost(env = process.env) {
  if (env.DOCKER_HOST) return env.DOCKER_HOST
  const colimaSock = join(homedir(), '.colima/default/docker.sock')
  if (existsSync(colimaSock)) return `unix://${colimaSock}`
  const desktopSock = join(homedir(), '.docker/run/docker.sock')
  if (existsSync(desktopSock)) return `unix://${desktopSock}`
  return env.DOCKER_HOST
}

function spawnEnv(env = process.env) {
  const sep = process.platform === 'win32' ? ';' : ':'
  const path = [...EXTRA_PATH, env.PATH ?? process.env.PATH ?? ''].filter(Boolean).join(sep)
  const host = dockerHost(env)
  return { ...env, PATH: path, ...(host ? { DOCKER_HOST: host } : {}) }
}

function which(bin, env = process.env) {
  const sep = process.platform === 'win32' ? ';' : ':'
  const names = process.platform === 'win32' && !/\.[A-Za-z0-9]+$/.test(bin)
    ? [`${bin}.exe`, `${bin}.cmd`, `${bin}.bat`, bin]
    : [bin]
  const dirs = [...EXTRA_PATH, ...(spawnEnv(env).PATH.split(sep))]
  for (const dir of dirs) {
    if (!dir) continue
    for (const name of names) {
      const p = join(dir, name)
      if (existsSync(p)) return p
    }
  }
  return names[0]
}

function run(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000
  const onLog = options.onLog
  return new Promise((resolvePromise) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.rawEnv ? options.env : spawnEnv(options.env ?? process.env),
      shell: false,
    })
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolvePromise({ ok: false, code: -1, stdout, stderr: `${stderr}\ntimed out after ${timeoutMs}ms`.trim() })
    }, timeoutMs)
    const take = (chunk, sink) => {
      const text = chunk.toString()
      if (sink === 'out') stdout += text
      else stderr += text
      const line = text.trim()
      if (line) onLog?.(line)
    }
    child.stdout?.on('data', chunk => take(chunk, 'out'))
    child.stderr?.on('data', chunk => take(chunk, 'err'))
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ ok: false, code: -1, stdout, stderr: error.message })
    })
    child.once('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ ok: code === 0, code: code ?? 1, stdout, stderr })
    })
  })
}

function pentagiRoot(env = process.env) {
  const candidates = [
    env.DSH_PENTAGI_ROOT,
    join(userHome(env), 'pentagi-src'),
    resolve(process.cwd(), 'vendor/pentagi'),
    resolve(here, '../../../../vendor/pentagi'),
  ].filter(Boolean)
  for (const dir of candidates) {
    if (existsSync(join(dir, 'docker-compose.yml'))) return dir
  }
  return join(userHome(env), 'pentagi-src')
}

function insecureHttpsRequest(url, init = {}) {
  return new Promise((resolvePromise, reject) => {
    const u = new URL(url)
    const headers = { ...(init.headers ?? {}) }
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: `${u.pathname}${u.search}`,
      method: init.method || 'GET',
      headers,
      rejectUnauthorized: false,
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        const headersMap = new Map(Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : String(v ?? '')]))
        const getSetCookie = () => {
          const raw = res.headers['set-cookie']
          return Array.isArray(raw) ? raw : raw ? [raw] : []
        }
        resolvePromise({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          headers: {
            get: (name) => headersMap.get(String(name).toLowerCase()) ?? null,
            getSetCookie,
          },
          text: async () => buf.toString('utf8'),
          json: async () => JSON.parse(buf.toString('utf8')),
        })
      })
    })
    req.on('error', reject)
    if (init.body) req.write(init.body)
    req.end()
  })
}

async function insecureFetch(url, init = {}) {
  if (/^https:\/\/(127\.0\.0\.1|localhost)\b/i.test(url)) {
    return insecureHttpsRequest(url, init)
  }
  return fetch(url, init)
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function absorbSetCookie(jar, response) {
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean)
  for (const line of raw) {
    const pair = String(line).split(';')[0]
    const eq = pair.indexOf('=')
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
}

function readCredentials(env = process.env) {
  const file = join(userHome(env), '.credentials.yaml')
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+):\s*(.+)\s*$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function colimaSock() {
  return join(homedir(), '.colima/default/docker.sock')
}

function ensureEnvFile(root, env = process.env) {
  const dest = join(root, '.env')
  const example = join(root, '.env.example')
  if (!existsSync(dest) && existsSync(example)) copyFileSync(example, dest)
  const creds = readCredentials(env)
  const deepseek = creds.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY || ''
  let text = existsSync(dest) ? readFileSync(dest, 'utf8') : ''
  const set = (key, value) => {
    if (value === undefined || value === null) return
    const re = new RegExp(`^${key}=.*$`, 'm')
    if (re.test(text)) text = text.replace(re, `${key}=${value}`)
    else text += `\n${key}=${value}\n`
  }
  const port = pentagiListenPort(env)
  set('PUBLIC_URL', `https://127.0.0.1:${port}`)
  set('SERVER_USE_SSL', 'true')
  set('PENTAGI_LISTEN_PORT', String(port))
  set('PENTAGI_LISTEN_IP', '127.0.0.1')
  // default 'salt' disables API token creation (see schema.resolvers.go)
  if (!/^COOKIE_SIGNING_SALT=(?!salt\b).+/m.test(text)) {
    set('COOKIE_SIGNING_SALT', 'dsh-pentagi-' + Math.random().toString(36).slice(2) + Date.now().toString(36))
  }
  // Inside the pentagi container the socket is always /var/run/docker.sock
  // (compose bind-mounts the host sock there). Never leak the host DOCKER_HOST.
  set('DOCKER_HOST', 'unix:///var/run/docker.sock')
  set('DOCKER_SOCKET', '/var/run/docker.sock')
  // colima 容器必须挂 VM 内 /var/run/docker.sock，不能挂 macOS 上的转发 sock。
  set('PENTAGI_DOCKER_SOCKET', '/var/run/docker.sock')
  // Official primary terminal defaults to debian:latest; pin Kali so specialists get nmap.
  if (!/^DOCKER_DEFAULT_IMAGE=\S+/m.test(text) || /^DOCKER_DEFAULT_IMAGE=\s*$/m.test(text)) {
    set('DOCKER_DEFAULT_IMAGE', DEFAULT_PENTEST_IMAGE)
  }
  if (!/^DOCKER_DEFAULT_IMAGE_FOR_PENTEST=\S+/m.test(text) || /^DOCKER_DEFAULT_IMAGE_FOR_PENTEST=\s*$/m.test(text)) {
    set('DOCKER_DEFAULT_IMAGE_FOR_PENTEST', DEFAULT_PENTEST_IMAGE)
  }
  if (!/^DOCKER_NET_ADMIN=\S+/m.test(text) || /^DOCKER_NET_ADMIN=\s*$/m.test(text)) {
    set('DOCKER_NET_ADMIN', 'true')
  }
  if (deepseek) {
    set('DEEPSEEK_API_KEY', deepseek)
    set('LLM_SERVER_URL', 'https://api.deepseek.com')
    set('LLM_SERVER_KEY', deepseek)
    set('LLM_SERVER_PROVIDER', 'openai')
    set('LLM_SERVER_MODEL', 'deepseek-chat')
  }
  if (!/^SCRAPER_PRIVATE_URL=https?:\/\/\S+/m.test(text)) {
    set('SCRAPER_PRIVATE_URL', 'https://someuser:somepass@scraper/')
  }
  if (!/^SCRAPER_PUBLIC_URL=https?:\/\/\S+/m.test(text)) {
    set('SCRAPER_PUBLIC_URL', 'https://someuser:somepass@host.docker.internal:9443/')
  }
  set('LOCAL_SCRAPER_USERNAME', 'someuser')
  set('LOCAL_SCRAPER_PASSWORD', 'somepass')
  mkdirSync(root, { recursive: true })
  writeFileSync(dest, text)
  return dest
}

export function pentagiEnvPath(env = process.env) {
  return join(pentagiRoot(env), '.env')
}

export function writePentagiEnvText(text, env = process.env) {
  const dest = pentagiEnvPath(env)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, text)
  return dest
}

function composeEnv(env = process.env) {
  const next = spawnEnv(env)
  // Host CLI must reach the daemon via docker context (colima), NOT a hardcoded
  // DOCKER_HOST: /var/run/docker.sock on macOS is a broken Docker Desktop
  // symlink, and compose interpolates DOCKER_HOST into the pentagi service
  // where it must stay unix:///var/run/docker.sock (the VM socket bind-mounted
  // inside the container). Drop it so the CLI uses context and .env drives the
  // container value.
  delete next.DOCKER_HOST
  next.PENTAGI_DOCKER_SOCKET = '/var/run/docker.sock'
  return next
}

export function hostArch() {
  const a = process.arch
  if (a === 'arm64' || a === 'aarch64') return 'arm64'
  return 'amd64'
}

function brewBin(env = process.env) {
  return which('brew', env)
}

function dockerDesktopApp() {
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files'
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    return [
      join(pf, 'Docker', 'Docker', 'Docker Desktop.exe'),
      join(pf86, 'Docker', 'Docker', 'Docker Desktop.exe'),
    ].find(p => existsSync(p)) || join(pf, 'Docker', 'Docker', 'Docker Desktop.exe')
  }
  return '/Applications/Docker.app'
}

function dockerDesktopInstalled() {
  const app = dockerDesktopApp()
  if (process.platform === 'win32') return existsSync(app)
  return existsSync(app)
}

function dockerInstallerUrls() {
  const arch = hostArch() === 'arm64' ? 'arm64' : 'amd64'
  return [
    `https://desktop.docker.com/win/main/${arch}/Docker%20Desktop%20Installer.exe`,
    `https://desktop.docker.com/win/main/${arch}/Docker Desktop Installer.exe`,
  ]
}

function downloadWithHttps(url, dest, onLog) {
  mkdirSync(dirname(dest), { recursive: true })
  onLog(`下载 ${url}`)
  return new Promise((resolvePromise, reject) => {
    const follow = (current, hops) => {
      if (hops > 8) {
        reject(new Error('too many redirects'))
        return
      }
      const req = https.get(current, {
        headers: { 'User-Agent': 'DeepSeek-Harness-Desktop/1.0.2' },
      }, (res) => {
        const loc = res.headers.location
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc) {
          res.resume()
          follow(new URL(loc, current).href, hops + 1)
          return
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const out = createWriteStream(dest)
        pipeline(res, out).then(() => {
          const size = existsSync(dest) ? statSync(dest).size : 0
          onLog(`已写入 ${dest} (${(size / 1024 / 1024).toFixed(1)} MiB)`)
          resolvePromise(dest)
        }).catch(reject)
      })
      req.setTimeout(10 * 60_000, () => {
        req.destroy(new Error('download timed out'))
      })
      req.on('error', reject)
    }
    follow(url, 0)
  })
}

async function downloadFile(url, dest, onLog) {
  try {
    return await downloadWithHttps(url, dest, onLog)
  } catch (httpsError) {
    onLog(`https 下载失败（${httpsError?.message ?? httpsError}），改用 curl…`)
  }
  const curl = which('curl', process.env)
  const curlRun = await run(curl, ['-L', '--fail', '--retry', '3', '-A', 'DeepSeek-Harness-Desktop/1.0.2', '-o', dest, url], {
    timeoutMs: 15 * 60_000,
    onLog,
  })
  if (curlRun.ok && existsSync(dest) && statSync(dest).size > 1024 * 1024) {
    onLog(`curl 已写入 ${dest}`)
    return dest
  }
  throw new Error(curlRun.stderr || 'https and curl download both failed')
}

async function downloadFileWithPowershell(url, dest, onLog, env) {
  mkdirSync(dirname(dest), { recursive: true })
  onLog(`PowerShell 下载 ${url}`)
  const ps = which('powershell', env)
  const script = `try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${url.replace(/'/g, "''")}' -OutFile '${dest.replace(/'/g, "''")}' -UseBasicParsing } catch { Write-Error $_; exit 1 }`
  const downloaded = await run(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    timeoutMs: 15 * 60_000,
    env,
    onLog,
  })
  if (downloaded.ok && existsSync(dest) && statSync(dest).size > 1024 * 1024) {
    onLog(`PowerShell 已写入 ${dest} (${(statSync(dest).size / 1024 / 1024).toFixed(1)} MiB)`)
    return dest
  }
  throw new Error(downloaded.stderr || downloaded.stdout || 'powershell download failed')
}

async function installWindowsDockerWithWinget(onLog, env) {
  const winget = which('winget', env)
  if (!existsSync(winget)) return { ok: false, error: 'winget not found' }
  onLog(`$ ${winget} install Docker.DockerDesktop`)
  const args = [
    'install', '-e', '--id', 'Docker.DockerDesktop',
    '--accept-package-agreements', '--accept-source-agreements',
    '--disable-interactivity',
  ]
  let installed = await run(winget, [...args, '--silent'], { timeoutMs: 20 * 60_000, env, onLog })
  if (!installed.ok && !dockerDesktopInstalled()) {
    onLog('winget --silent 失败，去掉 silent 再试…')
    installed = await run(winget, args, { timeoutMs: 20 * 60_000, env, onLog })
  }
  if (installed.ok || dockerDesktopInstalled()) return { ok: true, via: 'winget' }
  const detail = (installed.stderr || installed.stdout || 'winget install failed').slice(-800)
  return { ok: false, error: detail }
}

async function installWindowsDockerWithChoco(onLog, env) {
  const choco = which('choco', env)
  if (!existsSync(choco)) return { ok: false, error: 'choco not found' }
  onLog('$ choco install docker-desktop -y')
  const installed = await run(choco, ['install', 'docker-desktop', '-y', '--no-progress'], { timeoutMs: 20 * 60_000, env, onLog })
  if (installed.ok || dockerDesktopInstalled()) return { ok: true, via: 'choco' }
  return { ok: false, error: installed.stderr || installed.stdout || 'choco install failed' }
}

async function installWindowsDockerFromInstaller(onLog, env) {
  const installer = join(userHome(env), 'pentagi', 'DockerDesktopInstaller.exe')
  let lastError = 'no installer url'
  for (const url of dockerInstallerUrls()) {
    try {
      await downloadFile(url, installer, onLog)
      lastError = ''
      break
    } catch (error) {
      lastError = String(error?.message ?? error)
      onLog(`下载失败：${lastError}`)
      try {
        await downloadFileWithPowershell(url, installer, onLog, env)
        lastError = ''
        break
      } catch (psError) {
        lastError = String(psError?.message ?? psError)
        onLog(`PowerShell 下载失败：${lastError}`)
      }
    }
  }
  if (lastError || !existsSync(installer) || statSync(installer).size < 1024 * 1024) {
    return { ok: false, error: `下载 Docker Desktop 失败：${lastError}` }
  }
  onLog('正在静默安装 Docker Desktop（需要本机管理员权限，可能弹出 UAC）…')
  const installed = await run(installer, ['install', '--quiet', '--accept-license'], { timeoutMs: 20 * 60_000, env, onLog })
  if (installed.ok || dockerDesktopInstalled()) return { ok: true, via: 'installer' }
  onLog('静默安装失败，改用交互安装…')
  const interactive = await run(installer, ['install', '--accept-license'], { timeoutMs: 20 * 60_000, env, onLog })
  if (interactive.ok || dockerDesktopInstalled()) return { ok: true, via: 'installer-ui' }
  return { ok: false, error: interactive.stderr || installed.stderr || 'Docker Desktop installer failed' }
}

async function installWindowsDockerDesktop(onLog, env) {
  const winget = await installWindowsDockerWithWinget(onLog, env)
  if (winget.ok) return winget
  onLog(`winget 不可用：${winget.error}`)
  const choco = await installWindowsDockerWithChoco(onLog, env)
  if (choco.ok) return choco
  onLog(`chocolatey 不可用：${choco.error}`)
  const fromFile = await installWindowsDockerFromInstaller(onLog, env)
  if (fromFile.ok) return fromFile
  onLog('自动下载失败，打开 Docker Desktop 官网安装页…')
  spawn('cmd.exe', ['/c', 'start', '', 'https://www.docker.com/products/docker-desktop/'], {
    detached: true,
    stdio: 'ignore',
    env: spawnEnv(env),
  }).unref()
  return {
    ok: false,
    error: `${fromFile.error}。已打开官网，装完 Docker Desktop 并等到托盘绿灯后，再点一次「安装 Docker 依赖」。`,
  }
}

async function startWindowsDockerDesktop(onLog, env) {
  const app = dockerDesktopApp()
  if (!existsSync(app)) return { ok: false, error: 'Docker Desktop.exe not found after install' }
  onLog(`启动 Docker Desktop：${app}`)
  spawn(app, [], { detached: true, stdio: 'ignore', env: spawnEnv(env) }).unref()
  return { ok: true }
}

export async function probeDockerStack(env = process.env) {
  const docker = which('docker', env)
  const colima = which('colima', env)
  const brew = brewBin(env)
  const dockerCli = existsSync(docker)
  const colimaCli = existsSync(colima)
  const brewOk = existsSync(brew)
  const desktop = dockerDesktopInstalled()
  const version = dockerCli ? await run(docker, ['--version'], { timeoutMs: 5_000, env }) : { ok: false }
  const daemon = dockerCli ? await run(docker, ['info'], { timeoutMs: 8_000, env }) : { ok: false }
  const images = {}
  if (daemon.ok) {
    for (const name of ['vxcontrol/kali-linux', 'vxcontrol/pentagi:latest', 'vxcontrol/pgvector:latest', 'vxcontrol/scraper:latest']) {
      const inspect = await run(docker, ['image', 'inspect', name, '--format', '{{.Os}}/{{.Architecture}}'], { timeoutMs: 8_000, env })
      images[name] = inspect.ok ? inspect.stdout.trim() : ''
    }
  }
  return {
    os: process.platform,
    arch: hostArch(),
    dockerCli,
    dockerBin: dockerCli ? docker : '',
    colimaCli,
    brew: brewOk,
    dockerDesktop: desktop,
    daemon: daemon.ok,
    version: version.ok ? version.stdout.trim() : '',
    images,
    ready: dockerCli && daemon.ok,
  }
}

async function installBrewPackages(packages, onLog, env) {
  const brew = brewBin(env)
  if (brew === 'brew' || !existsSync(brew)) {
    return { ok: false, error: 'Homebrew 未安装。请先安装 https://brew.sh 或安装 Docker Desktop。' }
  }
  onLog(`$ brew install ${packages.join(' ')}  (${hostArch()})`)
  const installed = await run(brew, ['install', ...packages], { timeoutMs: 15 * 60_000, env, onLog })
  if (!installed.ok) {
    const upgraded = await run(brew, ['upgrade', ...packages], { timeoutMs: 15 * 60_000, env, onLog })
    if (!upgraded.ok) return { ok: false, error: installed.stderr || upgraded.stderr || 'brew install failed' }
  }
  return { ok: true }
}

async function startColima(onLog, env) {
  const colima = which('colima', env)
  const arch = hostArch() === 'arm64' ? 'aarch64' : 'x86_64'
  const args = ['start', '--arch', arch]
  if (process.platform === 'darwin' && hostArch() === 'arm64') args.push('--vm-type', 'vz')
  onLog(`$ colima ${args.join(' ')}`)
  const started = await run(colima, args, { timeoutMs: 8 * 60_000, env, onLog })
  if (started.ok) return started
  onLog('指定参数启动失败，改用 colima start 默认配置…')
  return run(colima, ['start'], { timeoutMs: 8 * 60_000, env, onLog })
}

async function pullPentagiImages(docker, onLog, env) {
  const names = ['vxcontrol/kali-linux', 'vxcontrol/pentagi:latest', 'vxcontrol/pgvector:latest', 'vxcontrol/scraper:latest']
  const results = []
  for (const name of names) {
    onLog(`$ docker pull --platform linux/${hostArch()} ${name}`)
    const pulled = await run(docker, ['pull', '--platform', `linux/${hostArch()}`, name], { timeoutMs: 20 * 60_000, env, onLog })
    results.push({ name, ok: pulled.ok, error: pulled.ok ? undefined : (pulled.stderr || pulled.stdout || '').split('\n').pop() })
    if (!pulled.ok) onLog(`pull ${name} 失败：${results.at(-1).error}`)
  }
  return results
}

export async function installDockerStack(onLog = () => {}, env = process.env, { pullImages = true } = {}) {
  onLog(`本机 ${process.platform}/${hostArch()}，开始检查 Docker…`)
  let stack = await probeDockerStack(env)
  if (stack.ready) {
    onLog('Docker daemon 已就绪')
    const docker = stack.dockerBin
    const images = pullImages ? await pullPentagiImages(docker, onLog, env) : []
    return { ok: true, installed: false, stack: await probeDockerStack(env), images }
  }

  if (process.platform === 'win32') {
    if (!stack.dockerDesktop) {
      const installed = await installWindowsDockerDesktop(onLog, env)
      if (!installed.ok) return { ...installed, stack: await probeDockerStack(env) }
    }
    stack = await probeDockerStack(env)
    if (!stack.daemon) {
      const started = await startWindowsDockerDesktop(onLog, env)
      if (!started.ok) return { ...started, stack: await probeDockerStack(env) }
    }
    const docker = which('docker', env)
    const info = await waitForDocker(docker, env, onLog, 240_000)
    if (!info.ok) {
      return {
        ok: false,
        error: 'Docker Desktop 已安装/已尝试启动，但引擎还没起来。请在托盘等到 Docker 绿灯后，再点一次「安装 Docker 依赖」。',
        stack: await probeDockerStack(env),
      }
    }
    onLog('Docker daemon 已通')
    const images = pullImages ? await pullPentagiImages(docker, onLog, env) : []
    return { ok: true, installed: true, stack: await probeDockerStack(env), images }
  }

  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return { ok: false, error: `暂不自动安装 ${process.platform} 上的 Docker，请手动安装 Docker Desktop / 引擎。`, stack }
  }

  if (!stack.dockerCli || !stack.colimaCli) {
    const pkgs = []
    if (!stack.dockerCli) pkgs.push('docker')
    if (!stack.colimaCli && !stack.dockerDesktop) pkgs.push('colima')
    if (pkgs.length) {
      const brew = await installBrewPackages(pkgs, onLog, env)
      if (!brew.ok && !stack.dockerDesktop) return { ...brew, stack }
    }
  }

  if (stack.dockerDesktop && !stack.daemon) {
    onLog('发现 Docker Desktop，正在打开…')
    await run('open', ['-a', 'Docker'], { timeoutMs: 15_000, env, onLog })
  } else if (!stack.daemon) {
    const colima = which('colima', env)
    if (colima === 'colima' || !existsSync(colima)) {
      return { ok: false, error: 'docker CLI 或 colima 仍未找到。请安装 Homebrew 后重试，或安装 Docker Desktop。', stack: await probeDockerStack(env) }
    }
    const status = await run(colima, ['status'], { timeoutMs: 15_000, env, onLog })
    const running = /colima is running/i.test(status.stdout + status.stderr)
    if (running) {
      onLog('colima 已 Running，执行 restart 打通 sock…')
      const restarted = await run(colima, ['restart'], { timeoutMs: 240_000, env, onLog })
      if (!restarted.ok) return { ok: false, error: restarted.stderr || 'colima restart failed', stack }
    } else {
      const started = await startColima(onLog, env)
      if (!started.ok) return { ok: false, error: started.stderr || 'colima start failed', stack }
    }
  }

  const docker = which('docker', env)
  const info = await waitForDocker(docker, env, onLog, 180_000)
  if (!info.ok) return { ok: false, error: info.stderr || 'docker still unreachable', stack: await probeDockerStack(env) }
  onLog('Docker daemon 已通')
  const images = pullImages ? await pullPentagiImages(docker, onLog, env) : []
  return { ok: true, installed: true, stack: await probeDockerStack(env), images }
}

async function waitForDocker(docker, env, onLog, timeoutMs = 90_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const info = await run(docker, ['info'], { timeoutMs: 8_000, env })
    if (info.ok) return info
    onLog?.('等待 docker.sock…')
    await new Promise(r => setTimeout(r, 2000))
  }
  return { ok: false, stderr: 'docker.sock never became ready' }
}

async function ensureDocker(onLog, env = process.env) {
  const docker = which('docker', env)
  const info = await run(docker, ['info'], { timeoutMs: 8_000, env })
  if (info.ok) return { ok: true, docker, daemon: true }
  onLog?.('Docker 未就绪，开始按本机架构安装/启动…')
  const installed = await installDockerStack(onLog, env, { pullImages: false })
  if (!installed.ok) return { ok: false, docker, daemon: false, error: installed.error }
  return { ok: true, docker: which('docker', env), daemon: true }
}

async function waitForApi(onLog, timeoutMs = 180_000, env = process.env) {
  const start = Date.now()
  const url = API_URL(env)
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await insecureFetch(url, { redirect: 'follow' })
      if (res.ok || res.status === 401 || res.status === 302 || res.status === 200) {
        onLog?.(`API 已起来 · HTTP ${res.status}`)
        return { ok: true, status: res.status }
      }
    } catch { /* still booting */ }
    await new Promise(r => setTimeout(r, 3000))
  }
  return { ok: false, error: `timed out waiting for ${url}` }
}

async function bootstrapToken(onLog, env = process.env) {
  const jar = new Map()
  const base = API_URL(env)
  const login = await insecureFetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mail: DEFAULT_ADMIN, password: DEFAULT_PASSWORD }),
  })
  absorbSetCookie(jar, login)
  const loginText = await login.text()
  onLog?.(`login ${login.status}`)
  if (login.ok && jar.size) {
    const changed = await insecureFetch(`${base}/api/v1/user/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(jar) },
      body: JSON.stringify({
        current_password: DEFAULT_PASSWORD,
        password: LOCAL_PASSWORD,
        confirm_password: LOCAL_PASSWORD,
      }),
    })
    absorbSetCookie(jar, changed)
    onLog?.(`password change ${changed.status}`)
  } else {
    const retry = await insecureFetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mail: DEFAULT_ADMIN, password: LOCAL_PASSWORD }),
    })
    absorbSetCookie(jar, retry)
    onLog?.(`login-with-local-password ${retry.status}`)
    if (!retry.ok) return { ok: false, error: `login failed: ${loginText.slice(0, 400)}` }
  }
  const minted = await insecureFetch(`${base}/api/v1/tokens/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(jar) },
    body: JSON.stringify({ name: `dsh-harness-${Date.now()}`, ttl: 94_608_000 }),
  })
  const body = await minted.json().catch(() => null)
  const token = body?.data?.token
  if (!token) return { ok: false, error: `create token failed: ${JSON.stringify(body).slice(0, 500)}`, status: minted.status }
  return { ok: true, token, password: LOCAL_PASSWORD }
}

export async function pentagiGraphql(query, variables = {}, env = process.env) {
  const cfg = readPentagiSettings(env)
  const token = String(cfg.token || env.DSH_PENTAGI_TOKEN || '')
  const url = `${API_URL(env)}/api/v1/graphql`
  if (!token) return { ok: false, error: 'missing token', url }
  const body = JSON.stringify({ query, variables })
  try {
    const res = await insecureFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* */ }
    return { ok: res.ok && !json?.errors, status: res.status, url, json, body: text.slice(0, 8000) }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), url }
  }
}

function persistToken(token, env = process.env) {
  const dest = join(userHome(env), 'desktop-settings.json')
  let settings = {}
  try { settings = JSON.parse(readFileSync(dest, 'utf8')) } catch { settings = {} }
  settings.coldbrew ??= {}
  settings.coldbrew.pentagi ??= {}
  settings.coldbrew.pentagi.token = token
  settings.coldbrew.pentagi.url = API_URL(env)
  settings.coldbrew.pentagi.port = pentagiListenPort(env)
  mkdirSync(userHome(env), { recursive: true })
  writeFileSync(dest, JSON.stringify(settings, null, 2))
  return dest
}

async function apiIsUp(env = process.env) {
  const url = API_URL(env)
  try {
    const res = await insecureFetch(url, { redirect: 'follow' })
    return { ok: res.ok || res.status === 401 || res.status === 302 || res.status === 200, url, status: res.status }
  } catch (error) {
    return { ok: false, url, error: String(error?.cause?.message ?? error?.message ?? error) }
  }
}

/**
 * First-install / expired-token path: if :8443 is already up, login and mint a
 * GraphQL Bearer into ~/.dsh/desktop-settings.json. Does not start compose
 * (that is autostart / pg_backend_start). Missing token + API down → caller stubs.
 */
export async function ensurePentagiApiToken(onLog = () => {}, env = process.env, { force = false } = {}) {
  const existing = String(readPentagiSettings(env).token || env.DSH_PENTAGI_TOKEN || '').trim()
  const probe = await apiIsUp(env)
  if (existing && !force) {
    if (!probe.ok) return { ok: true, token: existing, minted: false, api: probe, note: 'using saved token; api not probed live' }
    return { ok: true, token: existing, minted: false, api: probe }
  }
  if (!probe.ok) {
    return { ok: false, error: probe.error || `pentagi api is not reachable at ${probe.url}`, url: probe.url, api: probe }
  }
  onLog('登录默认账号并签发 GraphQL API Token…')
  const boot = await bootstrapToken(onLog, env)
  if (!boot.ok) return { ...boot, api: probe }
  persistToken(boot.token, env)
  onLog('token 已写入 ~/.dsh/desktop-settings.json')
  return { ok: true, token: boot.token, minted: true, api: probe }
}

export async function probePentagiRuntime(env = process.env) {
  const dockerBin = which('docker', env)
  const docker = await run(dockerBin, ['--version'], { timeoutMs: 5_000, env })
  const daemon = docker.ok ? await run(dockerBin, ['info'], { timeoutMs: 8_000, env }) : { ok: false }
  const root = pentagiRoot(env)
  const cfg = readPentagiSettings(env)
  const url = API_URL(env)
  let api = { ok: false, url }
  try {
    const res = await insecureFetch(url, { redirect: 'follow' })
    api = { ok: res.ok || res.status === 401 || res.status === 302, url, status: res.status }
  } catch (error) {
    api = { ok: false, url, error: String(error?.cause?.message ?? error?.message ?? error) }
  }
  const tokenPresent = Boolean(cfg.token)
  let compose = { ok: false }
  if (daemon.ok && existsSync(join(root, 'docker-compose.yml'))) {
    const ps = await run(dockerBin, ['compose', 'ps', '--format', 'json'], { cwd: root, timeoutMs: 15_000, env })
    compose = { ok: ps.ok, running: /pentagi/.test(ps.stdout), raw: ps.stdout.slice(0, 500) }
  }
  const image = pentestImage(env)
  const sandboxEnabled = pentagiSandboxEnabled(env)
  const dindEnabled = pentagiDindEnabled(env)
  let sandbox = {
    enabled: sandboxEnabled,
    ok: false,
    image,
    source: 'https://github.com/vxcontrol/kali-linux-image',
    work: join(userHome(env), 'pentagi', 'sandbox-work'),
    dind: { enabled: dindEnabled, ok: false, socket: dockerSocketInVm() },
  }
  if (daemon.ok) {
    const inspect = await run(dockerBin, ['image', 'inspect', image, '--format', '{{.Os}}/{{.Architecture}}'], { timeoutMs: 8_000, env })
    sandbox.ok = inspect.ok
    sandbox.inspect = inspect.stdout.trim() || inspect.stderr.slice(0, 400)
    sandbox.dind = {
      enabled: dindEnabled,
      ok: dindEnabled && inspect.ok,
      socket: dockerSocketInVm(),
      mode: 'colima-vm-socket',
      note: dindEnabled
        ? 'Kali 内 docker CLI 走 VM /var/run/docker.sock（开发机 DinD；不是独立加固 daemon）'
        : '关闭时 Kali 里没有 docker daemon',
    }
  }
  return {
    version: '1.0.0',
    source: 'https://github.com/vxcontrol/pentagi',
    root,
    docker: docker.ok
      ? { ok: true, version: docker.stdout.trim(), daemon: daemon.ok, bin: dockerBin }
      : { ok: false, error: docker.stderr || 'docker not found', daemon: false, bin: dockerBin },
    dockerStack: {
      os: process.platform,
      arch: hostArch(),
      brew: existsSync(brewBin(env)),
      dockerDesktop: dockerDesktopInstalled(),
      colima: existsSync(which('colima', env)),
    },
    api,
    tokenPresent,
    port: pentagiListenPort(env),
    stopOnExit: pentagiStopOnExit(env),
    autostart: cfg.autostart !== false,
    compose,
    sandbox,
    backendReady: Boolean((api.ok || compose.running) && tokenPresent),
    harnessProvider: cfg.harnessProvider || 'auto',
    embedding: {
      source: embeddingSource(cfg),
      apiUrl: String(cfg.embeddingApiUrl || ''),
      apiModel: String(cfg.embeddingApiModel || 'text-embedding-3-small'),
      hasKey: Boolean(String(cfg.embeddingApiKey || '').trim()),
      local: await probeLocalEmbed(env),
      fastembed: await probeFastembedInstalled(env).catch(() => ({ ok: false })),
      port: localEmbedPort(env),
      model: LOCAL_EMBED_MODEL,
    },
  }
}

export function embeddingSource(cfg = {}) {
  const raw = String(cfg.embeddingSource || 'none').trim()
  if (raw === 'local' || raw === 'api') return raw
  return 'none'
}

export function pentestImage(env = process.env) {
  return String(env.DOCKER_DEFAULT_IMAGE_FOR_PENTEST || env.DSH_PENTAGI_PENTEST_IMAGE || DEFAULT_PENTEST_IMAGE)
}

export function localEmbedPort(env = process.env) {
  const n = Number(env.DSH_EMBED_PORT)
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : LOCAL_EMBED_PORT
}

export function localEmbedUrl(env = process.env) {
  return `http://127.0.0.1:${localEmbedPort(env)}/v1`
}

export function localEmbedContainerUrl(env = process.env) {
  return `http://host.docker.internal:${localEmbedPort(env)}/v1`
}

async function probeLocalEmbed(env = process.env) {
  try {
    const res = await fetch(`${localEmbedUrl(env)}/health`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, status: res.status, json: await res.json().catch(() => ({})) }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

function embedderScript() {
  const src = join(here, 'embedder-server.py')
  if (existsSync(src)) return src
  return join(here, '..', 'src', 'embedder-server.py')
}

function pythonBin(env = process.env) {
  return which('python3', env)
}

function embedderVenvDir(env = process.env) {
  return join(userHome(env), 'pentagi', 'embedder-venv')
}

function embedderVenvPython(env = process.env) {
  const venv = embedderVenvDir(env)
  return process.platform === 'win32'
    ? join(venv, 'Scripts', 'python.exe')
    : join(venv, 'bin', 'python')
}

let fastembedCache = { at: 0, value: null }

export async function probeFastembedInstalled(env = process.env, { fresh = false } = {}) {
  if (!fresh && fastembedCache.value && Date.now() - fastembedCache.at < 30_000) return fastembedCache.value
  const venvPy = embedderVenvPython(env)
  const py = existsSync(venvPy) ? venvPy : pythonBin(env)
  const probe = await run(py, ['-c', 'import fastembed'], { timeoutMs: 8_000, env })
  const value = { ok: probe.ok, python: py, error: probe.ok ? undefined : (probe.stderr || probe.stdout || 'fastembed not installed') }
  fastembedCache = { at: Date.now(), value }
  return value
}

async function ensureFastembed(onLog, env = process.env) {
  const already = await probeFastembedInstalled(env)
  if (already.ok) return { ok: true, installed: false, python: already.python }
  const systemPy = pythonBin(env)
  const venvDir = embedderVenvDir(env)
  const venvPy = embedderVenvPython(env)
  mkdirSync(join(userHome(env), 'pentagi'), { recursive: true })
  if (!existsSync(venvPy)) {
    onLog(`Homebrew/系统 Python 不允许直接 pip。正在 ${venvDir} 创建独立环境…`)
    const venv = await run(systemPy, ['-m', 'venv', venvDir], { timeoutMs: 120_000, env, onLog })
    if (!venv.ok || !existsSync(venvPy)) {
      return { ok: false, python: systemPy, error: venv.stderr || venv.stdout || `failed to create venv at ${venvDir}` }
    }
  }
  onLog('本机尚未安装 fastembed，正在 venv 里 pip install（第一次大约几十秒到几分钟）…')
  const pip = await run(venvPy, ['-m', 'pip', 'install', '--upgrade', 'fastembed'], { timeoutMs: 10 * 60_000, env, onLog })
  if (!pip.ok) {
    return { ok: false, python: venvPy, error: pip.stderr || pip.stdout || 'pip install fastembed failed' }
  }
  const again = await probeFastembedInstalled(env, { fresh: true })
  if (!again.ok) return { ok: false, python: venvPy, error: 'fastembed import still failing after pip install' }
  return { ok: true, installed: true, python: again.python }
}

function embedderLogPath(env = process.env) {
  return join(userHome(env), 'pentagi', 'embedder.log')
}

export async function ensureLocalEmbedder(onLog = () => {}, env = process.env) {
  const live = await probeLocalEmbed(env)
  if (live.ok) return { ok: true, started: false, url: localEmbedUrl(env), containerUrl: localEmbedContainerUrl(env), model: LOCAL_EMBED_MODEL }
  const script = embedderScript()
  if (!existsSync(script)) return { ok: false, error: `missing ${script}` }
  const deps = await ensureFastembed(onLog, env)
  if (!deps.ok) return { ok: false, error: deps.error || 'python3 / fastembed missing' }
  const py = deps.python
  mkdirSync(join(userHome(env), 'pentagi'), { recursive: true })
  const logFile = embedderLogPath(env)
  const logFd = { write: (line) => { try { writeFileSync(logFile, `${new Date().toISOString()} ${line}\n`, { flag: 'a' }) } catch { /* ignore */ } } }
  onLog('正在启动本机向量服务；第一次会下载约 270MB 模型，请等健康检查通过…')
  const child = spawn(py, [script], {
    env: {
      ...spawnEnv(env),
      DSH_EMBED_BIND: '127.0.0.1',
      DSH_EMBED_PORT: String(localEmbedPort(env)),
      DSH_EMBED_MODEL: LOCAL_EMBED_MODEL,
    },
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  onLog(`local embedder pid ${child.pid} → ${localEmbedUrl(env)}`)
  logFd.write(`spawn pid=${child.pid}`)
  // First boot downloads the ONNX weights inside Python; 20s is not enough.
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 2_000))
    const again = await probeLocalEmbed(env)
    if (again.ok) {
      onLog('本机向量服务已就绪')
      return { ok: true, started: true, installed: deps.installed, pid: child.pid, url: localEmbedUrl(env), containerUrl: localEmbedContainerUrl(env), model: LOCAL_EMBED_MODEL }
    }
    if (i === 14 || i === 44 || i === 74) onLog(`仍在等待模型加载… ${i * 2}s`)
  }
  return { ok: false, error: 'local embedder did not become healthy (first install can take several minutes; check python3 and network)', pid: child.pid, url: localEmbedUrl(env) }
}

export async function stopLocalEmbedder(onLog = () => {}, env = process.env) {
  const port = localEmbedPort(env)
  const listed = await run(which('lsof', env), ['-ti', `tcp:${port}`], { timeoutMs: 5_000, env })
  const pids = listed.stdout.split(/\s+/).map(s => s.trim()).filter(Boolean)
  if (!pids.length) return { ok: true, stopped: false, note: 'not running' }
  for (const pid of pids) {
    try { process.kill(Number(pid), 'SIGTERM') } catch { /* gone */ }
  }
  onLog(`stopped local embedder on :${port} (${pids.join(',')})`)
  return { ok: true, stopped: true, pids }
}

export async function resolveEmbeddingForEnv(onLog = () => {}, env = process.env) {
  const cfg = readPentagiSettings(env)
  const source = embeddingSource(cfg)
  if (source === 'api') {
    const apiUrl = String(cfg.embeddingApiUrl || '').replace(/\/$/, '')
    const apiKey = String(cfg.embeddingApiKey || '').trim()
    const apiModel = String(cfg.embeddingApiModel || 'text-embedding-3-small').trim()
    if (!apiUrl || !apiKey) return { ok: false, source, error: 'embedding API url/key missing' }
    return {
      ok: true,
      source,
      provider: 'openai',
      url: apiUrl.replace('127.0.0.1', 'host.docker.internal').replace('localhost', 'host.docker.internal'),
      key: apiKey,
      model: apiModel,
    }
  }
  if (source === 'local') {
    const live = await probeLocalEmbed(env)
    if (!live.ok) {
      return { ok: false, source, error: 'local embedder is not running; start it from the PentAGI panel' }
    }
    return {
      ok: true,
      source,
      provider: 'openai',
      url: localEmbedContainerUrl(env),
      key: 'sk-dsh-local-embed',
      model: LOCAL_EMBED_MODEL,
    }
  }
  await stopLocalEmbedder(() => {}, env)
  return { ok: false, source: 'none' }
}

export function savePentagiSettings(patch = {}, env = process.env) {
  const dest = join(userHome(env), 'desktop-settings.json')
  let settings = {}
  try { settings = JSON.parse(readFileSync(dest, 'utf8')) } catch { settings = {} }
  settings.coldbrew ??= {}
  settings.coldbrew.pentagi ??= {}
  Object.assign(settings.coldbrew.pentagi, patch)
  if (patch.port) {
    settings.coldbrew.pentagi.url = `https://127.0.0.1:${Number(patch.port)}`
  }
  mkdirSync(userHome(env), { recursive: true })
  writeFileSync(dest, JSON.stringify(settings, null, 2))
  return settings.coldbrew.pentagi
}

export async function startPentagiRuntime(onLog = () => {}, env = process.env) {
  const dockerReady = await ensureDocker(onLog, env)
  if (!dockerReady.ok) throw new Error(dockerReady.error || 'docker daemon not running')
  let root = pentagiRoot(env)
  if (!existsSync(join(root, 'docker-compose.yml'))) {
    onLog(`clone pentagi → ${root}`)
    mkdirSync(dirname(root), { recursive: true })
    const cloned = await run(which('git', env), ['clone', '--depth', '1', 'https://github.com/vxcontrol/pentagi.git', root], {
      timeoutMs: 180_000, env, onLog,
    })
    if (!cloned.ok) throw new Error(cloned.stderr || 'git clone failed')
  }
  ensureEnvFile(root, env)
  let harnessLlm = null
  try {
    const { inspectHarnessLlms, pickHarnessLlm, applyLlmToEnvText, llmFingerprint, syncGraphqlProviders } = await import('./pentagi-providers.mjs')
    const inspected = await inspectHarnessLlms(env)
    const pick = pickHarnessLlm(inspected, env)
    if (pick) {
      const dest = join(root, '.env')
      const prev = existsSync(dest) ? readFileSync(dest, 'utf8') : ''
      const embedding = await resolveEmbeddingForEnv(onLog, env)
      const next = applyLlmToEnvText(prev, pick, { embedding })
      if (next !== prev) {
        writeFileSync(dest, next)
        onLog(`同步 Harness 模型 ${pick.displayName}/${pick.probe?.model || pick.model} → LLM_SERVER_*`)
      }
      harnessLlm = { pick, inspected, fingerprint: llmFingerprint(pick), embedding }
    } else {
      onLog('Harness 里没有带 key 的模型，PentAGI 仍用 .env 现有 LLM')
    }
  } catch (error) {
    onLog(`同步 Harness 模型失败：${error?.message ?? error}`)
  }
  let up = { ok: false, stderr: '', stdout: '' }
  for (let attempt = 1; attempt <= 4; attempt++) {
    onLog(`$ docker compose up -d  (${root})  attempt ${attempt}/4`)
    up = await run(dockerReady.docker, ['compose', 'up', '-d'], { cwd: root, timeoutMs: 15 * 60_000, env: composeEnv(env), rawEnv: true, onLog })
    if (up.ok) break
    onLog(`compose 失败，20s 后重试：${(up.stderr || up.stdout || '').split('\n').pop()}`)
    await new Promise(r => setTimeout(r, 20_000))
  }
  if (!up.ok) throw new Error(up.stderr || up.stdout || 'docker compose up failed')
  const api = await waitForApi(onLog, 180_000, env)
  if (!api.ok) throw new Error(api.error)
  const boot = await ensurePentagiApiToken(onLog, env)
  if (!boot.ok) throw new Error(boot.error)
  if (harnessLlm?.pick) {
    try {
      const { syncGraphqlProviders } = await import('./pentagi-providers.mjs')
      const synced = await syncGraphqlProviders(harnessLlm.pick, harnessLlm.inspected, env)
      onLog(synced.ok
        ? `GraphQL provider ${synced.name} 已对齐（${synced.model}）`
        : `GraphQL provider 同步失败：${JSON.stringify(synced.upsert?.errors || synced.error || synced).slice(0, 240)}`)
    } catch (error) {
      onLog(`GraphQL provider 同步失败：${error?.message ?? error}`)
    }
  }
  const status = await probePentagiRuntime(env)
  return {
    ...status,
    harnessLlm: harnessLlm && {
      pick: { id: harnessLlm.pick.id, model: harnessLlm.pick.probe?.model || harnessLlm.pick.model, healthy: harnessLlm.pick.healthy },
      embedding: harnessLlm.embedding && { ok: harnessLlm.embedding.ok, source: harnessLlm.embedding.source, url: harnessLlm.embedding.url },
    },
  }
}

export async function stopPentagiRuntime(onLog = () => {}, env = process.env) {
  const docker = which('docker', env)
  const root = pentagiRoot(env)
  if (!existsSync(join(root, 'docker-compose.yml'))) throw new Error(`pentagi root missing: ${root}`)
  onLog(`$ docker compose down  (${root})`)
  const down = await run(docker, ['compose', 'down'], { cwd: root, timeoutMs: 180_000, env: composeEnv(env), rawEnv: true, onLog })
  if (!down.ok) throw new Error(down.stderr || 'docker compose down failed')
  return probePentagiRuntime(env)
}

export {
  API_URL as PENTAGI_API_URL,
  which as whichBin,
  DEFAULT_PORT as PENTAGI_DEFAULT_PORT,
  DEFAULT_PENTEST_IMAGE,
  LOCAL_EMBED_MODEL,
  composeEnv as pentagiComposeEnv,
  dockerHost,
  pentagiRoot,
  spawnEnv,
  which as whichDocker,
}
