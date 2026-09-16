import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'


const here = dirname(fileURLToPath(import.meta.url))
const SYNC_PREFIX = 'dsh-'

function userHome(env = process.env) {
  const configured = String(env.DSH_HOME ?? '').trim()
  if (configured) return resolve(configured)
  return join(homedir(), '.dsh')
}

function readCredentials(env = process.env) {
  const file = join(userHome(env), '.credentials.yaml')
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+):\s*(.+)\s*$/)
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

function parseHarnessProviders(text) {
  const lines = String(text || '').split(/\r?\n/)
  const providers = {}
  let inPi = false
  let inProviders = false
  let current = null
  let inModels = false
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ')
    if (!inPi) {
      if (/^llm-pi-ai:\s*$/.test(line)) inPi = true
      continue
    }
    if (/^\S/.test(line) && !/^llm-pi-ai:/.test(line)) break
    if (!inProviders) {
      if (/^\s{2}providers:\s*$/.test(line)) inProviders = true
      continue
    }
    if (/^\s{2}\S/.test(line) && !/^\s{2}providers:/.test(line)) {
      inProviders = false
      continue
    }
    const idMatch = line.match(/^\s{4}([A-Za-z0-9._-]+):\s*$/)
    if (idMatch) {
      current = idMatch[1]
      providers[current] = { id: current, models: [] }
      inModels = false
      continue
    }
    if (!current) continue
    if (/^\s{6}models:\s*$/.test(line)) {
      inModels = true
      continue
    }
    if (inModels) {
      const modelId = line.match(/^\s{8,}- id:\s*(.+)\s*$/) || line.match(/^\s{10,}id:\s*(.+)\s*$/)
      if (modelId) {
        providers[current].models.push({ id: modelId[1].trim().replace(/^['"]|['"]$/g, '') })
        continue
      }
      const modelName = line.match(/^\s{10,}name:\s*(.+)\s*$/)
      if (modelName && providers[current].models.length) {
        providers[current].models[providers[current].models.length - 1].name = modelName[1].trim().replace(/^['"]|['"]$/g, '')
        continue
      }
      if (/^\s{6}\S/.test(line) && !/^\s{6}models:/.test(line)) inModels = false
    }
    const kv = line.match(/^\s{6}(displayName|apiKeyEnv|api|baseURL):\s*(.+)\s*$/)
    if (kv) providers[current][kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return Object.values(providers)
}

export function listHarnessLlmProviders(env = process.env) {
  const settingsFile = join(userHome(env), 'settings.yaml')
  const text = existsSync(settingsFile) ? readFileSync(settingsFile, 'utf8') : ''
  const creds = readCredentials(env)
  const parsed = parseHarnessProviders(text)
  const defaultMatch = text.match(/agent-default-model:[\s\S]*?provider:\s*(\S+)/)
  const defaultProvider = defaultMatch ? defaultMatch[1] : ''
  const defaultModel = (text.match(/agent-default-model:[\s\S]*?model:\s*(\S+)/) || [])[1] || ''
  return parsed.map((p) => {
    const key = creds[p.apiKeyEnv] || ''
    const models = p.models?.length ? p.models : [{ id: defaultModel || 'default' }]
    return {
      id: p.id,
      displayName: p.displayName || p.id,
      apiKeyEnv: p.apiKeyEnv || '',
      api: p.api || 'openai-completions',
      baseURL: String(p.baseURL || '').replace(/\/$/, ''),
      model: models[0]?.id || defaultModel || 'default',
      models,
      hasKey: Boolean(key),
      key,
      isDefault: p.id === defaultProvider,
    }
  }).filter(p => p.baseURL && p.hasKey)
}

function containerBaseUrl(url) {
  try {
    const u = new URL(url)
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      u.hostname = 'host.docker.internal'
      return u.toString().replace(/\/$/, '')
    }
  } catch { /* keep */ }
  return String(url).replace(/\/$/, '')
}

async function probeOpenAi(baseURL, key, model) {
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const modelsUrl = `${baseURL}/models`
  try {
    const res = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const json = await res.json().catch(() => ({}))
      const ids = (json.data || json.models || []).map(m => m.id || m.name).filter(Boolean)
      const chosen = (model && (ids.length === 0 || ids.includes(model))) ? model : (ids.includes(model) ? model : model || ids[0])
      return { ok: true, via: 'models', status: res.status, model: chosen || model, models: ids.slice(0, 12) }
    }
    if (res.status === 401 || res.status === 403) return { ok: false, via: 'models', status: res.status, error: `HTTP ${res.status}` }
  } catch (error) {
    /* try chat */
    if (String(error).includes('401')) return { ok: false, via: 'models', error: String(error.message || error) }
  }
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(12000),
    })
    const text = await res.text()
    if (res.ok || res.status === 400) return { ok: true, via: 'chat', status: res.status, model }
    return { ok: false, via: 'chat', status: res.status, error: text.slice(0, 180) }
  } catch (error) {
    return { ok: false, via: 'chat', error: String(error.message || error) }
  }
}

async function probeEmbeddings(baseURL, key) {
  try {
    const res = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: 'ping' }),
      signal: AbortSignal.timeout(8000),
    })
    return { ok: res.ok, status: res.status }
  } catch (error) {
    return { ok: false, error: String(error.message || error).slice(0, 180) }
  }
}

