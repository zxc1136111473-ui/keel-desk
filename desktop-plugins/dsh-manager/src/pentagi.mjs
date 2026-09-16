import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import https from 'node:https'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  probePentagiRuntime,
  startPentagiRuntime,
  stopPentagiRuntime,
  spawnEnv,
  whichDocker,
  pentestImage,
  pentagiSandboxEnabled,
  pentagiDindEnabled,
  dockerSocketInVm,
  ensurePentagiApiToken,
} from './pentagi-runtime.mjs'

export const PENTAGI_TOOL_PREFIX = 'pg_'

function userHome(env = process.env) {
  const configured = String(env.DSH_HOME ?? '').trim()
  if (configured.length === 0) return join(homedir(), '.dsh')
  return resolve(configured)
}

function storeDir(env = process.env) {
  return join(userHome(env), 'pentagi')
}

function storePath(name, env = process.env) {
  return join(storeDir(env), name)
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2))
}

/** Drop `undefined`, Date→ISO, sparse holes→null so Harness lossless JSON accepts the payload. */
export function jsonSafe(value, seen = new WeakSet()) {
  if (value === undefined) return undefined
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0) ? value : null
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (typeof value !== 'object') return String(value)
  if (Object.prototype.toString.call(value) === '[object Date]') {
    const ms = value.getTime()
    return Number.isFinite(ms) ? value.toISOString() : null
  }
  if (seen.has(value)) return null
  seen.add(value)
  if (Array.isArray(value)) {
    const out = []
    for (let i = 0; i < value.length; i++) {
      const next = Object.prototype.hasOwnProperty.call(value, i) ? jsonSafe(value[i], seen) : undefined
      out.push(next === undefined ? null : next)
    }
    return out
  }
  const out = {}
  for (const key of Object.keys(value)) {
    const next = jsonSafe(value[key], seen)
    if (next !== undefined) out[key] = next
  }
  return out
}

function memoryStore(env = process.env) {
  return readJson(storePath('memory.json', env), { answers: [], guides: [], codes: [], notes: [] })
}

function saveMemory(store, env = process.env) {
  writeJson(storePath('memory.json', env), store)
}

function flowStore(env = process.env) {
  return readJson(storePath('flows.json', env), { current: null, flows: [], subtasks: [] })
}

function saveFlows(store, env = process.env) {
  writeJson(storePath('flows.json', env), store)
}

function pentagiBase(env = process.env) {
  const fromEnv = String(env.DSH_PENTAGI_URL ?? '').trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  try {
    const settings = JSON.parse(readFileSync(join(userHome(env), 'desktop-settings.json'), 'utf8'))
    const saved = String(settings?.coldbrew?.pentagi?.url ?? '').trim()
    if (saved) return saved.replace(/\/$/, '')
    const port = Number(settings?.coldbrew?.pentagi?.port)
    if (port >= 1 && port <= 65535) return `https://127.0.0.1:${port}`
  } catch { /* none */ }
  return 'https://127.0.0.1:8443'
}

function pentagiToken(env = process.env) {
  const fromEnv = String(env.DSH_PENTAGI_TOKEN ?? '').trim()
  if (fromEnv) return fromEnv
  try {
    const settings = JSON.parse(readFileSync(join(userHome(env), 'desktop-settings.json'), 'utf8'))
    return String(settings?.coldbrew?.pentagi?.token ?? '').trim()
  } catch {
    return ''
  }
}

function spawnCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000
  return new Promise((resolvePromise) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: options.shell === true,
    })
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolvePromise({ ok: false, code: -1, stdout, stderr: `${stderr}\ntimed out after ${timeoutMs}ms`.trim() })
    }, timeoutMs)
    child.stdout?.on('data', chunk => { stdout += chunk.toString() })
    child.stderr?.on('data', chunk => { stderr += chunk.toString() })
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
    if (options.input !== undefined) child.stdin.end(options.input)
    else child.stdin?.end()
  })
}

function htmlToText(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function extractLinks(html, baseUrl) {
  const out = []
  const re = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = re.exec(html)) !== null && out.length < 80) {
    const href = match[1]
    const text = htmlToText(match[2]).slice(0, 120)
    try {
      out.push({ href: new URL(href, baseUrl).href, text })
    } catch {
      out.push({ href, text })
    }
  }
  return out
}

async function httpGet(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PentAGI-DSH/1.0; +https://github.com/vxcontrol/pentagi)',
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        ...(options.headers ?? {}),
      },
    })
    const text = await response.text()
    return { ok: response.ok, status: response.status, url: response.url, text, headers: Object.fromEntries(response.headers) }
  } finally {
    clearTimeout(timer)
  }
}

function pentagiHttps(url, init = {}, redirects = 0) {
  return new Promise((resolvePromise, reject) => {
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: `${u.pathname}${u.search}`,
      method: init.method || 'GET',
      headers: init.headers ?? {},
      rejectUnauthorized: false,
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const method = String(init.method || 'GET').toUpperCase()
        const location = res.headers?.location
        const redirect = res.statusCode >= 300 && res.statusCode < 400 && location
          && (method === 'GET' || method === 'HEAD')
        if (redirect && redirects < 3) {
          const next = new URL(location, url).href
          resolvePromise(pentagiHttps(next, init, redirects + 1))
          return
        }
        const buf = Buffer.concat(chunks)
        resolvePromise({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          url,
          headers: res.headers ?? {},
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

async function pentagiFetch(url, options = {}, env = process.env) {
  if (/^https:\/\/(127\.0\.0\.1|localhost)\b/i.test(url)) {
    return pentagiHttps(url, options)
  }
  return fetch(url, options)
}

async function graphql(query, variables = {}, env = process.env, timeoutMs = 20_000) {
  const token = pentagiToken(env)
  const url = `${pentagiBase(env)}/api/v1/graphql`
  if (!token) {
    return { ok: false, error: 'missing DSH_PENTAGI_TOKEN (or settings.coldbrew.pentagi.token)', url }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(5_000, timeoutMs))
  try {
    const response = await pentagiFetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    }, env)
    const body = await response.text()
    let json = null
    try { json = JSON.parse(body) } catch { /* raw */ }
    return { ok: response.ok && !json?.errors, status: response.status, url, json, body: body.slice(0, 20_000) }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), url }
  } finally {
    clearTimeout(timer)
  }
}

export function buildMultipart(files = []) {
  const boundary = `----dshpentagi${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
  const chunks = []
  for (const file of files) {
    const filename = String(file.filename || 'file.bin').replace(/[\r\n"]/g, '_')
    const field = file.field || 'files'
    const body = Buffer.isBuffer(file.body) ? file.body : Buffer.from(String(file.body ?? ''), 'utf8')
    const type = file.contentType || 'application/octet-stream'
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
    ))
    chunks.push(body)
    chunks.push(Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}`, boundary }
}

async function rest(method, path, { query, json, raw, multipart, headers: extraHeaders } = {}, env = process.env) {
  const token = pentagiToken(env)
  const url = new URL(path, `${pentagiBase(env)}/`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, String(item))
      } else {
        url.searchParams.set(k, String(v))
      }
    }
  }
  if (!token) return { ok: false, error: 'missing DSH_PENTAGI_TOKEN', url: url.href }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const headers = { Authorization: `Bearer ${token}`, ...(extraHeaders ?? {}) }
    const init = { method, signal: controller.signal, headers }
    if (multipart) {
      headers['Content-Type'] = multipart.contentType
      headers['Content-Length'] = String(Buffer.byteLength(multipart.body))
      init.body = multipart.body
    } else if (json !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(json)
    } else if (raw !== undefined) {
      init.body = raw
    }
    const response = await pentagiFetch(url.href, init, env)
    const text = await response.text()
    let parsed = null
    try { parsed = JSON.parse(text) } catch { /* not json */ }
    return { ok: response.ok, status: response.status, url: url.href, json: parsed, body: text.slice(0, 80_000) }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), url: url.href }
  } finally {
    clearTimeout(timer)
  }
}

function envKey(names, env = process.env) {
  for (const name of names) {
    const v = String(env[name] ?? '').trim()
    if (v) return v
  }
  return ''
}

function knowledgeLocal(env = process.env) {
  return readJson(storePath('knowledge.json', env), { documents: [] })
}

function saveKnowledge(store, env = process.env) {
  writeJson(storePath('knowledge.json', env), store)
}

function currentFlowId(args, env = process.env) {
  const raw = String(args.flowId || args.flow_id || flowStore(env).current || '')
  if (!raw || raw.startsWith('local-')) return ''
  return raw
}

async function defaultProviderName(env = process.env) {
  let pinned = 'auto'
  try {
    const settings = JSON.parse(readFileSync(join(userHome(env), 'desktop-settings.json'), 'utf8'))
    pinned = String(settings?.coldbrew?.pentagi?.harnessProvider || 'auto')
  } catch { /* */ }
  const listed = await graphql('query { providers { name type } }', {}, env)
  const names = listed.json?.data?.providers?.map(p => p.name).filter(Boolean) ?? []
  if (pinned && pinned !== 'auto') {
    const want = `dsh-${pinned}`
    if (names.includes(want)) return want
  }
  const dsh = names.find(n => String(n).startsWith('dsh-') && n !== 'dsh-grok-pro') || names.find(n => String(n).startsWith('dsh-'))
  if (dsh) return dsh
  if (names.includes('custom')) return 'custom'
  if (names.includes('deepseek')) return 'deepseek'
  return names[0] || 'openai'
}