export async function inspectHarnessLlms(env = process.env) {
  const listed = listHarnessLlmProviders(env)
  const probed = []
  for (const p of listed) {
    const result = await probeOpenAi(p.baseURL, p.key, p.model)
    const embeddings = result.ok ? await probeEmbeddings(p.baseURL, p.key) : { ok: false }
    probed.push({ ...p, probe: result, healthy: result.ok === true, embeddingOk: embeddings.ok === true, embeddings })
  }
  return probed
}

function preferredId(env = process.env) {
  try {
    const settings = JSON.parse(readFileSync(join(userHome(env), 'desktop-settings.json'), 'utf8'))
    return String(settings?.coldbrew?.pentagi?.harnessProvider || 'auto')
  } catch {
    return 'auto'
  }
}

export function pickHarnessLlm(inspected, env = process.env) {
  const want = preferredId(env)
  const healthy = inspected.filter(p => p.healthy)
  if (want && want !== 'auto') {
    const pinned = inspected.find(p => p.id === want)
    if (pinned?.healthy) return { ...pinned, reason: 'pinned' }
    const fallback = healthy.find(p => p.isDefault) || healthy[0]
    if (fallback) return { ...fallback, reason: 'pinned-unhealthy-fallback', pinned: want }
    if (pinned) return { ...pinned, reason: 'pinned-unhealthy' }
  }
  const def = healthy.find(p => p.isDefault) || healthy[0] || inspected.find(p => p.isDefault) || inspected[0]
  if (!def) return null
  return { ...def, reason: def.healthy ? (def.isDefault ? 'harness-default' : 'first-healthy') : 'none-healthy' }
}

export function applyLlmToEnvText(text, pick, extras = {}) {
  let next = text || ''
  const set = (key, value) => {
    if (value === undefined || value === null) return
    const re = new RegExp(`^${key}=.*$`, 'm')
    if (re.test(next)) next = next.replace(re, `${key}=${value}`)
    else next += `\n${key}=${value}\n`
  }
  const url = containerBaseUrl(pick.baseURL)
  set('LLM_SERVER_URL', url)
  set('LLM_SERVER_KEY', pick.key)
  set('LLM_SERVER_MODEL', pick.probe?.model || pick.model)
  set('LLM_SERVER_PROVIDER', '')
  set('LLM_SERVER_LEGACY_REASONING', 'true')
  // Embedding is independent of the chat/scheduler model.
  const embedding = extras.embedding
  if (embedding?.ok && embedding.url) {
    set('EMBEDDING_PROVIDER', embedding.provider || 'openai')
    set('EMBEDDING_URL', embedding.url)
    set('EMBEDDING_KEY', embedding.key || '')
    set('EMBEDDING_MODEL', embedding.model || 'text-embedding-3-small')
  } else {
    set('EMBEDDING_PROVIDER', 'none')
    set('EMBEDDING_URL', '')
    set('EMBEDDING_KEY', '')
    set('EMBEDDING_MODEL', '')
  }
  set('DOCKER_DEFAULT_IMAGE', 'vxcontrol/kali-linux')
  set('DOCKER_DEFAULT_IMAGE_FOR_PENTEST', 'vxcontrol/kali-linux')
  set('DOCKER_NET_ADMIN', 'true')
  set('SCRAPER_PRIVATE_URL', 'https://someuser:somepass@scraper/')
  set('SCRAPER_PUBLIC_URL', 'https://someuser:somepass@host.docker.internal:9443/')
  set('LOCAL_SCRAPER_USERNAME', 'someuser')
  set('LOCAL_SCRAPER_PASSWORD', 'somepass')
  const yamlPath = join(userHome(), 'pentagi', 'custom.provider.yml')
  writeCustomProviderYaml(yamlPath, pick.probe?.model || pick.model)
  set('PENTAGI_LLM_SERVER_CONFIG_PATH', yamlPath)
  set('LLM_SERVER_CONFIG_PATH', '/opt/pentagi/conf/custom.provider.yml')
  if (pick.healthy) {
    set('DEEPSEEK_API_KEY', '')
  }
  return next
}