const jsonOutput = {
  schema: {},
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

function requiredString(desc) {
  return { type: 'string', description: desc }
}

export const PENTAGI_TOOLS = [
  {
    name: 'pg_status',
    description: 'Probe PentAGI backend (docker, API, token) and list callable pg_* tools.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'pg_backend_start',
    description: 'Start local PentAGI docker compose (colima if needed), wait for :8443, login and mint API token.',
    parameters: { type: 'object', properties: { message: requiredString('Why start') }, required: ['message'], additionalProperties: false },
  },
  {
    name: 'pg_backend_stop',
    description: 'Stop local PentAGI docker compose.',
    parameters: { type: 'object', properties: { message: requiredString('Why stop') }, required: ['message'], additionalProperties: false },
  },
  {
    name: 'pg_terminal',
    description: 'Run a shell command (PentAGI terminal). Kali sandbox is a long-lived container: /work and /tmp persist across calls (cookies, captcha, /tmp scripts). Blocking unless detach=true. Prefer this over writing commands in prose.',
    parameters: {
      type: 'object',
      properties: {
        input: requiredString('Command to run'),
        cwd: { type: 'string', description: 'Working directory' },
        detach: { type: 'boolean', description: 'Run in background (no stdout capture)' },
        timeout: { type: 'integer', description: 'Seconds, 0 = 60s default, max 10800' },
        sandbox: { type: 'boolean', description: 'Run inside the persistent vxcontrol/kali-linux sandbox (https://github.com/vxcontrol/kali-linux-image). /work and /tmp survive across calls. Default follows Settings → 启用 Kali 沙箱.' },
        message: requiredString('Why this command'),
      },
      required: ['input', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_file',
    description: 'Read, write or edit a local file (PentAGI file tool).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read_file', 'write_file', 'edit_file'] },
        path: requiredString('Absolute path'),
        content: { type: 'string', description: 'write_file: full content' },
        diff: { type: 'string', description: 'edit_file: search/replace patch as OLD<<< ... >>>NEW or unified diff hunks' },
        message: requiredString('Why this file action'),
      },
      required: ['action', 'path', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_browser',
    description: 'Fetch a URL as markdown, html or links (PentAGI browser).',
    parameters: {
      type: 'object',
      properties: {
        url: requiredString('URL to open'),
        action: { type: 'string', enum: ['markdown', 'html', 'links', 'screenshot'] },
        message: requiredString('Why this fetch'),
      },
      required: ['url', 'action', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_web_search',
    description: 'Live web search. mode=links|answer|research|exploit. Always query in English.',
    parameters: {
      type: 'object',
      properties: {
        query: requiredString('English search query'),
        mode: { type: 'string', enum: ['links', 'answer', 'research', 'exploit'] },
        max_results: { type: 'integer' },
        exploit_type: { type: 'string', enum: ['exploits', 'tools'] },
        message: requiredString('Why this search'),
      },
      required: ['query', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_duckduckgo',
    description: 'DuckDuckGo search (English query).',
    parameters: {
      type: 'object',
      properties: {
        query: requiredString('English query'),
        max_results: { type: 'integer' },
        message: requiredString('Why this search'),
      },
      required: ['query', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_google',
    description: 'Google-flavored web search via DuckDuckGo (no API key). Query in English.',
    parameters: {
      type: 'object',
      properties: {
        query: requiredString('English query'),
        max_results: { type: 'integer' },
        message: requiredString('Why this search'),
      },
      required: ['query', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_sploitus',
    description: 'Search Sploitus for exploits/PoCs/tools.',
    parameters: {
      type: 'object',
      properties: {
        query: requiredString('English query, e.g. CVE-2021-44228'),
        exploit_type: { type: 'string', enum: ['exploits', 'tools'] },
        sort: { type: 'string', enum: ['default', 'date', 'score'] },
        max_results: { type: 'integer' },
        message: requiredString('Why this search'),
      },
      required: ['query', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_search_in_memory',
    description: 'Semantic-ish search of local PentAGI memory (answers/guides/codes).',
    parameters: {
      type: 'object',
      properties: {
        questions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
        message: requiredString('Why this lookup'),
      },
      required: ['questions', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_store_answer',
    description: 'Store an anonymized markdown answer into local PentAGI memory.',
    parameters: {
      type: 'object',
      properties: {
        answer: requiredString('Markdown answer in English'),
        question: requiredString('Question that produced this answer'),
        type: { type: 'string', enum: ['guide', 'vulnerability', 'code', 'tool', 'other'] },
        message: requiredString('Why store'),
      },
      required: ['answer', 'question', 'type', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_search_answer',
    description: 'Search stored answers in local PentAGI memory.',
    parameters: {
      type: 'object',
      properties: {
        questions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
        type: { type: 'string', enum: ['guide', 'vulnerability', 'code', 'tool', 'other'] },
        message: requiredString('Why this lookup'),
      },
      required: ['questions', 'type', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_store_guide',
    description: 'Store a pentest/install/use guide into local memory.',
    parameters: {
      type: 'object',
      properties: {
        guide: requiredString('Markdown guide in English'),
        question: requiredString('Question used to prepare the guide'),
        type: { type: 'string', enum: ['install', 'configure', 'use', 'pentest', 'development', 'other'] },
        message: requiredString('Why store'),
      },
      required: ['guide', 'question', 'type', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_search_guide',
    description: 'Search stored guides in local memory.',
    parameters: {
      type: 'object',
      properties: {
        questions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
        type: { type: 'string', enum: ['install', 'configure', 'use', 'pentest', 'development', 'other'] },
        message: requiredString('Why this lookup'),
      },
      required: ['questions', 'type', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_store_code',
    description: 'Store a code sample into local memory.',
    parameters: {
      type: 'object',
      properties: {
        code: requiredString('Source code'),
        question: requiredString('Question in English'),
        lang: requiredString('python/bash/golang/...'),
        explanation: requiredString('English explanation'),
        description: requiredString('Short English summary'),
        message: requiredString('Why store'),
      },
      required: ['code', 'question', 'lang', 'explanation', 'description', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_search_code',
    description: 'Search stored code samples.',
    parameters: {
      type: 'object',
      properties: {
        questions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
        lang: requiredString('Language filter'),
        message: requiredString('Why this lookup'),
      },
      required: ['questions', 'lang', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_subtask_list',
    description: 'Submit a new ordered subtask plan for the current engagement.',
    parameters: {
      type: 'object',
      properties: {
        subtasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['title', 'description'],
          },
        },
        message: requiredString('Plan summary'),
      },
      required: ['subtasks', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_report_result',
    description: 'Send a task result (success/fail + write-up) to the engagement log.',
    parameters: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        result: requiredString('Full write-up'),
        message: requiredString('1-2 sentence recap'),
      },
      required: ['result', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_done',
    description: 'Mark current subtask done.',
    parameters: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        result: requiredString('Full write-up'),
        message: requiredString('Recap'),
      },
      required: ['result', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_ask',
    description: 'Ask the engagement coordinator a clarification question.',
    parameters: {
      type: 'object',
      properties: { message: requiredString('Question') },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_pentester',
    description: 'Dispatch the official PentAGI pentester agent (GraphQL assistant + useAgents). Falls back to a local playbook if the backend is down.',
    parameters: {
      type: 'object',
      properties: {
        question: requiredString('English task for the pentester'),
        message: requiredString('Why'),
      },
      required: ['question', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_coder',
    description: 'Dispatch the official PentAGI coder agent (GraphQL assistant + useAgents). Falls back to a local playbook if the backend is down.',
    parameters: {
      type: 'object',
      properties: {
        question: requiredString('English coding task'),
        message: requiredString('Why'),
      },
      required: ['question', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_maintenance',
    description: 'Dispatch the official PentAGI installer agent (GraphQL assistant + useAgents). Falls back to a local playbook if the backend is down.',
    parameters: {
      type: 'object',
      properties: {
        question: requiredString('English maintenance task'),
        message: requiredString('Why'),
      },
      required: ['question', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_advice',
    description: 'Ask the official PentAGI senior mentor. Returns the mentor final answer in `advice` (also `result`) without requiring a separate agentLog lookup. Falls back to local counsel if the backend is down.',
    parameters: {
      type: 'object',
      properties: {
        question: requiredString('English technical question'),
        code: { type: 'string' },
        output: { type: 'string' },
        message: requiredString('Why'),
      },
      required: ['question', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_searcher',
    description: 'Dispatch the official PentAGI searcher agent (GraphQL assistant + useAgents). Falls back to local web+memory if the backend is down.',
    parameters: {
      type: 'object',
      properties: {
        question: requiredString('English research question'),
        message: requiredString('Why'),
      },
      required: ['question', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_memorist',
    description: 'Search previous engagement work in local memory with full context.',
    parameters: {
      type: 'object',
      properties: {
        question: requiredString('English question'),
        message: requiredString('Why'),
      },
      required: ['question', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_search',
    description: 'Complex research: web + memory. Question in English.',
    parameters: {
      type: 'object',
      properties: {
        question: requiredString('English research question'),
        message: requiredString('Why'),
      },
      required: ['question', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_flow_create',
    description: 'Create a PentAGI flow. Uses GraphQL if token+backend exist, else local ledger.',
    parameters: {
      type: 'object',
      properties: {
        input: requiredString('Engagement goal / target'),
        modelProvider: { type: 'string', description: 'Optional provider name for remote backend' },
        message: requiredString('Why'),
      },
      required: ['input', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_flow_status',
    description: 'Read current flow status (local ledger and/or remote GraphQL).',
    parameters: {
      type: 'object',
      properties: {
        detail: { type: 'string', enum: ['summary', 'tasks', 'subtasks', 'running', 'planned'] },
        flowId: { type: 'string' },
        message: requiredString('Why'),
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_flow_input',
    description: 'Submit user input into a running flow (GraphQL putUserInput or local).',
    parameters: {
      type: 'object',
      properties: {
        input: requiredString('Input to submit'),
        flowId: { type: 'string' },
        message: requiredString('Why'),
      },
      required: ['input', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_subtask_patch',
    description: 'Submit delta operations to modify the current subtask list instead of regenerating all subtasks.',
    parameters: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['add', 'remove', 'modify', 'reorder'] },
              id: { type: 'integer' },
              after_id: { type: 'integer' },
              title: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['op'],
          },
        },
        message: requiredString('Refinement summary'),
      },
      required: ['operations', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_graphiti_search',
    description: 'Search the local knowledge graph ledger (Graphiti-shaped). Remote Neo4j only when backend is up.',
    parameters: {
      type: 'object',
      properties: {
        search_type: {
          type: 'string',
          enum: ['temporal_window', 'entity_relationships', 'diverse_results', 'episode_context', 'successful_tools', 'recent_context', 'entity_by_label'],
        },
        query: requiredString('English query against the knowledge graph'),
        message: requiredString('Why this search'),
      },
      required: ['search_type', 'query', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_flow_wait',
    description: 'Wait until the remote flow and its assistants leave running (falls back to local subtasks).',
    parameters: {
      type: 'object',
      properties: {
        timeout: { type: 'integer', description: 'Seconds, 0 = 60, max 3600' },
        message: requiredString('Why wait'),
      },
      required: ['timeout', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_flow_stop',
    description: 'Stop a running flow.',
    parameters: {
      type: 'object',
      properties: {
        reason: requiredString('Why halt'),
        flowId: { type: 'string' },
        message: requiredString('Commentary'),
      },
      required: ['reason', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_flow_finish',
    description: 'Finish a flow (GraphQL finishFlow). Local ledger if no token.',
    parameters: {
      type: 'object',
      properties: {
        flowId: { type: 'string' },
        message: requiredString('Why finish'),
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_flow_report',
    description: 'Build an official-style Markdown pentest report from remote flow tasks/subtasks and write it under sandbox-work.',
    parameters: {
      type: 'object',
      properties: {
        flowId: { type: 'string' },
        message: requiredString('Why export'),
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_flow_rename',
    description: 'Rename a flow (GraphQL renameFlow).',
    parameters: {
      type: 'object',
      properties: {
        title: requiredString('New title'),
        flowId: { type: 'string' },
        message: requiredString('Why rename'),
      },
      required: ['title', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_assistant_create',
    description: 'Create a PentAGI assistant on a flow (GraphQL createAssistant). Local stub if no token.',
    parameters: {
      type: 'object',
      properties: {
        input: requiredString('First message / goal'),
        flowId: { type: 'string' },
        modelProvider: { type: 'string' },
        useAgents: { type: 'boolean' },
        message: requiredString('Why'),
      },
      required: ['input', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_assistant_call',
    description: 'Call an existing assistant (GraphQL callAssistant).',
    parameters: {
      type: 'object',
      properties: {
        input: requiredString('Message to the assistant'),
        assistantId: { type: 'string' },
        flowId: { type: 'string' },
        useAgents: { type: 'boolean' },
        message: requiredString('Why'),
      },
      required: ['input', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_assistant_stop',
    description: 'Stop an assistant (GraphQL stopAssistant).',
    parameters: {
      type: 'object',
      properties: {
        assistantId: { type: 'string' },
        flowId: { type: 'string' },
        message: requiredString('Why'),
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_knowledge_search',
    description: 'Search pgvector knowledge (GraphQL searchKnowledge) or local knowledge.json.',
    parameters: {
      type: 'object',
      properties: {
        query: requiredString('English query'),
        limit: { type: 'integer' },
        message: requiredString('Why'),
      },
      required: ['query', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_knowledge_create',
    description: 'Create a knowledge document (GraphQL createKnowledgeDocument) or local knowledge.json.',
    parameters: {
      type: 'object',
      properties: {
        docType: { type: 'string', enum: ['guide', 'answer', 'code'] },
        content: requiredString('Document content'),
        question: requiredString('Indexed question in English'),
        description: { type: 'string' },
        codeLang: { type: 'string' },
        message: requiredString('Why store'),
      },
      required: ['docType', 'content', 'question', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_knowledge_get',
    description: 'Get or list knowledge documents.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        withContent: { type: 'boolean' },
        message: requiredString('Why'),
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_knowledge_delete',
    description: 'Delete a knowledge document.',
    parameters: {
      type: 'object',
      properties: {
        id: requiredString('Document id'),
        message: requiredString('Why'),
      },
      required: ['id', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_flow_files',
    description: 'Official flow files REST: list/upload/download/pull/delete/attach/promote/container.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'container', 'download', 'upload', 'pull', 'delete', 'attach', 'promote'] },
        flowId: { type: 'string' },
        path: { type: 'string', description: 'Local file for upload, container path for pull, cache path for download/delete/promote' },
        content: { type: 'string', description: 'Inline upload body when path is omitted' },
        filename: { type: 'string' },
        destination: { type: 'string', description: 'promote: destination in user resources' },
        ids: { type: 'string', description: 'attach: comma-separated user resource ids' },
        force: { type: 'boolean' },
        message: requiredString('Why'),
      },
      required: ['action', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_flow_logs',
    description: 'Read flow logs: terminal/message/agent/search/toolcall/screenshots (GraphQL).',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['terminal', 'message', 'agent', 'search', 'toolcall', 'screenshot', 'vector'] },
        flowId: { type: 'string' },
        message: requiredString('Why'),
      },
      required: ['kind', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_flow_watch',
    description: 'Poll current flow status (subscription stand-in).',
    parameters: {
      type: 'object',
      properties: {
        flowId: { type: 'string' },
        message: requiredString('Why'),
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_tavily',
    description: 'Tavily search if TAVILY_API_KEY is set; otherwise falls back to DuckDuckGo.',
    parameters: {
      type: 'object',
      properties: {
        query: requiredString('English query'),
        max_results: { type: 'integer' },
        message: requiredString('Why'),
      },
      required: ['query', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_firecrawl',
    description: 'Firecrawl scrape/search if FIRECRAWL_API_KEY is set; else pg_browser.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        url: { type: 'string' },
        message: requiredString('Why'),
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_perplexity',
    description: 'Perplexity sonar if PERPLEXITY_API_KEY is set; else DuckDuckGo answer mode.',
    parameters: {
      type: 'object',
      properties: {
        query: requiredString('English query'),
        message: requiredString('Why'),
      },
      required: ['query', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_searxng',
    description: 'SearxNG if SEARXNG_URL is set; else DuckDuckGo.',
    parameters: {
      type: 'object',
      properties: {
        query: requiredString('English query'),
        max_results: { type: 'integer' },
        message: requiredString('Why'),
      },
      required: ['query', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'pg_traversaal',
    description: 'Traversaal if TRAVERSAAL_API_KEY is set; else DuckDuckGo.',
    parameters: {
      type: 'object',
      properties: {
        query: requiredString('English query'),
        message: requiredString('Why'),
      },
      required: ['query', 'message'],
      additionalProperties: false,
    },
  },
].map(tool => ({ ...tool, output: jsonOutput }))

function scoreHit(item, questions) {
  const hay = JSON.stringify(item).toLowerCase()
  let score = 0
  for (const q of questions) {
    const tokens = String(q).toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2)
    for (const token of tokens) if (hay.includes(token)) score += 1
  }
  return score
}

function searchBucket(bucket, questions, extraFilter) {
  const qs = Array.isArray(questions) ? questions : [String(questions)]
  return bucket
    .filter(item => extraFilter ? extraFilter(item) : true)
    .map(item => ({ score: scoreHit(item, qs), item }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(row => row.item)
}

export function unwrapDuckDuckGoHref(href) {
  try {
    const absolute = href.startsWith('//') ? `https:${href}` : href
    const u = new URL(absolute, 'https://duckduckgo.com')
    const uddg = u.searchParams.get('uddg')
    if (uddg) return uddg
  } catch { /* keep original */ }
  return href
}

async function duckduckgo(query, maxResults = 5) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const page = await httpGet(url)
  if (!page.ok) return { ok: false, error: `duckduckgo HTTP ${page.status}`, status: page.status }
  const results = []
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = re.exec(page.text)) !== null && results.length < maxResults) {
    results.push({ href: unwrapDuckDuckGoHref(match[1]), title: htmlToText(match[2]) })
  }
  if (results.length === 0) {
    for (const link of extractLinks(page.text, url)) {
      if (results.length >= maxResults) break
      if (!link.href.includes('duckduckgo.com')) results.push({ href: unwrapDuckDuckGoHref(link.href), title: link.title || link.href })
    }
  }
  const snippet = results.map(item => `${item.title} ${item.href}`).join('\n').slice(0, 1500)
  return { ok: true, engine: 'duckduckgo', query, results, snippet }
}

async function sploitus(query, maxResults = 10, exploitType = 'exploits') {
  const url = 'https://sploitus.com/search'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; PentAGI-DSH/1.0)',
      },
      body: JSON.stringify({
        type: exploitType === 'tools' ? 'tools' : 'exploits',
        sort: 'default',
        query,
        offset: 0,
      }),
    })
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* html fallback */ }
    if (json) {
      const hits = json.exploits ?? json.tools ?? json.results ?? json
      const list = Array.isArray(hits) ? hits.slice(0, maxResults) : hits
      return { ok: response.ok, status: response.status, query, results: list }
    }
    return { ok: response.ok, status: response.status, query, snippet: htmlToText(text).slice(0, 4000) }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), query }
  } finally {
    clearTimeout(timer)
  }
}

function applyEdit(original, diff) {
  const text = String(diff ?? '')
  const marker = text.match(/OLD<<<([\s\S]*?)>>>NEW([\s\S]*)$/)
  if (marker) {
    const oldPart = marker[1]
    const newPart = marker[2]
    if (!original.includes(oldPart)) throw new Error('edit_file: OLD block not found in file')
    return original.replace(oldPart, newPart)
  }
  const hunks = [...text.matchAll(/^@@[^\n]*\n([\s\S]*?)(?=^@@|\s*$)/gm)]
  if (hunks.length === 0) {
    throw new Error('edit_file: provide OLD<<<old>>>NEW new  or a unified-diff hunk')
  }
  let next = original
  for (const hunk of hunks) {
    const lines = hunk[1].split('\n')
    const oldLines = []
    const newLines = []
    for (const line of lines) {
      if (line.startsWith('-')) oldLines.push(line.slice(1))
      else if (line.startsWith('+')) newLines.push(line.slice(1))
      else if (line.startsWith(' ')) {
        oldLines.push(line.slice(1))
        newLines.push(line.slice(1))
      }
    }
    const oldBlock = oldLines.join('\n')
    const newBlock = newLines.join('\n')
    if (!next.includes(oldBlock)) throw new Error('edit_file: hunk context not found')
    next = next.replace(oldBlock, newBlock)
  }
  return next
}

/** Official PentAGI primary terminal caps minus MKNOD; NET_RAW is required for nmap. */
export const SANDBOX_CAP_ADD = [
  'CHOWN', 'DAC_OVERRIDE', 'FSETID', 'FOWNER',
  'NET_RAW', 'SETGID', 'SETUID', 'SETFCAP', 'SETPCAP',
  'NET_BIND_SERVICE', 'SYS_CHROOT', 'KILL', 'AUDIT_WRITE', 'SYS_PTRACE',
  'NET_ADMIN',
]

export const KNOWLEDGE_SEARCH_GQL = 'query SearchK($query: String!, $limit: Int) { searchKnowledge(query: $query, limit: $limit) { score document { id question description docType content } } }'

export const DEFAULT_SCRAPER_PUBLIC = 'https://someuser:somepass@127.0.0.1:9443'

export function scraperPublicUrl(env = process.env) {
  const fromEnv = String(env.DSH_PENTAGI_SCRAPER_URL || env.SCRAPER_PUBLIC_URL || '').trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  try {
    const settings = JSON.parse(readFileSync(join(userHome(env), 'desktop-settings.json'), 'utf8'))
    const saved = String(settings?.coldbrew?.pentagi?.scraperUrl ?? '').trim()
    if (saved) return saved.replace(/\/$/, '')
  } catch { /* none */ }
  return DEFAULT_SCRAPER_PUBLIC
}

export async function fetchViaScraper(targetUrl, action = 'markdown', env = process.env) {
  const base = scraperPublicUrl(env)
  const parsed = new URL(base)
  const path = action === 'html' ? '/html' : action === 'links' ? '/links' : action === 'screenshot' ? '/screenshot' : '/markdown'
  const headers = {}
  if (parsed.username || parsed.password) {
    const token = Buffer.from(`${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`).toString('base64')
    headers.Authorization = `Basic ${token}`
  }
  parsed.username = ''
  parsed.password = ''
  parsed.pathname = path
  parsed.search = `url=${encodeURIComponent(targetUrl)}`
  const endpoint = parsed.toString()
  const page = /^https:\/\/(127\.0\.0\.1|localhost)\b/i.test(endpoint)
    ? await pentagiHttps(endpoint, { method: 'GET', headers })
    : await httpGet(endpoint, { timeoutMs: 45_000, headers })
  const text = typeof page.text === 'function' ? await page.text() : String(page.text ?? '')
  return { ok: page.ok, status: page.status, url: targetUrl, scraper: `${parsed.origin}${path}`, text }
}

function reportStatusEmoji(status) {
  if (status === 'finished') return '✅'
  if (status === 'failed') return '❌'
  if (status === 'running') return '⚡'
  if (status === 'waiting') return '⏳'
  return '📝'
}

function shiftMarkdownHeaders(text, shiftBy) {
  return String(text || '').replace(/^(#{1,6})\s+(.+)$/gm, (_m, hashes, content) => {
    const next = Math.min(hashes.length + shiftBy, 6)
    return `${'#'.repeat(next)} ${content}`
  })
}

export function generateFlowMarkdown(flow, tasks = []) {
  const flowEmoji = reportStatusEmoji(flow?.status)
  const title = flow ? `${flowEmoji} ${flow.id}. ${flow.title}` : 'PentAGI flow'
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return `# ${title}\n\nNo tasks available for this flow.`
  }
  const sorted = [...tasks].sort((a, b) => Number(a.id) - Number(b.id))
  let toc = `# ${title}\n\n`
  for (const task of sorted) {
    const taskEmoji = reportStatusEmoji(task.status)
    toc += `- ${taskEmoji} ${task.id}. ${task.title}\n`
    for (const sub of [...(task.subtasks ?? [])].sort((a, b) => Number(a.id) - Number(b.id))) {
      toc += `  - ${reportStatusEmoji(sub.status)} ${sub.id}. ${sub.title}\n`
    }
  }
  let body = `${toc}\n---\n\n`
  sorted.forEach((task, index) => {
    body += `### ${reportStatusEmoji(task.status)} ${task.id}. ${task.title}\n\n`
    if (task.input?.trim()) body += `${shiftMarkdownHeaders(task.input, 3)}\n\n`
    if (task.result?.trim()) body += `---\n\n${task.result}\n\n`
    for (const sub of [...(task.subtasks ?? [])].sort((a, b) => Number(a.id) - Number(b.id))) {
      body += `#### ${reportStatusEmoji(sub.status)} ${sub.id}. ${sub.title}\n\n`
      if (sub.description?.trim()) body += `${sub.description}\n\n`
      if (sub.result?.trim()) body += `---\n\n${sub.result}\n\n`
    }
    if (index < sorted.length - 1) body += '---\n\n'
  })
  return body.trim()
}

export function flowFilesRestPath(flowId, suffix = '') {
  const base = `/api/v1/flows/${encodeURIComponent(flowId)}/files/`
  if (!suffix) return base
  return `${base}${String(suffix).replace(/^\/+/, '')}`
}

/** Host Tor SOCKS (and Browser SOCKS) — Kali 127.0.0.1 is the container, not the Mac.
 *  socat keeps SOCKS usernames intact, so IsolateSOCKSAuth still opens separate circuits.
 *  That does NOT isolate a target rate-limit bucket keyed on exit IP: same exit shares remaining.
 *  Probe remaining+exit before assuming extra tries. Literal `cN` is a placeholder (use c1/c2/c3). */
export const HOST_LOOPBACK_FORWARD_PORTS = [9050, 9150]
export const SANDBOX_CONTAINER_NAME = 'dsh-kali-sandbox'

export function wrapSandboxHostLoopback(input, { ensureOnly = false } = {}) {
  const forwards = [
    'mkdir -p /work/.tmp /tmp',
    ...HOST_LOOPBACK_FORWARD_PORTS.map((port) => (
      `if ! python3 -c "import socket;s=socket.socket();s.settimeout(0.2);s.connect(('127.0.0.1',${port}))" 2>/dev/null; then nohup socat TCP-LISTEN:${port},bind=127.0.0.1,fork,reuseaddr TCP:host.docker.internal:${port} >/work/.tmp/dsh-socat-${port}.log 2>&1 & fi`
    )),
  ].join('\n')
  if (ensureOnly) return `${forwards}\nsleep 0.15`
  return `${forwards}\nsleep 0.15\n${input}`
}

export function buildPersistentSandboxCreateArgs({ workHost, tmpHost, dind, image }) {
  const dockerArgs = ['run', '-d', '--name', SANDBOX_CONTAINER_NAME, '--restart', 'unless-stopped', '--cap-drop', 'ALL']
  for (const cap of SANDBOX_CAP_ADD) dockerArgs.push('--cap-add', cap)
  dockerArgs.push('--add-host', 'host.docker.internal:host-gateway')
  dockerArgs.push('-v', `${workHost}:/work`)
  dockerArgs.push('-v', `${tmpHost}:/tmp`)
  if (dind) dockerArgs.push('-v', `${dockerSocketInVm()}:/var/run/docker.sock`)
  dockerArgs.push('--entrypoint', 'sh', '-w', '/work', image, '-lc', `${wrapSandboxHostLoopback('', { ensureOnly: true })}\nexec tail -f /dev/null`)
  return dockerArgs
}

export function buildSandboxDockerArgs({ detach, workHost, workInContainer, dind, image, input, tmpHost }) {
  const dockerArgs = ['run', '--rm', '--cap-drop', 'ALL']
  for (const cap of SANDBOX_CAP_ADD) dockerArgs.push('--cap-add', cap)
  if (detach === true) dockerArgs.push('-d')
  dockerArgs.push('--add-host', 'host.docker.internal:host-gateway')
  dockerArgs.push('-v', `${workHost}:/work`)
  if (tmpHost) dockerArgs.push('-v', `${tmpHost}:/tmp`)
  if (dind) dockerArgs.push('-v', `${dockerSocketInVm()}:/var/run/docker.sock`)
  dockerArgs.push('-w', workInContainer, image, 'sh', '-lc', wrapSandboxHostLoopback(input))
  return dockerArgs
}

function sandboxWorkDir(args, env = process.env) {
  const configured = String(env.DSH_PENTAGI_SANDBOX_WORKDIR ?? '').trim()
  if (configured) return resolve(configured)
  const requested = String(args.cwd ?? '').trim()
  if (requested && !requested.startsWith('/work') && !requested.startsWith('/tmp')) {
    const hostPath = resolve(requested)
    if (existsSync(hostPath)) return hostPath
  }
  return join(userHome(env), 'pentagi', 'sandbox-work')
}

function sandboxTmpDir(env = process.env) {
  const dir = join(userHome(env), 'pentagi', 'sandbox-tmp')
  mkdirSync(dir, { recursive: true })
  return dir
}

async function sandboxContainerRunning(dockerBin, dockerEnv) {
  const inspect = await spawnCommand(dockerBin, ['inspect', '-f', '{{.State.Running}}', SANDBOX_CONTAINER_NAME], { timeoutMs: 8_000, env: dockerEnv })
  return inspect.ok && inspect.stdout.trim() === 'true'
}

async function ensurePersistentSandbox({ dockerBin, dockerEnv, image, workHost, tmpHost, dind }) {
  mkdirSync(join(workHost, '.tmp'), { recursive: true })
  if (await sandboxContainerRunning(dockerBin, dockerEnv)) {
    await spawnCommand(dockerBin, ['exec', SANDBOX_CONTAINER_NAME, 'sh', '-lc', wrapSandboxHostLoopback('', { ensureOnly: true })], { timeoutMs: 8_000, env: dockerEnv })
    return { created: false }
  }
  await spawnCommand(dockerBin, ['rm', '-f', SANDBOX_CONTAINER_NAME], { timeoutMs: 15_000, env: dockerEnv })
  const createArgs = buildPersistentSandboxCreateArgs({ workHost, tmpHost, dind, image })
  const created = await spawnCommand(dockerBin, createArgs, { timeoutMs: 30_000, env: dockerEnv })
  if (!created.ok) {
    return { created: false, error: created.stderr || created.stdout || 'failed to start persistent kali sandbox', code: created.code }
  }
  await spawnCommand(dockerBin, ['exec', SANDBOX_CONTAINER_NAME, 'sh', '-lc', wrapSandboxHostLoopback('', { ensureOnly: true })], { timeoutMs: 8_000, env: dockerEnv })
  return { created: true, id: created.stdout.trim() }
}

async function runTerminal(args, env = process.env) {
  const input = String(args.input ?? '').trim()
  if (!input) return { ok: false, error: 'empty command' }
  const cwd = args.cwd ? resolve(String(args.cwd)) : process.cwd()
  const timeoutSec = Number(args.timeout)
  const timeoutMs = !timeoutSec || timeoutSec <= 0 ? 60_000 : Math.min(timeoutSec, 10800) * 1000
  const sandboxExplicit = args.sandbox
  const sandbox = sandboxExplicit === true
    || (sandboxExplicit !== false && pentagiSandboxEnabled(env))
  const image = pentestImage(env)
  if (sandbox) {
    const dockerEnv = spawnEnv(env)
    const dockerBin = whichDocker('docker', dockerEnv)
    const dockerOk = await spawnCommand(dockerBin, ['--version'], { timeoutMs: 5_000, env: dockerEnv })
    if (!dockerOk.ok) {
      return {
        ok: false,
        error: 'docker not available for sandbox terminal',
        fallback: 'host',
        input,
        bin: dockerBin,
        stderr: dockerOk.stderr?.slice(0, 2_000),
      }
    }
    const hasImage = await spawnCommand(dockerBin, ['image', 'inspect', image, '--format', '{{.Id}}'], { timeoutMs: 8_000, env: dockerEnv })
    if (!hasImage.ok) {
      return {
        ok: false,
        error: `sandbox image ${image} is not pulled (source https://github.com/vxcontrol/kali-linux-image)`,
        fallback: 'host',
        input,
        image,
        bin: dockerBin,
        hint: `docker pull ${image}`,
        stderr: hasImage.stderr?.slice(0, 2_000),
      }
    }
    const workHost = sandboxWorkDir(args, env)
    mkdirSync(workHost, { recursive: true })
    const tmpHost = sandboxTmpDir(env)
    const requested = String(args.cwd ?? '').trim()
    const workInContainer = requested.startsWith('/work') || requested.startsWith('/tmp') ? requested : '/work'
    const dind = pentagiDindEnabled(env)
    const ready = await ensurePersistentSandbox({ dockerBin, dockerEnv, image, workHost, tmpHost, dind })
    if (ready.error) {
      return { ok: false, sandbox: true, persistent: true, image, bin: dockerBin, work: workHost, tmp: tmpHost, error: ready.error, code: ready.code, input }
    }
    const execArgs = ['exec', '-w', workInContainer, SANDBOX_CONTAINER_NAME, 'sh', '-lc', wrapSandboxHostLoopback(input)]
    if (args.detach === true) {
      const detached = await spawnCommand(dockerBin, [...execArgs.slice(0, -1), wrapSandboxHostLoopback(`${input} >/work/.tmp/detach.log 2>&1 & echo $!`)], { timeoutMs: 8_000, env: dockerEnv })
      return {
        ok: detached.ok,
        sandbox: true,
        persistent: true,
        container: SANDBOX_CONTAINER_NAME,
        image,
        bin: dockerBin,
        work: workHost,
        tmp: tmpHost,
        dind,
        detached: true,
        input,
        stdout: detached.stdout.slice(0, 8_000),
        stderr: detached.stderr.slice(0, 4_000),
        message: args.message,
      }
    }
    const result = await spawnCommand(dockerBin, execArgs, { timeoutMs, env: dockerEnv })
    return {
      ok: result.ok,
      sandbox: true,
      persistent: true,
      container: SANDBOX_CONTAINER_NAME,
      image,
      bin: dockerBin,
      work: workHost,
      tmp: tmpHost,
      dind,
      created: Boolean(ready.created),
      code: result.code,
      input,
      stdout: result.stdout.slice(0, 80_000),
      stderr: result.stderr.slice(0, 20_000),
      message: args.message,
    }
  }
  if (args.detach === true) {
    const child = spawn(input, {
      cwd,
      shell: true,
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    return { ok: true, detached: true, pid: child.pid, cwd, input, message: args.message }
  }
  const result = await spawnCommand(input, [], { cwd, timeoutMs, shell: true })
  return {
    ok: result.ok,
    code: result.code,
    cwd,
    input,
    stdout: result.stdout.slice(0, 80_000),
    stderr: result.stderr.slice(0, 20_000),
    message: args.message,
  }
}

async function tavilySearch(query, maxResults, env) {
  const key = envKey(['TAVILY_API_KEY', 'DSH_TAVILY_API_KEY'], env)
  if (!key) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query, max_results: maxResults || 5 }),
    })
    const json = await response.json()
    return { ok: response.ok, engine: 'tavily', query, results: json.results ?? json }
  } catch (error) {
    return { ok: false, engine: 'tavily', error: String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}

async function firecrawlRun(args, env) {
  const key = envKey(['FIRECRAWL_API_KEY', 'DSH_FIRECRAWL_API_KEY'], env)
  const base = envKey(['FIRECRAWL_API_URL', 'DSH_FIRECRAWL_API_URL'], env) || 'https://api.firecrawl.dev'
  if (!key) return null
  const target = args.url || args.query
  if (!target) return { ok: false, error: 'url or query required' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/v1/scrape`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ url: target, formats: ['markdown'] }),
    })
    const json = await response.json()
    return { ok: response.ok, engine: 'firecrawl', json }
  } catch (error) {
    return { ok: false, engine: 'firecrawl', error: String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}

async function perplexityRun(query, env) {
  const key = envKey(['PERPLEXITY_API_KEY', 'DSH_PERPLEXITY_API_KEY'], env)
  if (!key) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env.PERPLEXITY_MODEL || 'sonar',
        messages: [{ role: 'user', content: query }],
      }),
    })
    const json = await response.json()
    return { ok: response.ok, engine: 'perplexity', json }
  } catch (error) {
    return { ok: false, engine: 'perplexity', error: String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}

async function searxngRun(query, maxResults, env) {
  const base = envKey(['SEARXNG_URL', 'DSH_SEARXNG_URL'], env)
  if (!base) return null
  const url = `${base.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}&format=json`
  const page = await httpGet(url)
  let json = null
  try { json = JSON.parse(page.text) } catch { /* html */ }
  const results = Array.isArray(json?.results) ? json.results.slice(0, maxResults || 5) : []
  return { ok: page.ok, engine: 'searxng', query, results, snippet: htmlToText(page.text).slice(0, 2000) }
}

async function traversaalRun(query, env) {
  const key = envKey(['TRAVERSAAL_API_KEY', 'DSH_TRAVERSAAL_API_KEY'], env)
  if (!key) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch('https://api.traversaal.ai/live/predict', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ query }),
    })
    const json = await response.json()
    return { ok: response.ok, engine: 'traversaal', json }
  } catch (error) {
    return { ok: false, engine: 'traversaal', error: String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}

export const SPECIALIST_ROLES = {
  pentester: { kind: 'pentester', role: 'pentester', tool: 'pentester', title: 'pentester specialist' },
  coder: { kind: 'coder', role: 'coder', tool: 'coder', title: 'coder specialist' },
  maintenance: { kind: 'maintenance', role: 'installer', tool: 'installer', title: 'installer/maintenance specialist' },
  adviser: { kind: 'adviser', role: 'adviser', tool: 'advice', title: 'senior mentor (advice)' },
  searcher: { kind: 'searcher', role: 'searcher', tool: 'search', title: 'searcher specialist' },
}

export const SPECIALIST_POLL_MS = 60_000
export const SPECIALIST_ADVISER_POLL_MS = 180_000
const SPECIALIST_POLL_INTERVAL_MS = 2_500
const ASSISTANT_NARRATION_RE = /^(i('ll| will)|delegat|searching|checking|capturing|closing with runtime)/i

export function formatSpecialistDispatchInput(kind, question, extra = {}) {
  const spec = SPECIALIST_ROLES[kind] || SPECIALIST_ROLES.pentester
  const parts = [
    '[HARNESS SPECIALIST DISPATCH]',
    `Delegate immediately to the official \`${spec.tool}\` tool (${spec.title}).`,
    'useAgents is enabled. Do not solve this yourself. Do not start extra reconnaissance or create unrelated subtasks.',
    'After the specialist or mentor returns, reply with their result verbatim and stop.',
    '',
    'Task:',
    String(question ?? '').trim(),
  ]
  if (extra.code) parts.push('', 'Code:', String(extra.code))
  if (extra.output) parts.push('', 'Output:', String(extra.output))
  return parts.join('\n')
}

function specialistStub(role, question, extra = {}) {
  const next = extra.next ?? ['pg_web_search', 'pg_browser', 'pg_terminal']
  const base = {
    ok: true,
    dispatched: false,
    role,
    question,
    playbook: [
      'Call pg_search_in_memory then pg_web_search / pg_sploitus for intel.',
      'Call pg_browser on the target surface.',
      'Call pg_terminal for nmap/nuclei/ffuf/sqlmap/etc. — do not only write commands in prose.',
      'Call pg_file to keep notes, PoCs, and patches.',
      'Call pg_report_result then pg_done when the subtask is proven.',
    ],
    next,
  }
  if (role === 'adviser') {
    const counsel = [
      'Reproduce with the smallest command (pg_terminal).',
      'Diff expected vs actual (pg_file + pg_browser).',
      'Search public PoCs (pg_sploitus / pg_web_search mode=exploit).',
      'Do not claim a vuln without a returning proof (status/body/timing).',
    ]
    return {
      ...base,
      counsel,
      source: 'local',
      advice: counsel.join('\n'),
      result: counsel.join('\n'),
      ...extra,
    }
  }
  return { ...base, ...extra }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function extractAssistantResult(logs = []) {
  const ranked = ['report', 'answer', 'done']
  const items = [...logs].reverse()
  for (const type of ranked) {
    const hit = items.find((item) => {
      if (item?.type !== type) return false
      const text = String(item.result || item.message || '').trim()
      if (!text) return false
      if (type === 'answer' && ASSISTANT_NARRATION_RE.test(text)) return false
      return true
    })
    if (hit) return String(hit.result || hit.message)
  }
  return ''
}

function usableAdviceText(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (ASSISTANT_NARRATION_RE.test(text)) return ''
  return text
}

/** Mentor final answer from official advice channels — not assistant narration. */
export function extractAdviserAdvice(logs = [], agents = [], toolcalls = []) {
  const agentHit = [...agents].reverse().find(item => item?.executor === 'adviser' && usableAdviceText(item.result))
  if (agentHit) return { advice: usableAdviceText(agentHit.result), source: 'agentLog' }

  const adviceHit = [...logs].reverse().find(item => item?.type === 'advice' && usableAdviceText(item.result))
  if (adviceHit) return { advice: usableAdviceText(adviceHit.result), source: 'adviceLog' }

  const tcHit = [...toolcalls].reverse().find((item) => {
    const name = String(item?.name || '').trim()
    return name === 'advice' && usableAdviceText(item.result)
  })
  if (tcHit) return { advice: usableAdviceText(tcHit.result), source: 'toolCall' }

  return { advice: '', source: '' }
}

export function extractSpecialistResult(kind, logs = [], agents = [], toolcalls = []) {
  if (kind === 'adviser') {
    const hit = extractAdviserAdvice(logs, agents, toolcalls)
    if (hit.advice) return hit.advice
  }
  return extractAssistantResult(logs)
}

function adviserAdvicePresent(logs = [], agents = [], toolcalls = []) {
  return Boolean(extractAdviserAdvice(logs, agents, toolcalls).advice)
}

export function resolveKnowledgeIds(store, id) {
  const requested = String(id ?? '').trim()
  const docs = store?.documents ?? []
  const doc = docs.find(item => item.id === requested || item.localId === requested || item.remoteId === requested) ?? null
  const remoteId = String(doc?.remoteId || (!requested.startsWith('k-') ? requested : '') || '').trim()
  const localId = String(doc?.localId || (requested.startsWith('k-') ? requested : '') || '').trim()
  return { doc, localId, remoteId }
}

function rememberDispatch(env, entry) {
  const flows = flowStore(env)
  if (entry.flowId) flows.current = entry.flowId
  if (entry.assistantId) flows.currentAssistant = String(entry.assistantId)
  flows.dispatches = [...(flows.dispatches ?? []), { ...entry, at: new Date().toISOString() }].slice(-30)
  if (entry.assistantId) {
    flows.assistants = [...(flows.assistants ?? []), {
      id: String(entry.assistantId),
      flowId: entry.flowId,
      role: entry.role,
      input: entry.question,
      at: new Date().toISOString(),
    }].slice(-30)
  }
  saveFlows(flows, env)
}

async function ensureRemoteFlow(env) {
  const existing = currentFlowId({}, env)
  if (existing) return { flowId: existing, created: false }
  const listed = await graphql('query { flows { id title status } }', {}, env)
  const remoteFlows = listed.json?.data?.flows ?? []
  const waiting = remoteFlows.find(item => item.status === 'waiting')
  if (waiting?.id) return { flowId: String(waiting.id), created: false }
  const running = remoteFlows.find(item => item.status === 'running')
  if (running?.id) return { flowId: String(running.id), created: false }
  const provider = await defaultProviderName(env)
  const created = await graphql(
    'mutation CreateFlow($modelProvider: String!, $input: String!) { createFlow(modelProvider: $modelProvider, input: $input) { id title status } }',
    {
      modelProvider: provider,
      input: 'Harness specialist desk. Do not scan. No recon. Assistants will receive specialist dispatch tasks.',
    },
    env,
  )
  const id = created.json?.data?.createFlow?.id
  if (id) {
    const flows = flowStore(env)
    flows.current = String(id)
    flows.flows = [...(flows.flows ?? []), {
      id: String(id),
      title: created.json?.data?.createFlow?.title || 'Harness specialist desk',
      status: created.json?.data?.createFlow?.status || 'running',
      input: 'Harness specialist desk',
      at: new Date().toISOString(),
    }].slice(-30)
    saveFlows(flows, env)
  }
  return { flowId: id ? String(id) : '', created: true, remote: created }
}

const ASSISTANT_WATCH_GQL = 'query WatchAsst($flowId: ID!, $assistantId: ID!) { assistants(flowId: $flowId) { id title status useAgents updatedAt } assistantLogs(flowId: $flowId, assistantId: $assistantId) { id type message result createdAt } agentLogs(flowId: $flowId) { id initiator executor task result createdAt } toolCallLogs(flowId: $flowId) { id name status result createdAt } }'

async function pollOfficialAssistant(flowId, assistantId, env, timeoutMs = SPECIALIST_POLL_MS, kind = '') {
  const deadline = Date.now() + Math.max(5_000, timeoutMs)
  let snapshot = { status: 'running', logs: [], agents: [], toolcalls: [], assistants: [] }
  while (Date.now() < deadline) {
    const watch = await graphql(ASSISTANT_WATCH_GQL, { flowId, assistantId }, env)
    const assistants = watch.json?.data?.assistants ?? []
    const match = assistants.find(item => String(item.id) === String(assistantId)) || assistants[0] || {}
    const logs = watch.json?.data?.assistantLogs ?? []
    const agents = watch.json?.data?.agentLogs ?? []
    const toolcalls = watch.json?.data?.toolCallLogs ?? []
    snapshot = {
      ok: watch.ok,
      status: match.status || 'running',
      useAgents: match.useAgents,
      logs,
      agents: agents.slice(-40),
      toolcalls: toolcalls.slice(-40),
      assistants,
      remote: watch,
    }
    const settled = ['waiting', 'finished', 'failed'].includes(snapshot.status)
    if (settled) {
      if (kind === 'adviser' && snapshot.status !== 'failed' && !adviserAdvicePresent(snapshot.logs, snapshot.agents, snapshot.toolcalls) && Date.now() < deadline) {
        await delay(SPECIALIST_POLL_INTERVAL_MS)
        continue
      }
      break
    }
    await delay(SPECIALIST_POLL_INTERVAL_MS)
  }
  snapshot.result = extractSpecialistResult(kind, snapshot.logs, snapshot.agents, snapshot.toolcalls)
  snapshot.advice = kind === 'adviser' ? extractAdviserAdvice(snapshot.logs, snapshot.agents, snapshot.toolcalls) : null
  snapshot.supervision = (snapshot.agents ?? []).map(item => `${item.initiator}→${item.executor}`).filter(Boolean)
  return snapshot
}

function authRejected(remote) {
  const status = Number(remote?.status)
  const text = `${remote?.error || ''} ${remote?.body || ''} ${JSON.stringify(remote?.json || {})}`
  return status === 401 || status === 403 || /AuthRequired|auth required|unauthorized/i.test(text)
}

async function dispatchSpecialist(kind, args, env) {
  const spec = SPECIALIST_ROLES[kind] || SPECIALIST_ROLES.pentester
  const question = String(args.question ?? '')
  const extra = { message: args.message, code: args.code, output: args.output }
  const stub = specialistStub(spec.role, question, extra)
  if (!pentagiToken(env)) {
    const minted = await ensurePentagiApiToken(() => {}, env)
    if (!minted.ok || !minted.token) {
      return { ...stub, reason: minted.error || 'missing DSH_PENTAGI_TOKEN', minted }
    }
  }
  const flowInfo = await ensureRemoteFlow(env)
  if (!flowInfo.flowId) {
    return { ...stub, reason: 'no remote flow', flow: flowInfo }
  }
  const provider = await defaultProviderName(env)
  const input = formatSpecialistDispatchInput(kind, question, extra)
  const createVars = { flowId: flowInfo.flowId, modelProvider: provider, input, useAgents: true }
  const createGql = 'mutation CreateAsst($flowId: ID!, $modelProvider: String!, $input: String!, $useAgents: Boolean!) { createAssistant(flowId: $flowId, modelProvider: $modelProvider, input: $input, useAgents: $useAgents) { assistant { id title status useAgents } flow { id status } } }'
  let created = await graphql(createGql, createVars, env, 60_000)
  if (authRejected(created)) {
    const reminted = await ensurePentagiApiToken(() => {}, env, { force: true })
    if (reminted.ok && reminted.token) {
      created = await graphql(createGql, createVars, env, 60_000)
    }
  }
  const assistant = created.json?.data?.createAssistant?.assistant
  const assistantId = assistant?.id != null ? String(assistant.id) : ''
  if (!created.ok || !assistantId) {
    return {
      ...stub,
      reason: created.error || created.json?.errors?.[0]?.message || 'createAssistant failed',
      flowId: flowInfo.flowId,
      remote: created,
    }
  }
  rememberDispatch(env, {
    role: spec.role,
    kind,
    flowId: flowInfo.flowId,
    assistantId,
    question,
    provider,
  })
  const timeoutMs = Number(args.timeout) > 0
    ? Math.min(Number(args.timeout) * 1000, 600_000)
    : (kind === 'adviser' ? SPECIALIST_ADVISER_POLL_MS : SPECIALIST_POLL_MS)
  const watch = await pollOfficialAssistant(flowInfo.flowId, assistantId, env, timeoutMs, kind)
  const settled = ['waiting', 'finished', 'failed'].includes(watch.status)
  if (kind === 'adviser') {
    const extracted = watch.advice || extractAdviserAdvice(watch.logs, watch.agents, watch.toolcalls)
    const advice = String(extracted.advice || watch.result || '').trim()
    const payload = {
      ok: created.ok && watch.status !== 'failed',
      dispatched: true,
      role: spec.role,
      tool: spec.tool,
      question,
      flowId: flowInfo.flowId,
      assistantId,
      provider,
      useAgents: true,
      status: watch.status,
      settled,
      source: extracted.source || (advice ? 'assistant' : ''),
      advice,
      result: advice,
      supervision: watch.supervision ?? [],
      message: args.message ?? '',
    }
    if (!advice) {
      payload.hint = settled
        ? 'Mentor finished without a final answer.'
        : 'Official assistant still running; pg_advice waits up to 180s for the mentor final answer.'
    }
    return payload
  }
  const payload = {
    ok: created.ok && watch.status !== 'failed',
    dispatched: true,
    role: spec.role,
    tool: spec.tool,
    question,
    flowId: flowInfo.flowId,
    assistantId,
    provider,
    useAgents: true,
    status: watch.status,
    settled,
    result: watch.result ?? '',
    logs: watch.logs ?? [],
    agents: watch.agents ?? [],
    supervision: watch.supervision ?? [],
    remote: created,
    message: args.message ?? '',
  }
  if (!settled) {
    payload.hint = 'Official assistant still running; poll pg_flow_logs kind=agent or call pg_flow_wait.'
  }
  return payload
}

async function executePentagiTool(name, args = {}, env = process.env) {
  const a = args ?? {}
  switch (name) {
    case 'pg_status': {
      const runtime = await probePentagiRuntime(env)
      return { ...runtime, tools: PENTAGI_TOOLS.map(t => t.name), store: storeDir(env) }
    }
    case 'pg_backend_start': {
      const runtime = await startPentagiRuntime(() => {}, env)
      return { ...runtime, started: true }
    }
    case 'pg_backend_stop': {
      const runtime = await stopPentagiRuntime(() => {}, env)
      return { ...runtime, stopped: true }
    }
    case 'pg_terminal':
      return runTerminal(a, env)
    case 'pg_file': {
      const filePath = resolve(String(a.path ?? ''))
      if (a.action === 'read_file') {
        if (!existsSync(filePath)) return { ok: false, error: `missing ${filePath}` }
        const content = readFileSync(filePath, 'utf8')
        return { ok: true, path: filePath, bytes: content.length, content: content.slice(0, 200_000) }
      }
      if (a.action === 'write_file') {
        mkdirSync(dirname(filePath), { recursive: true })
        writeFileSync(filePath, String(a.content ?? ''))
        return { ok: true, path: filePath, bytes: String(a.content ?? '').length, action: 'write_file' }
      }
      if (a.action === 'edit_file') {
        if (!existsSync(filePath)) return { ok: false, error: `missing ${filePath}` }
        const original = readFileSync(filePath, 'utf8')
        try {
          const next = applyEdit(original, a.diff)
          writeFileSync(filePath, next)
          return { ok: true, path: filePath, action: 'edit_file', bytes: next.length }
        } catch (error) {
          return { ok: false, error: String(error.message) }
        }
      }
      return { ok: false, error: 'action must be read_file|write_file|edit_file' }
    }
    case 'pg_browser': {
      const target = String(a.url ?? '')
      const action = a.action || 'markdown'
      const scraped = await fetchViaScraper(target, action, env)
      if (scraped.ok && scraped.text) {
        if (action === 'html') return { ok: true, engine: 'scraper', status: scraped.status, url: target, html: scraped.text.slice(0, 80_000) }
        if (action === 'links') return { ok: true, engine: 'scraper', status: scraped.status, url: target, links: extractLinks(scraped.text, target), raw: scraped.text.slice(0, 20_000) }
        if (action === 'screenshot') return { ok: true, engine: 'scraper', status: scraped.status, url: target, screenshot: scraped.text.slice(0, 20_000) }
        return { ok: true, engine: 'scraper', status: scraped.status, url: target, markdown: scraped.text.slice(0, 80_000) }
      }
      const page = await httpGet(target)
      if (action === 'html') return { ok: page.ok, fallback: 'http', status: page.status, url: page.url, html: page.text.slice(0, 80_000), scraper: scraped }
      if (action === 'links') return { ok: page.ok, fallback: 'http', status: page.status, url: page.url, links: extractLinks(page.text, page.url), scraper: scraped }
      return { ok: page.ok, fallback: 'http', status: page.status, url: page.url, markdown: htmlToText(page.text).slice(0, 80_000), scraper: scraped }
    }
    case 'pg_duckduckgo':
    case 'pg_google':
      return duckduckgo(String(a.query ?? ''), Number(a.max_results) || 5)
    case 'pg_web_search': {
      if (a.mode === 'exploit') return sploitus(String(a.query ?? ''), Number(a.max_results) || 10, a.exploit_type || 'exploits')
      if (a.mode === 'research') {
        const pplx = await perplexityRun(String(a.query ?? ''), env)
        if (pplx) return { ...pplx, mode: 'research' }
      }
      const tav = await tavilySearch(String(a.query ?? ''), Number(a.max_results) || 5, env)
      if (tav?.ok) return { ...tav, mode: a.mode ?? 'answer' }
      const web = await duckduckgo(String(a.query ?? ''), Number(a.max_results) || 5)
      if (a.mode === 'links') return web
      const topHref = web.results?.[0]?.href
      if (topHref && !/duckduckgo\.com/i.test(topHref)) {
        const page = await httpGet(topHref)
        return { ...web, mode: a.mode ?? 'answer', top: { url: page.url, text: htmlToText(page.text).slice(0, 12_000) } }
      }
      return { ...web, mode: a.mode ?? 'answer' }
    }
    case 'pg_tavily': {
      const tav = await tavilySearch(String(a.query ?? ''), Number(a.max_results) || 5, env)
      return tav ?? { ...(await duckduckgo(String(a.query ?? ''), Number(a.max_results) || 5)), fallback: 'duckduckgo', requested: 'tavily' }
    }
    case 'pg_firecrawl': {
      const fc = await firecrawlRun(a, env)
      if (fc) return fc
      if (a.url) {
        const page = await httpGet(String(a.url))
        return { ok: page.ok, fallback: 'browser', url: page.url, markdown: htmlToText(page.text).slice(0, 80_000) }
      }
      return duckduckgo(String(a.query ?? ''), 5)
    }
    case 'pg_perplexity': {
      const pplx = await perplexityRun(String(a.query ?? ''), env)
      return pplx ?? { ...(await duckduckgo(String(a.query ?? ''), 5)), fallback: 'duckduckgo', requested: 'perplexity' }
    }
    case 'pg_searxng': {
      const sx = await searxngRun(String(a.query ?? ''), Number(a.max_results) || 5, env)
      return sx ?? { ...(await duckduckgo(String(a.query ?? ''), Number(a.max_results) || 5)), fallback: 'duckduckgo', requested: 'searxng' }
    }
    case 'pg_traversaal': {
      const tr = await traversaalRun(String(a.query ?? ''), env)
      return tr ?? { ...(await duckduckgo(String(a.query ?? ''), 5)), fallback: 'duckduckgo', requested: 'traversaal' }
    }
    case 'pg_sploitus':
      return sploitus(String(a.query ?? ''), Number(a.max_results) || 10, a.exploit_type || 'exploits')
    case 'pg_search_in_memory':
    case 'pg_memorist': {
      const mem = memoryStore(env)
      const questions = a.questions ?? [a.question]
      return {
        ok: true,
        answers: searchBucket(mem.answers, questions),
        guides: searchBucket(mem.guides, questions),
        codes: searchBucket(mem.codes, questions),
        notes: searchBucket(mem.notes, questions),
      }
    }
    case 'pg_store_answer': {
      const mem = memoryStore(env)
      mem.answers.push({ type: a.type, question: a.question, answer: a.answer, at: new Date().toISOString() })
      saveMemory(mem, env)
      return { ok: true, stored: 'answer', count: mem.answers.length }
    }
    case 'pg_search_answer': {
      const mem = memoryStore(env)
      return { ok: true, hits: searchBucket(mem.answers, a.questions, item => !a.type || item.type === a.type) }
    }
    case 'pg_store_guide': {
      const mem = memoryStore(env)
      mem.guides.push({ type: a.type, question: a.question, guide: a.guide, at: new Date().toISOString() })
      saveMemory(mem, env)
      return { ok: true, stored: 'guide', count: mem.guides.length }
    }
    case 'pg_search_guide': {
      const mem = memoryStore(env)
      return { ok: true, hits: searchBucket(mem.guides, a.questions, item => !a.type || item.type === a.type) }
    }
    case 'pg_store_code': {
      const mem = memoryStore(env)
      mem.codes.push({
        lang: a.lang, question: a.question, code: a.code,
        explanation: a.explanation, description: a.description, at: new Date().toISOString(),
      })
      saveMemory(mem, env)
      return { ok: true, stored: 'code', count: mem.codes.length }
    }
    case 'pg_search_code': {
      const mem = memoryStore(env)
      return { ok: true, hits: searchBucket(mem.codes, a.questions, item => !a.lang || item.lang === a.lang) }
    }
    case 'pg_subtask_list': {
      const flows = flowStore(env)
      flows.subtasks = (a.subtasks ?? []).map((item, index) => ({
        id: index + 1,
        status: 'created',
        title: item.title,
        description: item.description,
      }))
      saveFlows(flows, env)
      return { ok: true, subtasks: flows.subtasks, message: a.message }
    }
    case 'pg_subtask_patch': {
      const flows = flowStore(env)
      let list = Array.isArray(flows.subtasks) ? [...flows.subtasks] : []
      for (const op of a.operations ?? []) {
        if (op.op === 'add') {
          const id = (list.reduce((m, s) => Math.max(m, Number(s.id) || 0), 0) || 0) + 1
          const item = { id, status: 'created', title: op.title, description: op.description }
          const idx = list.findIndex(s => Number(s.id) === Number(op.after_id))
          if (idx >= 0) list.splice(idx + 1, 0, item)
          else list.unshift(item)
        } else if (op.op === 'remove') {
          list = list.filter(s => Number(s.id) !== Number(op.id))
        } else if (op.op === 'modify') {
          const hit = list.find(s => Number(s.id) === Number(op.id))
          if (hit) {
            if (op.title) hit.title = op.title
            if (op.description) hit.description = op.description
          }
        } else if (op.op === 'reorder') {
          const i = list.findIndex(s => Number(s.id) === Number(op.id))
          if (i >= 0) {
            const [item] = list.splice(i, 1)
            const j = list.findIndex(s => Number(s.id) === Number(op.after_id))
            if (j >= 0) list.splice(j + 1, 0, item)
            else list.unshift(item)
          }
        }
      }
      flows.subtasks = list
      saveFlows(flows, env)
      return { ok: true, subtasks: list, message: a.message }
    }
    case 'pg_graphiti_search': {
      const mem = memoryStore(env)
      const hits = searchBucket([...mem.answers, ...mem.guides, ...mem.codes, ...mem.notes], [a.query])
      return { ok: true, search_type: a.search_type, query: a.query, hits, note: 'local ledger; Neo4j Graphiti only when remote backend is up' }
    }
    case 'pg_flow_wait': {
      const sec = !a.timeout || a.timeout <= 0 ? 60 : Math.min(Number(a.timeout), 3600)
      const flows = flowStore(env)
      const flowId = currentFlowId(a, env)
      if (!flowId || !pentagiToken(env)) {
        return { ok: true, waited: 0, current: flows.current, subtasks: flows.subtasks, remote: false, message: a.message }
      }
      const deadline = Date.now() + sec * 1000
      let remote = null
      let status = 'running'
      while (Date.now() < deadline) {
        remote = await graphql(
          'query WaitFlow($flowId: ID!) { flow(flowId: $flowId) { id title status updatedAt } assistants(flowId: $flowId) { id title status } tasks(flowId: $flowId) { id title status } }',
          { flowId },
          env,
        )
        status = remote.json?.data?.flow?.status || 'unknown'
        const assistants = remote.json?.data?.assistants ?? []
        const live = assistants.some(item => item.status === 'running')
        if (['waiting', 'finished', 'failed'].includes(status) && !live) break
        await delay(2_500)
      }
      return {
        ok: true,
        waited: Math.round((Math.min(Date.now(), deadline) - (deadline - sec * 1000)) / 1000),
        flowId,
        status,
        remote,
        current: flows.current,
        subtasks: flows.subtasks,
        message: a.message,
      }
    }
    case 'pg_flow_report': {
      const flowId = currentFlowId(a, env)
      if (!flowId) return { ok: false, error: 'no flowId' }
      const remote = await graphql(
        'query Report($flowId: ID!) { flow(flowId: $flowId) { id title status updatedAt } tasks(flowId: $flowId) { id title status input result subtasks { id title status description result } } }',
        { flowId },
        env,
      )
      const flow = remote.json?.data?.flow
      const tasks = remote.json?.data?.tasks ?? []
      const markdown = generateFlowMarkdown(flow || { id: flowId, title: 'flow', status: 'unknown' }, tasks)
      const work = join(userHome(env), 'pentagi', 'sandbox-work')
      mkdirSync(work, { recursive: true })
      const slug = String(flow?.title || 'flow').replace(/[^\w.-]+/g, '_').slice(0, 40)
      const path = join(work, `report_flow_${flowId}_${slug}.md`)
      writeFileSync(path, markdown)
      return { ok: remote.ok, flowId, path, bytes: markdown.length, markdown, remote }
    }
    case 'pg_report_result':
    case 'pg_done': {
      const flows = flowStore(env)
      const entry = {
        at: new Date().toISOString(),
        success: a.success !== false,
        result: a.result,
        message: a.message,
        kind: name === 'pg_done' ? 'done' : 'report',
      }
      flows.notes = [...(flows.notes ?? []), entry].slice(-50)
      if (name === 'pg_done' && Array.isArray(flows.subtasks) && flows.subtasks.length > 0) {
        const open = flows.subtasks.find(item => item.status !== 'done')
        if (open) open.status = a.success === false ? 'failed' : 'done'
      }
      saveFlows(flows, env)
      return { ok: true, entry, subtasks: flows.subtasks }
    }
    case 'pg_ask':
      return { ok: true, ask: a.message, hint: 'Surface this question to the user; wait for the next turn.' }
    case 'pg_pentester':
      return dispatchSpecialist('pentester', a, env)
    case 'pg_coder':
      return dispatchSpecialist('coder', a, env)
    case 'pg_maintenance':
      return dispatchSpecialist('maintenance', a, env)
    case 'pg_advice':
      return dispatchSpecialist('adviser', a, env)
    case 'pg_searcher':
      return dispatchSpecialist('searcher', a, env)
    case 'pg_search': {
      const mem = memoryStore(env)
      const local = searchBucket([...mem.answers, ...mem.guides, ...mem.codes], [a.question])
      const web = await duckduckgo(String(a.question ?? ''), 5)
      return { ok: true, local, web }
    }
    case 'pg_flow_create': {
      const provider = a.modelProvider || await defaultProviderName(env)
      const remote = await graphql(
        'mutation CreateFlow($modelProvider: String!, $input: String!) { createFlow(modelProvider: $modelProvider, input: $input) { id title status } }',
        { modelProvider: provider, input: a.input },
        env,
      )
      const flows = flowStore(env)
      const remoteId = remote.json?.data?.createFlow?.id
      const local = {
        id: remoteId || `local-${Date.now()}`,
        title: remote.json?.data?.createFlow?.title || String(a.input).slice(0, 80),
        status: remote.json?.data?.createFlow?.status || 'running',
        input: a.input,
        provider,
        at: new Date().toISOString(),
      }
      flows.current = local.id
      flows.flows = [...(flows.flows ?? []), local].slice(-30)
      saveFlows(flows, env)
      return { ok: Boolean(remoteId) || remote.ok, provider, local, remote }
    }
    case 'pg_flow_status': {
      const flows = flowStore(env)
      const flowId = currentFlowId(a, env)
      const remote = flowId
        ? await graphql('query Flow($flowId: ID!) { flow(flowId: $flowId) { id title status updatedAt } tasks(flowId: $flowId) { id title status result } }', { flowId }, env)
        : await graphql('query { flows { id title status } }', {}, env)
      return { ok: true, detail: a.detail ?? 'summary', flowId: flowId || null, local: flows, remote }
    }
    case 'pg_flow_input': {
      const flows = flowStore(env)
      const flowId = currentFlowId(a, env)
      const remote = flowId
        ? await graphql('mutation Put($flowId: ID!, $input: String!) { putUserInput(flowId: $flowId, input: $input) }', { flowId, input: a.input }, env)
        : { ok: false, error: 'no remote flowId' }
      flows.notes = [...(flows.notes ?? []), { at: new Date().toISOString(), kind: 'input', input: a.input }].slice(-50)
      saveFlows(flows, env)
      return { ok: true, flowId, remote }
    }
    case 'pg_flow_stop': {
      const flows = flowStore(env)
      const flowId = currentFlowId(a, env)
      const remote = flowId
        ? await graphql('mutation Stop($flowId: ID!) { stopFlow(flowId: $flowId) }', { flowId }, env)
        : { ok: false, error: 'no remote flowId' }
      const current = (flows.flows ?? []).find(item => item.id === flowId)
      if (current) current.status = 'stopped'
      saveFlows(flows, env)
      return { ok: true, flowId, reason: a.reason, remote }
    }
    case 'pg_flow_finish': {
      const flows = flowStore(env)
      const flowId = currentFlowId(a, env)
      const remote = flowId
        ? await graphql('mutation Finish($flowId: ID!) { finishFlow(flowId: $flowId) }', { flowId }, env)
        : { ok: false, error: 'no remote flowId' }
      const current = (flows.flows ?? []).find(item => item.id === flowId)
      if (current) current.status = 'finished'
      saveFlows(flows, env)
      return { ok: true, flowId, remote }
    }
    case 'pg_flow_rename': {
      const flows = flowStore(env)
      const flowId = currentFlowId(a, env)
      const remote = flowId
        ? await graphql('mutation Rename($flowId: ID!, $title: String!) { renameFlow(flowId: $flowId, title: $title) }', { flowId, title: a.title }, env)
        : { ok: false, error: 'no remote flowId' }
      const current = (flows.flows ?? []).find(item => item.id === flowId)
      if (current) current.title = a.title
      saveFlows(flows, env)
      return { ok: true, flowId, title: a.title, remote }
    }
    case 'pg_assistant_create': {
      const flows = flowStore(env)
      const flowId = currentFlowId(a, env)
      const remote = flowId
        ? await graphql(
          'mutation CreateAsst($flowId: ID!, $modelProvider: String!, $input: String!, $useAgents: Boolean!) { createAssistant(flowId: $flowId, modelProvider: $modelProvider, input: $input, useAgents: $useAgents) { assistant { id title status } flow { id status } } }',
          { flowId, modelProvider: a.modelProvider || await defaultProviderName(env), input: a.input, useAgents: a.useAgents !== false },
          env,
        )
        : { ok: false, error: 'no flowId' }
      const local = { id: `asst-${Date.now()}`, flowId, input: a.input, at: new Date().toISOString() }
      flows.assistants = [...(flows.assistants ?? []), local].slice(-30)
      flows.currentAssistant = local.id
      saveFlows(flows, env)
      return { ok: true, local, remote }
    }
    case 'pg_assistant_call': {
      const flows = flowStore(env)
      const flowId = currentFlowId(a, env)
      const assistantId = a.assistantId || flows.currentAssistant
      const remote = flowId && assistantId
        ? await graphql(
          'mutation CallAsst($flowId: ID!, $assistantId: ID!, $input: String!, $useAgents: Boolean!) { callAssistant(flowId: $flowId, assistantId: $assistantId, input: $input, useAgents: $useAgents) }',
          { flowId, assistantId, input: a.input, useAgents: a.useAgents !== false },
          env,
        )
        : { ok: false, error: 'need flowId and assistantId' }
      return { ok: true, flowId, assistantId, remote }
    }
    case 'pg_assistant_stop': {
      const flows = flowStore(env)
      const flowId = currentFlowId(a, env)
      const assistantId = a.assistantId || flows.currentAssistant
      const remote = flowId && assistantId
        ? await graphql(
          'mutation StopAsst($flowId: ID!, $assistantId: ID!) { stopAssistant(flowId: $flowId, assistantId: $assistantId) { id status } }',
          { flowId, assistantId },
          env,
        )
        : { ok: false, error: 'need flowId and assistantId' }
      return { ok: true, flowId, assistantId, remote }
    }
    case 'pg_knowledge_search': {
      const remote = await graphql(
        KNOWLEDGE_SEARCH_GQL,
        { query: a.query, limit: a.limit || 8 },
        env,
      )
      const local = searchBucket(knowledgeLocal(env).documents, [a.query])
      return { ok: true, local, remote }
    }
    case 'pg_knowledge_create': {
      const remote = await graphql(
        'mutation CreateK($input: CreateKnowledgeDocumentInput!) { createKnowledgeDocument(input: $input) { id question docType } }',
        { input: { docType: a.docType, content: a.content, question: a.question, description: a.description, codeLang: a.codeLang } },
        env,
      )
      const store = knowledgeLocal(env)
      const localId = `k-${Date.now()}`
      const remoteId = remote.json?.data?.createKnowledgeDocument?.id ? String(remote.json.data.createKnowledgeDocument.id) : ''
      const doc = {
        ...a,
        id: remoteId || localId,
        localId,
        remoteId: remoteId || null,
        at: new Date().toISOString(),
      }
      store.documents.push(doc)
      saveKnowledge(store, env)
      return { ok: true, local: doc, remote }
    }
    case 'pg_knowledge_get': {
      if (a.id) {
        const store = knowledgeLocal(env)
        const resolved = resolveKnowledgeIds(store, a.id)
        const remoteLookup = resolved.remoteId || a.id
        const remote = await graphql('query K($id: String!) { knowledgeDocument(id: $id) { id question description docType content } }', { id: remoteLookup }, env)
        return { ok: true, local: resolved.doc, remote }
      }
      const remote = await graphql('query { knowledgeDocuments(withContent: false) { id question docType description } }', {}, env)
      return { ok: true, local: knowledgeLocal(env).documents, remote }
    }
    case 'pg_knowledge_delete': {
      const store = knowledgeLocal(env)
      const resolved = resolveKnowledgeIds(store, a.id)
      let remoteId = resolved.remoteId
      if (!remoteId && resolved.doc?.question) {
        const listed = await graphql('query { knowledgeDocuments(withContent: false) { id question } }', {}, env)
        const match = (listed.json?.data?.knowledgeDocuments ?? []).find(item => item.question === resolved.doc.question)
        if (match?.id) remoteId = String(match.id)
      }
      const remote = remoteId
        ? await graphql('mutation DelK($id: String!) { deleteKnowledgeDocument(id: $id) }', { id: remoteId }, env)
        : { ok: false, skipped: true, error: 'no remote uuid; local-only document' }
      store.documents = store.documents.filter(d => d.id !== a.id && d.localId !== a.id && d.remoteId !== a.id && d.remoteId !== remoteId)
      saveKnowledge(store, env)
      return { ok: true, id: a.id, localId: resolved.localId || null, remoteId: remoteId || null, remote }
    }
    case 'pg_flow_files': {
      const flowId = currentFlowId(a, env)
      if (!flowId) return { ok: false, error: 'no flowId' }
      const action = a.action || 'list'
      if (action === 'container') return rest('GET', flowFilesRestPath(flowId, 'container'), { query: a.path ? { path: a.path } : {} }, env)
      if (action === 'download') return rest('GET', flowFilesRestPath(flowId, 'download'), { query: { path: a.path } }, env)
      if (action === 'upload') {
        const localPath = String(a.path || '').trim()
        let filename = String(a.filename || '').trim()
        let body
        if (localPath && existsSync(localPath) && !localPath.startsWith('/work')) {
          body = readFileSync(localPath)
          if (!filename) filename = localPath.split('/').pop()
        } else if (a.content !== undefined) {
          body = Buffer.from(String(a.content), 'utf8')
          if (!filename) filename = localPath.split('/').pop() || 'upload.txt'
        } else {
          return { ok: false, error: 'upload needs a host path or content+filename' }
        }
        const multipart = buildMultipart([{ field: 'files', filename, body }])
        return rest('POST', flowFilesRestPath(flowId), { multipart }, env)
      }
      if (action === 'pull') {
        const path = String(a.path || '').trim()
        if (!path) return { ok: false, error: 'pull needs path (container absolute path)' }
        return rest('POST', flowFilesRestPath(flowId, 'pull'), { json: { path, force: a.force === true } }, env)
      }
      if (action === 'delete') {
        const path = String(a.path || '').trim()
        if (!path) return { ok: false, error: 'delete needs cache path (uploads/…, resources/…, container/…)' }
        return rest('DELETE', flowFilesRestPath(flowId), { query: { path } }, env)
      }
      if (action === 'attach') {
        const ids = String(a.ids || a.path || '')
          .split(/[,\s]+/)
          .map(v => Number(v))
          .filter(n => Number.isInteger(n) && n > 0)
        if (!ids.length) return { ok: false, error: 'attach needs ids (comma-separated resource ids)' }
        return rest('POST', flowFilesRestPath(flowId, 'resources'), { json: { ids, force: a.force === true } }, env)
      }
      if (action === 'promote') {
        const source = String(a.path || '').trim()
        const destination = String(a.destination || '').trim()
        if (!source || !destination) return { ok: false, error: 'promote needs path (cache source) and destination' }
        return rest('POST', flowFilesRestPath(flowId, 'to-resources'), { json: { source, destination, force: a.force === true } }, env)
      }
      const gql = await graphql('query Files($flowId: ID!) { flowFiles(flowId: $flowId) { id name path size isDir } }', { flowId }, env)
      const restList = await rest('GET', flowFilesRestPath(flowId), {}, env)
      return { ok: true, flowId, graphql: gql, rest: restList }
    }
    case 'pg_flow_logs': {
      const flowId = currentFlowId(a, env)
      if (!flowId) return { ok: false, error: 'no flowId' }
      const kind = a.kind
      const queries = {
        terminal: 'query L($flowId: ID!) { terminalLogs(flowId: $flowId) { id type text createdAt } }',
        message: 'query L($flowId: ID!) { messageLogs(flowId: $flowId) { id type message result createdAt } }',
        agent: 'query L($flowId: ID!) { agentLogs(flowId: $flowId) { id initiator executor task result createdAt } }',
        search: 'query L($flowId: ID!) { searchLogs(flowId: $flowId) { id engine query result createdAt } }',
        toolcall: 'query L($flowId: ID!) { toolCallLogs(flowId: $flowId) { id name status createdAt } }',
        screenshot: 'query L($flowId: ID!) { screenshots(flowId: $flowId) { id name url createdAt } }',
        vector: 'query L($flowId: ID!) { vectorStoreLogs(flowId: $flowId) { id action query result createdAt } }',
      }
      const q = queries[kind]
      if (!q) return { ok: false, error: `unknown kind ${kind}` }
      return graphql(q, { flowId }, env)
    }
    case 'pg_flow_watch': {
      const flows = flowStore(env)
      const flowId = currentFlowId(a, env)
      const remote = flowId
        ? await graphql('query W($flowId: ID!) { flow(flowId: $flowId) { id title status updatedAt } tasks(flowId: $flowId) { id title status } }', { flowId }, env)
        : { ok: false, error: 'no flowId' }
      return { ok: true, polled: true, flowId, local: flows, remote, note: 'GraphQL subscription stand-in; poll this tool' }
    }
    default:
      return { error: `unknown pentagi tool ${name}` }
  }
}

export async function runPentagiTool(name, args = {}, env = process.env) {
  return jsonSafe(await executePentagiTool(name, args, env))
}

export { jsonOutput as PENTAGI_JSON_OUTPUT }