export function llmFingerprint(pick) {
  if (!pick) return ''
  return [containerBaseUrl(pick.baseURL), pick.key, pick.probe?.model || pick.model].join('|')
}

function agentsFor(model) {
  const one = { model }
  const json = { model, json: true }
  return {
    simple: one,
    simpleJson: json,
    primaryAgent: one,
    assistant: one,
    generator: one,
    refiner: one,
    adviser: one,
    reflector: one,
    searcher: one,
    enricher: one,
    coder: one,
    installer: one,
    pentester: one,
  }
}

export function writeCustomProviderYaml(dest, model) {
  const block = (name, extra = '') => `${name}:\n  model: "${model}"\n  n: 1\n${extra}`
  const text = [
    block('simple'),
    block('simple_json', '  json: true\n'),
    block('primary_agent'),
    block('assistant'),
    block('generator'),
    block('refiner'),
    block('adviser'),
    block('reflector'),
    block('searcher'),
    block('enricher'),
    block('coder'),
    block('installer'),
    block('pentester'),
    '',
  ].join('\n')
  writeFileSync(dest, text)
  return dest
}

async function graphql(query, variables, env = process.env) {
  const { pentagiGraphql } = await import('./pentagi-runtime.mjs')
  return pentagiGraphql(query, variables, env)
}

export async function syncGraphqlProviders(pick, inspected, env = process.env) {
  if (!pick) return { ok: false, error: 'no harness provider' }
  const listed = await graphql(
    'query { settingsProviders { userDefined { id name type } } providers { name type } }',
    {},
    env,
  )
  const userDefined = listed.json?.data?.settingsProviders?.userDefined ?? []
  const liveNames = new Set(inspected.map(p => `${SYNC_PREFIX}${p.id}`))
  const deleted = []
  for (const row of userDefined) {
    if (String(row.name).startsWith(SYNC_PREFIX) && !liveNames.has(row.name)) {
      const del = await graphql('mutation D($id: ID!) { deleteProvider(providerId: $id) }', { id: row.id }, env)
      deleted.push({ name: row.name, ok: del.ok, error: del.json?.errors })
    }
  }
  const name = `${SYNC_PREFIX}${pick.id}`
  const model = pick.probe?.model || pick.model
  const existing = userDefined.find(r => r.name === name)
  const agents = agentsFor(model)
  let upsert
  if (existing) {
    upsert = await graphql(
      'mutation U($id: ID!, $name: String!, $agents: AgentsConfigInput!) { updateProvider(providerId: $id, name: $name, agents: $agents) { id name type } }',
      { id: existing.id, name, agents },
      env,
    )
  } else {
    upsert = await graphql(
      'mutation C($name: String!, $type: ProviderType!, $agents: AgentsConfigInput!) { createProvider(name: $name, type: $type, agents: $agents) { id name type } }',
      { name, type: 'custom', agents },
      env,
    )
  }
  return {
    ok: upsert.ok,
    name,
    model,
    upsert: upsert.json,
    deleted,
    listed: listed.json?.data?.providers,
  }
}

export async function snapshotHarnessLlms(env = process.env) {
  const inspected = await inspectHarnessLlms(env)
  const pick = pickHarnessLlm(inspected, env)
  return {
    preferred: preferredId(env),
    pick: pick && {
      id: pick.id,
      displayName: pick.displayName,
      model: pick.probe?.model || pick.model,
      baseURL: pick.baseURL,
      containerURL: containerBaseUrl(pick.baseURL),
      healthy: pick.healthy,
      reason: pick.reason,
      via: pick.probe?.via,
    },
    providers: inspected.map(p => ({
      id: p.id,
      displayName: p.displayName,
      model: p.model,
      baseURL: p.baseURL,
      healthy: p.healthy,
      error: p.probe?.error,
      status: p.probe?.status,
    })),
  }
}

export { SYNC_PREFIX, containerBaseUrl, here }
