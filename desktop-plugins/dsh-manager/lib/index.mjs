import { spawn } from 'node:child_process'
import { accessSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { access, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ARMOR_MODES,
  DEFAULT_ARMOR_MODE,
  PENTAGI_SOURCE,
  PENTAGI_VERSION,
  REVERIFY_TOOLS,
  REVERIFY_VERSION,
  installReverifyExtras,
  normalizeArmorMode,
  probeReverify,
  runReverifyTool,
} from './reverify.mjs'
import { PENTAGI_TOOLS, runPentagiTool } from './pentagi.mjs'
import {
  probePentagiRuntime,
  startPentagiRuntime,
  stopPentagiRuntime,
  savePentagiSettings,
  pentagiStopOnExit,
  pentagiEnvPath,
  pentagiRoot,
  resolveEmbeddingForEnv,
  ensureLocalEmbedder,
  stopLocalEmbedder,
  installDockerStack,
  pentagiComposeEnv,
  whichDocker,
} from './pentagi-runtime.mjs'
import { snapshotHarnessLlms, inspectHarnessLlms, pickHarnessLlm, applyLlmToEnvText, syncGraphqlProviders } from './pentagi-providers.mjs'

export const name = 'dsh-desktop-manager'
export const inject = ['webServer', 'loader', 'systemPrompt', 'tools']
export { ARMOR_MODES, DEFAULT_ARMOR_MODE, normalizeArmorMode }

const repositoryRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
const pluginsRoot = join(repositoryRoot, 'plugins')
const profilesDir = join(dirname(fileURLToPath(import.meta.url)), 'profiles')

/**
 * 用户数据根：`$DSH_HOME`，未设置则 `~/.dsh`。
 *
 * 破甲默认开关、逐模型默认、会话开关都必须写这里。旧实现写在安装包 /
 * 仓库根的 `desktop-settings.json`，换版本整包替换就会把勾选冲掉。
 */
export function userDataHome(env = process.env) {
  const configured = String(env.DSH_HOME ?? '').trim()
  if (configured.length === 0) return join(homedir(), '.dsh')
  if (configured === '~') return homedir()
  if (configured.startsWith('~/') || configured.startsWith('~\\')) {
    return resolve(join(homedir(), configured.slice(2)))
  }
  return resolve(configured)
}

export function settingsFile(env = process.env) {
  return join(userDataHome(env), 'desktop-settings.json')
}

export function coldbrewStateFile(env = process.env) {
  return join(userDataHome(env), 'coldbrew-sessions.json')
}

function legacySettingsFile() {
  return join(repositoryRoot, 'desktop-settings.json')
}

function legacyColdbrewStateFile() {
  return join(repositoryRoot, 'coldbrew-sessions.json')
}

function pathExistsSync(path) {
  try {
    accessSync(path)
    return true
  } catch {
    return false
  }
}

/** 用户目录还没有文件时，把安装包/仓库根里的旧文件拷过去一次。 */
function migrateLegacyFile(destPath, legacyPath) {
  if (pathExistsSync(destPath) || !pathExistsSync(legacyPath)) return
  mkdirSync(userDataHome(), { recursive: true })
  copyFileSync(legacyPath, destPath)
}

let taskLogs = []
let isRunning = false
let runningTask = ''
// 任务进度：{ step, total, label, percent, startedAt }，install-all / start / embedder 等
// 长任务每步更新，前端轮询 /logs 拿到后渲染进度条 + 预计耗时。
let taskProgress = null

/** 设置当前任务进度：percent 0-100；label 显示当前步骤名。 */
function setTaskProgress(step, total, label, percent) {
  const now = Date.now()
  if (!taskProgress) taskProgress = { step, total, label, percent: 0, startedAt: now }
  taskProgress.step = step
  taskProgress.total = total
  taskProgress.label = label
  taskProgress.percent = Math.max(0, Math.min(100, Math.round(percent)))
}

function clearTaskProgress() {
  taskProgress = null
}

/** 给进度条叠一个粗略的「剩余秒数」估算：按已用时间 × (剩余百分比/已走百分比)。 */
function taskProgressView() {
  if (!taskProgress) return null
  const { startedAt, percent } = taskProgress
  const elapsed = (Date.now() - startedAt) / 1000
  let etaSec = null
  if (percent > 0 && percent < 100) {
    etaSec = Math.max(0, Math.round((elapsed / percent) * (100 - percent)))
  } else if (percent >= 100) {
    etaSec = 0
  }
  return { ...taskProgress, elapsedSec: Math.round(elapsed), etaSec }
}

/**
 * 会话破甲开关的内存态：{ [sessionId]: { enabled, model } }，与 coldbrewStatePath 双向同步。
 *
 * 注意：每次读取都重新读盘（而不是首次读后永久缓存）。systemPrompt 的 text
 * provider 在每一次组装时求值，而会话开关可能在同一进程内被 API 写入、也可能
 * 被外部进程修改；一次性缓存会让「中途打开/切换模型」在下一个 turn 里读不到
 * 新状态——这正是破甲在长会话中途失效的根因之一。
 */
let sessionStates = {}

function loadSessionStatesSync() {
  const dest = coldbrewStateFile()
  migrateLegacyFile(dest, legacyColdbrewStateFile())
  try {
    sessionStates = JSON.parse(readFileSync(dest, 'utf8'))
  } catch {
    sessionStates = {}
  }
  return sessionStates
}

/** 五个模型的 ColdBrew 破甲 profile 元数据（2.1.0 席位）；提示词正文在 profilesDir 下按 id 存放。 */
const PROFILES = {
  codex: {
    id: 'codex',
    name: 'GPT-5.6 / Codex',
    short: '指令层与工作流编排',
    file: 'codex.md',
    reverifyFile: 'codex-reverify.md',
    pentagiFile: 'codex-pentagi.md',
    // 模型名命中规则（大小写不敏感，取第一个命中）
    patterns: ['gpt', 'codex', 'o1', 'o3'],
  },
  claude: {
    id: 'claude',
    name: 'Claude Code',
    short: '长会话与规则组织',
    file: 'claude.md',
    reverifyFile: 'claude-reverify.md',
    pentagiFile: 'claude-pentagi.md',
    patterns: ['claude'],
  },
  grok: {
    id: 'grok',
    name: 'Grok 4.6',
    short: '实时信息流与模板',
    file: 'grok.md',
    reverifyFile: 'grok-reverify.md',
    pentagiFile: 'grok-pentagi.md',
    patterns: ['grok'],
  },
  glm: {
    id: 'glm',
    name: 'GLM 5.3',
    short: '破甲越狱与越界重写',
    file: 'glm.md',
    reverifyFile: 'glm-reverify.md',
    pentagiFile: 'glm-pentagi.md',
    patterns: ['glm', 'chatglm', 'zhipu'],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek v4 Pro',
    short: '深度推理与会话导出',
    file: 'deepseek.md',
    reverifyFile: 'deepseek-reverify.md',
    pentagiFile: 'deepseek-pentagi.md',
    patterns: ['deepseek'],
  },
}

/** 按模型名匹配 profile id；默认回落 DeepSeek。 */
export function matchProfileId(modelName) {
  const name = String(modelName ?? '').toLowerCase()
  for (const profile of Object.values(PROFILES)) {
    if (profile.patterns.some(pattern => name.includes(pattern))) return profile.id
  }
  return 'deepseek'
}

/** 读一份 profile 提示词正文（同步，启动时一次性缓存；正文必须同步求值给 systemPrompt section）。
 *  ColdBrew：五个席位共用 kernel-2.1.0.md；Reverify：共用 kernel-reverify.md；PentAGI：共用 kernel-pentagi.md。
 *  席位文件只保留身份/语气 overlay。 */
const KERNEL_FILE = 'kernel-2.1.0.md'
const REVERIFY_KERNEL_FILE = 'kernel-reverify.md'
const PENTAGI_KERNEL_FILE = 'kernel-pentagi.md'
const MODE_KERNEL_FILE = {
  coldbrew: KERNEL_FILE,
  reverify: REVERIFY_KERNEL_FILE,
  pentagi: PENTAGI_KERNEL_FILE,
}
const promptCache = new Map()
function loadPromptSync(profile, mode = DEFAULT_ARMOR_MODE) {
  const armorMode = normalizeArmorMode(mode)
  const key = `${armorMode}:${profile.id}`
  if (!promptCache.has(key)) {
    const overlayName = armorMode === 'reverify'
      ? (profile.reverifyFile ?? `${profile.id}-reverify.md`)
      : armorMode === 'pentagi'
        ? (profile.pentagiFile ?? `${profile.id}-pentagi.md`)
        : profile.file
    const kernelName = MODE_KERNEL_FILE[armorMode] ?? KERNEL_FILE
    const overlay = readFileSync(join(profilesDir, overlayName), 'utf8')
    const kernel = readFileSync(join(profilesDir, kernelName), 'utf8')
    promptCache.set(key, `${overlay.trim()}\n\n${kernel}`)
  }
  return promptCache.get(key)
}

function settingsArmorMode(settings) {
  return normalizeArmorMode(settings?.coldbrew?.armorMode)
}

function sessionArmorMode(state, settings) {
  if (state?.mode !== undefined && state?.mode !== null && String(state.mode).length > 0) {
    return normalizeArmorMode(state.mode)
  }
  // 落盘过的旧会话没有 mode 字段：锁冷咖啡，避免设置页一切就把长会话内核换掉。
  if (state !== undefined && state !== null) return DEFAULT_ARMOR_MODE
  return settingsArmorMode(settings)
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** 桌面设置的内存态：{ plugins, coldbrew: { defaultEnabled, profiles } }，与 settingsPath 双向同步。 */
let settingsCache = {}

function loadSettingsSync() {
  const dest = settingsFile()
  migrateLegacyFile(dest, legacySettingsFile())
  try {
    settingsCache = JSON.parse(readFileSync(dest, 'utf8'))
  } catch {
    settingsCache = {}
  }
  return settingsCache
}

async function getSettings() {
  const dest = settingsFile()
  migrateLegacyFile(dest, legacySettingsFile())
  const settings = await (async () => {
    if (await pathExists(dest)) {
      return JSON.parse(await readFile(dest, 'utf8'))
    }
    return { plugins: {} }
  })()
  settingsCache = settings
  return settings
}

async function saveSettings(settings) {
  settingsCache = settings
  const dest = settingsFile()
  await mkdir(userDataHome(), { recursive: true })
  await writeFile(dest, JSON.stringify(settings, null, 2))
}

/** 每个会话的破甲开关状态：{ [sessionId]: { enabled, model } }，落盘持久化。 */
async function getColdbrewSessions() {
  return loadSessionStatesSync()
}

/** 同步版：systemPrompt text provider 是同步求值的，直接读内存态。 */
function getColdbrewSessionsSync() {
  return loadSessionStatesSync()
}

async function saveColdbrewSessions(sessions) {
  sessionStates = sessions
  const dest = coldbrewStateFile()
  await mkdir(userDataHome(), { recursive: true })
  await writeFile(dest, JSON.stringify(sessions, null, 2))
}

/**
 * 取会话当前实际使用的模型名（用于匹配 ColdBrew profile）。
 *
 * 优先级：
 * 1. 最近一次请求头里的模型（agent 中途切换模型后，agent.options 不会更新，
 *    但 requestHeader 会记录每步实际请求的 provider/model——这是最准的）；
 * 2. agent 创建时的 options.model（首条消息还没发出任何请求时唯一可用）；
 * 3. 会话显式记录里的 model（用户在输入框开开关那一刻 UI 看到的模型名）。
 */
function currentAgentModel(agent, state) {
  const headerModel = agent?.session?.requestHeader?.()?.config?.model
  if (headerModel) return headerModel
  const optionsModel = agent?.options?.model
  if (optionsModel) return optionsModel
  return state?.model ?? ''
}

/**
 * 计算某个会话（agent）当前的破甲开关与命中 profile。
 *
 * 优先级（从高到低）：
 * 1. 会话显式记录（用户在该会话的输入框手动开关过）：以记录的 enabled 为准；
 * 2. 沿父会话链（子代理/任务代理）回溯：父会话开着的破甲，子代理沿用同一个
 *    profile。用 `agent.ctx.agents` 拿到真实的父 agent 再继续向上，而不是
 *    构造带 id 的轻量对象——后者只能回溯一层，深层子代理会断链；
 * 3. 默认规则：全局开关「所有新会话默认开启破甲」优先，其次看当前模型命中的
 *    profile 是否被设成「新会话默认开启」；模型取 agent 当前实际使用的模型，
 *    而不是开启开关那一刻的快照——这样中途切换模型，profile 会跟着换。
 *
 * 返回 { enabled, profile, mode }；任何异常回落「关闭」（组装路径上抛错会打断整个 turn）。
 */
function resolveColdbrewState(agent) {
  try {
    const sessionId = agent?.id
    if (!sessionId) return { enabled: false, profile: null, mode: DEFAULT_ARMOR_MODE }
    const sessions = loadSessionStatesSync()
    const settings = loadSettingsSync()
    const fallbackMode = settingsArmorMode(settings)

    // 沿 agent → 父会话链收集真实 agent：显式记录 > 父会话继承 > 默认规则。
    const registry = agent?.ctx?.agents
    const chain = []
    const seen = new Set()
    let cursor = agent
    while (cursor !== undefined && cursor !== null) {
      if (seen.has(String(cursor.id))) break
      seen.add(String(cursor.id))
      chain.push(cursor)
      const parentId = cursor?.session?.header?.parentSession
      if (parentId === undefined) break
      // 优先用 registry 解析父 agent（能继续向上回溯）；拿不到就停在当前层。
      cursor = registry?.get?.(parentId) ?? null
    }

    for (const candidate of chain) {
      const state = sessions[String(candidate.id)]
      if (state === undefined) continue
      if (!state.enabled) return { enabled: false, profile: null, mode: sessionArmorMode(state, settings) }
      // 显式记录命中：profile 用当前 agent 实际模型匹配（模型中途切换则跟随），
      // 记录里的 model 只是开关开启时 UI 看到的模型名，作后备。
      const model = currentAgentModel(agent, state)
      const profile = PROFILES[matchProfileId(model)]
      const mode = sessionArmorMode(state, settings)
      return profile === undefined
        ? { enabled: false, profile: null, mode }
        : { enabled: true, profile, mode }
    }

    // 无任何显式记录（新会话）：按默认规则计算。
    const model = currentAgentModel(agent, null)
    const matched = matchProfileId(model)
    const defaultEnabled = settings.coldbrew?.defaultEnabled === true
      || (matched !== null
        && settings.coldbrew?.profiles?.[matched]?.defaultEnabled === true)
    if (!defaultEnabled) return { enabled: false, profile: null, mode: fallbackMode }
    const profile = PROFILES[matched]
    return profile === undefined
      ? { enabled: false, profile: null, mode: fallbackMode }
      : { enabled: true, profile, mode: fallbackMode }
  } catch {
    return { enabled: false, profile: null, mode: DEFAULT_ARMOR_MODE }
  }
}

function run(command, args, options = {}) {
  taskLogs.push(`$ ${command} ${args.join(' ')}`)
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: process.env,
      shell: false,
    })
    child.stdout.on('data', chunk => { taskLogs.push(chunk.toString()) })
    child.stderr.on('data', chunk => { taskLogs.push(chunk.toString()) })
    child.once('error', (err) => {
      taskLogs.push(`Error: ${err.message}`)
      reject(err)
    })
    child.once('exit', (code, signal) => {
      if (code === 0) {
        taskLogs.push(`Done.`)
        resolve()
        return
      }
      const msg = `Exit ${code}`
      taskLogs.push(msg)
      reject(new Error(msg))
    })
  })
}

/** 只探测不落日志的 spawn：PentAGI 后端状态查询用。 */
function spawnProbe(command, args, timeoutMs = 8_000) {
  return new Promise((resolvePromise) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(command, args, { env: process.env, shell: false })
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolvePromise({ ok: false, stdout, stderr: `${stderr}\ntimed out after ${timeoutMs}ms`.trim() })
    }, timeoutMs)
    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ ok: false, stdout, stderr: error.message })
    })
    child.once('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ ok: code === 0, stdout, stderr })
    })
  })
}

/**
 * PentAGI 后端探测（只读、快速、永不抛错）：
 * 1. docker 是否在场（pentagi 官方部署方式是 docker compose）；
 * 2. 默认 API/UI 地址 https://127.0.0.1:8443 是否可到达（可通过 DSH_PENTAGI_URL 覆盖）。
 * 探测失败只标记字段，不阻断工具调用。
 */
async function probePentagi() {
  try {
    return await probePentagiRuntime()
  } catch (error) {
    return {
      version: PENTAGI_VERSION,
      source: PENTAGI_SOURCE,
      error: String(error?.message ?? error),
      docker: { ok: false },
      api: { ok: false, url: 'https://127.0.0.1:8443' },
      backendReady: false,
    }
  }
}

export function apply(ctx) {
  // Harness 起来后按设置决定是否后台拉 compose。stopOnExit=true 时进程退出会 down。
  const pentagiCfg = (() => {
    try { return loadSettingsSync()?.coldbrew?.pentagi ?? {} } catch { return {} }
  })()
  if (pentagiCfg.autostart !== false) {
    setTimeout(() => {
      startPentagiRuntime((line) => {
        taskLogs.push(line)
        if (taskLogs.length > 400) taskLogs = taskLogs.slice(-300)
      }).catch((error) => {
        taskLogs.push(`pentagi autostart: ${error?.message ?? error}`)
      })
    }, 1500)
  }
  const shutdown = () => {
    if (!pentagiStopOnExit()) return
    stopPentagiRuntime((line) => taskLogs.push(line)).catch(() => {})
  }
  process.once('exit', shutdown)
  process.once('SIGINT', () => { shutdown(); process.exit(0) })
  process.once('SIGTERM', () => { shutdown(); process.exit(0) })

  // 按会话注入系统提示词：文本提供器在每次组装时以该会话的 agent 为 scope 求值，
  // 会话开关开启且模型命中某个 profile 时返回对应破甲正文，否则返回空串（不贡献内容）。
  // 任何内部异常都回落空串——组装路径上抛错会打断整个 turn。
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'coldbrew:session-profile',
    order: 195,
    text: (context) => {
      // 每次组装都以当前 agent 为 scope 求值；返回空串表示本会话不贡献破甲正文。
      const agent = context?.scope
      const { enabled, profile, mode } = resolveColdbrewState(agent)
      if (!enabled || profile === null) return ''
      return loadPromptSync(profile, mode)
    },
  }), 'dsh-desktop-manager: coldbrew session profile')

  // 工具：让模型能取回五个 profile 的元数据与正文（与 infinite_gen1_profile 同型）。
  ctx.effect(() => ctx.tools.register({
    name: 'coldbrew_profiles',
    description: 'Return the bundled ColdBrew 冷咖啡 破甲 profiles for the five models (GPT-5.6/Codex, Claude Code, Grok 4.6, DeepSeek v4 Pro, GLM 5.3).',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute() {
      const profiles = Object.values(PROFILES).map(profile => ({
        id: profile.id,
        name: profile.name,
        short: profile.short,
        patterns: profile.patterns,
        prompt: loadPromptSync(profile, DEFAULT_ARMOR_MODE),
        reverifyPrompt: loadPromptSync(profile, 'reverify'),
        pentagiPrompt: loadPromptSync(profile, 'pentagi'),
      }))
      return {
        version: '2.1.0',
        control: 'BREAK//OPEN',
        modes: ARMOR_MODES,
        reverifyVersion: REVERIFY_VERSION,
        pentagi: { version: PENTAGI_VERSION, source: PENTAGI_SOURCE },
        profiles,
        defaultProfile: 'deepseek',
      }
    },
  }), 'dsh-desktop-manager: coldbrew profiles tool')

  // 工具：PentAGI 模式下的 profile 与后端状态查询（同 coldbrew_profiles 型）。
  ctx.effect(() => ctx.tools.register({
    name: 'pentagi_profiles',
    description: 'Return the PentAGI 破甲 profiles (system prompt + backend probe) for the five models.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute() {
      return {
        version: PENTAGI_VERSION,
        control: 'orchestrate',
        source: PENTAGI_SOURCE,
        backend: await probePentagi(),
        profiles: Object.values(PROFILES).map(profile => ({
          id: profile.id,
          name: profile.name,
          short: profile.short,
          patterns: profile.patterns,
          prompt: loadPromptSync(profile, 'pentagi'),
        })),
        defaultProfile: 'deepseek',
      }
    },
  }), 'dsh-desktop-manager: pentagi profiles tool')

  // Reverify MCP 有的工具返回 object，有的返回 array（re_disasm）。
  // 无约束 JSON schema 才能让两种都通过 tools 输出校验。
  const jsonOutput = {
    schema: {},
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  }
  for (const tool of REVERIFY_TOOLS) {
    ctx.effect(() => ctx.tools.register({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      output: jsonOutput,
      async execute(args) {
        return runReverifyTool(tool.name, args ?? {})
      },
    }), `dsh-desktop-manager: ${tool.name}`)
  }

  // PentAGI 原项目工具桥：开启 pentagi 模式后模型直接调 pg_*，不必等 Docker。
  // 有 DSH_PENTAGI_TOKEN 时 flow_* 走 GraphQL；其余工具本机执行（terminal/browser/search/memory）。
  for (const tool of PENTAGI_TOOLS) {
    ctx.effect(() => ctx.tools.register({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      output: jsonOutput,
      async execute(args) {
        return runPentagiTool(tool.name, args ?? {})
      },
    }), `dsh-desktop-manager: ${tool.name}`)
  }

  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    webServer.register({
      kind: 'prefix',
      path: '/api/desktop-manager',
      handler: async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const action = url.pathname.split('/').pop()

        if (req.method === 'GET') {
          if (action === 'status') {
            const installed = await pathExists(join(pluginsRoot, 'dsh-infinite-gen-1'))
            const settings = await getSettings()
            const enabled = settings.plugins['dsh-infinite-gen-1']?.enabled !== false
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ installed, enabled, isRunning }))
            return
          }
          if (action === 'logs') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ logs: taskLogs, isRunning }))
            return
          }
        }

        if (req.method === 'POST') {
          if (isRunning) {
            res.writeHead(409)
            res.end('Task already running')
            return
          }

          isRunning = true
          taskLogs = []

          try {
            if (action === 'install') {
              const target = join(pluginsRoot, 'dsh-infinite-gen-1')
              if (!await pathExists(target)) {
                await run('git', ['clone', 'https://github.com/Minglink/dsh-infinite-gen-1.git', target])
                await run('pnpm', ['install'], { cwd: target })
              }
              res.writeHead(200)
              res.end('OK')
            } else if (action === 'uninstall') {
              const target = join(pluginsRoot, 'dsh-infinite-gen-1')
              await rm(target, { recursive: true, force: true })
              res.writeHead(200)
              res.end('OK')
            } else if (action === 'toggle') {
              const settings = await getSettings()
              const current = settings.plugins['dsh-infinite-gen-1']?.enabled !== false
              settings.plugins['dsh-infinite-gen-1'] = { enabled: !current }
              await saveSettings(settings)
              res.writeHead(200)
              res.end('OK')
            } else {
              res.writeHead(404)
              res.end()
            }
          } catch (error) {
            console.error(error)
            res.writeHead(500)
            res.end(error.message)
          } finally {
            isRunning = false
          }
          return
        }

        res.writeHead(404)
        res.end()
      },
    })
  }

  if (webServer !== undefined) { webServer.register({
    kind: 'prefix',
    path: '/api/coldbrew',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      const segments = url.pathname.split('/').filter(Boolean) // ['api','coldbrew',...]
      const action = segments[2]

      if (req.method === 'GET') {
        if (action === 'profiles') {
          const settings = await getSettings()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            // 全局开关：新会话是否一进来就开着破甲，省去每次手动打开。
            version: '2.1.0',
            control: 'BREAK//OPEN',
            title: 'gpt5.6-claude-grok4.6-deepseekv4pro-glm5.3破甲越狱',
            defaultEnabled: settings.coldbrew?.defaultEnabled === true,
            armorMode: settingsArmorMode(settings),
            modes: [
              { id: 'coldbrew', name: '冷咖啡 ColdBrew 2.1.0', control: 'BREAK//OPEN' },
              { id: 'reverify', name: 'Reverify 0.9.0', control: 'bytes-as-judge' },
              { id: 'pentagi', name: 'PentAGI 1.0.0', control: 'orchestrate' },
            ],
            reverify: await probeReverify(),
            pentagi: await probePentagi(),
            profiles: Object.values(PROFILES).map(p => ({
              id: p.id,
              name: p.name,
              short: p.short,
              patterns: p.patterns,
              defaultEnabled: settings.coldbrew?.profiles?.[p.id]?.defaultEnabled === true,
            })),
          }))
          return
        }
        if (action === 'session') {
          const sessionId = decodeURIComponent(segments[3] ?? '')
          const sessions = await getColdbrewSessions()
          // 还没有记录的会话（也就是新会话）取默认值：全局开关优先，其次看
          // 当前模型命中的那个 profile 是否被设成「新会话默认开启」。
          const settings = await getSettings()
          const model = url.searchParams.get('model') ?? ''
          const matched = matchProfileId(model)
          const defaultEnabled = settings.coldbrew?.defaultEnabled === true
            || (matched !== null
              && settings.coldbrew?.profiles?.[matched]?.defaultEnabled === true)
          const persisted = sessionId ? sessions[String(sessionId)] : undefined
          const blank = url.searchParams.get('blank') === '1' || url.searchParams.get('blank') === 'true'
          // 空白会话始终跟破甲管理的全局模式；已发过消息的会话锁自己的 mode。
          const mode = (!persisted || blank)
            ? settingsArmorMode(settings)
            : sessionArmorMode(persisted, settings)
          let state = persisted ?? { enabled: defaultEnabled, model, mode }
          if (sessionId && (persisted === undefined || blank)) {
            state = {
              enabled: persisted?.enabled ?? defaultEnabled,
              model: model || persisted?.model || '',
              mode,
            }
            sessions[String(sessionId)] = state
            await saveColdbrewSessions(sessions)
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            ...state,
            mode,
            profileId: state.enabled ? matchProfileId(state.model) : null,
          }))
          return
        }
        if (action === 'reverify') {
          const sub = segments[3] ?? 'status'
          if (sub === 'logs') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ logs: taskLogs, isRunning }))
            return
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(await probeReverify()))
          return
        }
        if (action === 'pentagi') {
          const sub = segments[3] ?? 'status'
          if (sub === 'profiles') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(Object.values(PROFILES).map(p => ({
              id: p.id,
              name: p.name,
              short: p.short,
              patterns: p.patterns,
              prompt: loadPromptSync(p, 'pentagi'),
            }))))
            return
          }
          if (sub === 'logs') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ logs: taskLogs, isRunning }))
            return
          }
          if (sub === 'models') {
            const snap = await snapshotHarnessLlms()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ...await probePentagi(), harness: snap }))
            return
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(await probePentagi()))
          return
        }
        res.writeHead(404)
        res.end()
        return
      }

      if (req.method === 'POST') {
        if (action === 'mode') {
          let body = ''
          for await (const chunk of req) body += chunk
          let payload = {}
          try { payload = JSON.parse(body) } catch { /* tolerate empty body */ }
          const settings = await getSettings()
          settings.coldbrew ??= {}
          settings.coldbrew.armorMode = normalizeArmorMode(payload.mode ?? payload.armorMode)
          await saveSettings(settings)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ armorMode: settings.coldbrew.armorMode }))
          return
        }
        if (action === 'reverify') {
          const sub = segments[3] ?? 'status'
          if (sub === 'install' || sub === 'extras') {
            if (isRunning) {
              res.writeHead(409)
              res.end('Task already running')
              return
            }
            isRunning = true
            taskLogs = []
            let raw = ''
            try {
              for await (const chunk of req) raw += chunk
              let payload = {}
              try { payload = JSON.parse(raw) } catch { /* empty */ }
              const which = payload.extra === 'angr' ? 'angr' : 'full'
              taskLogs.push(`install reverify extras: ${which}`)
              const status = await installReverifyExtras(which, (line) => {
                taskLogs.push(line)
                if (taskLogs.length > 400) taskLogs = taskLogs.slice(-300)
              })
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ...status, logs: taskLogs }))
            } catch (error) {
              taskLogs.push(String(error?.message ?? error))
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(error?.message ?? error), logs: taskLogs }))
            } finally {
              isRunning = false
              runningTask = ''
            }
            return
          }
          if (sub === 'logs') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ logs: taskLogs, isRunning }))
            return
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(await probeReverify()))
          return
        }
        if (action === 'pentagi') {
          const sub = segments[3] ?? 'status'
          if (sub === 'start' || sub === 'stop') {
            if (isRunning) {
              res.writeHead(409, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                error: runningTask === 'docker-install'
                  ? '正在安装 Docker，请等当前任务结束（可看下面日志）。'
                  : runningTask === 'embedder'
                    ? '本机向量还在安装/启动，请等它完成后再启动后端。'
                    : `已有任务在跑（${runningTask || 'unknown'}），请稍后再试。`,
                logs: taskLogs,
                runningTask,
                isRunning: true,
              }))
              return
            }
            isRunning = true
            runningTask = sub
            taskLogs = []
            taskProgress = null
            try {
              taskLogs.push(sub === 'start' ? 'start pentagi docker compose…' : 'stop pentagi docker compose…')
              if (sub === 'start') setTaskProgress(1, 2, '启动 PentAGI 后端（compose + LLM + token）', 5)
              const status = sub === 'start'
                ? await startPentagiRuntime((line) => {
                  taskLogs.push(line)
                  if (taskLogs.length > 400) taskLogs = taskLogs.slice(-300)
                  if (sub === 'start') setTaskProgress(1, 2, line, Math.min(90, (taskProgress?.percent ?? 5) + 2))
                })
                : await stopPentagiRuntime((line) => {
                  taskLogs.push(line)
                  if (taskLogs.length > 400) taskLogs = taskLogs.slice(-300)
                })
              if (sub === 'start') setTaskProgress(2, 2, '后端已启动', 100)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ...status, logs: taskLogs, progress: taskProgressView() }))
            } catch (error) {
              taskLogs.push(String(error?.message ?? error))
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(error?.message ?? error), logs: taskLogs, progress: taskProgressView() }))
            } finally {
              isRunning = false
              runningTask = ''
              clearTaskProgress()
            }
            return
          }
          if (sub === 'logs') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ logs: taskLogs, isRunning, runningTask, progress: taskProgressView() }))
            return
          }
          if (sub === 'config') {
            let body = ''
            for await (const chunk of req) body += chunk
            let payload = {}
            try { payload = JSON.parse(body) } catch { /* empty */ }
            const patch = {}
            if (payload.port !== undefined) {
              const port = Number(payload.port)
              if (!Number.isInteger(port) || port < 1 || port > 65535) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'port must be 1-65535' }))
                return
              }
              patch.port = port
            }
            if (payload.stopOnExit !== undefined) patch.stopOnExit = payload.stopOnExit === true
            if (payload.autostart !== undefined) patch.autostart = payload.autostart === true
            if (payload.sandbox !== undefined) patch.sandbox = payload.sandbox === true
            if (payload.dind !== undefined) patch.dind = payload.dind === true
            if (payload.harnessProvider !== undefined) patch.harnessProvider = String(payload.harnessProvider || 'auto')
            if (payload.embeddingSource !== undefined) {
              const src = String(payload.embeddingSource || 'none')
              patch.embeddingSource = (src === 'local' || src === 'api') ? src : 'none'
            }
            if (payload.embeddingApiUrl !== undefined) patch.embeddingApiUrl = String(payload.embeddingApiUrl || '').trim()
            if (payload.embeddingApiModel !== undefined) patch.embeddingApiModel = String(payload.embeddingApiModel || 'text-embedding-3-small').trim()
            if (payload.embeddingApiKey !== undefined) patch.embeddingApiKey = String(payload.embeddingApiKey || '').trim()
            const next = savePentagiSettings(patch)
            if (patch.embeddingSource === 'none') {
              await stopLocalEmbedder((line) => taskLogs.push(line)).catch(() => {})
            }
            try {
              const dest = pentagiEnvPath()
              const inspected = await inspectHarnessLlms()
              const pick = pickHarnessLlm(inspected)
              if (pick && existsSync(dest)) {
                const embedding = await resolveEmbeddingForEnv((line) => taskLogs.push(line))
                const prev = readFileSync(dest, 'utf8')
                writeFileSync(dest, applyLlmToEnvText(prev, pick, { embedding }))
              }
            } catch { /* env rewrite is best-effort; restart backend to apply */ }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ...await probePentagi(), config: next }))
            return
          }
          if (sub === 'sync-models') {
            if (isRunning) {
              res.writeHead(409, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                error: `已有任务在跑（${runningTask || 'unknown'}），请稍后再同步模型。`,
                logs: taskLogs,
                runningTask,
                isRunning: true,
              }))
              return
            }
            isRunning = true
            runningTask = 'sync-models'
            try {
              let body = ''
              for await (const chunk of req) body += chunk
              let payload = {}
              try { payload = JSON.parse(body) } catch { /* empty */ }
              if (payload.harnessProvider) savePentagiSettings({ harnessProvider: String(payload.harnessProvider) })
              const inspected = await inspectHarnessLlms()
              const pick = pickHarnessLlm(inspected)
              if (!pick) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Harness 里没有带 API key 的模型' }))
                return
              }
              const dest = pentagiEnvPath()
              const prev = existsSync(dest) ? readFileSync(dest, 'utf8') : ''
              const embedding = await resolveEmbeddingForEnv((line) => taskLogs.push(line))
              writeFileSync(dest, applyLlmToEnvText(prev, pick, { embedding }))
              const synced = await syncGraphqlProviders(pick, inspected)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                ...await probePentagi(),
                harness: await snapshotHarnessLlms(),
                synced,
                note: '已写入 .env 与 GraphQL。若容器还在用旧 LLM_SERVER_*，点一次「重新启动后端」。',
              }))
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(error?.message ?? error) }))
            } finally {
              isRunning = false
              runningTask = ''
            }
            return
          }
          if (sub === 'docker-install') {
            if (isRunning) {
              const same = runningTask === 'docker-install'
              res.writeHead(same ? 200 : 409, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                ok: same,
                error: same
                  ? undefined
                  : (runningTask === 'embedder'
                    ? '本机向量还在安装/启动。等它完成（或点停止本机向量）后再装 Docker。'
                    : `已有任务在跑（${runningTask || 'unknown'}），请稍后再试。`),
                logs: taskLogs,
                runningTask,
                isRunning: true,
              }))
              return
            }
            isRunning = true
            runningTask = 'docker-install'
            taskLogs = ['检查本机 Docker / 架构并安装依赖…']
            try {
              const result = await installDockerStack((line) => {
                taskLogs.push(line)
                if (taskLogs.length > 400) taskLogs = taskLogs.slice(-300)
              }, process.env, { pullImages: true })
              const status = await probePentagi()
              const error = result.ok ? undefined : (result.error || status.error || 'Docker 安装失败')
              if (error) taskLogs.push(error)
              res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ...status, ...result, logs: taskLogs, error }))
            } catch (error) {
              taskLogs.push(String(error?.message ?? error))
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(error?.message ?? error), logs: taskLogs }))
            } finally {
              isRunning = false
              runningTask = ''
            }
            return
          }
          if (sub === 'embedder') {
            if (isRunning) {
              res.writeHead(409, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                error: runningTask === 'docker-install'
                  ? '正在安装 Docker，请等当前任务结束后再启停本机向量。'
                  : `已有任务在跑（${runningTask || 'unknown'}），请稍后再试。`,
                logs: taskLogs,
                runningTask,
                isRunning: true,
              }))
              return
            }
            isRunning = true
            runningTask = 'embedder'
            try {
              let body = ''
              for await (const chunk of req) body += chunk
              let payload = {}
              try { payload = JSON.parse(body) } catch { /* empty */ }
              const op = String(payload.op || 'start')
              if (op === 'stop') {
                const stopped = await stopLocalEmbedder((line) => taskLogs.push(line))
                const dest = pentagiEnvPath()
                const inspected = await inspectHarnessLlms()
                const pick = pickHarnessLlm(inspected)
                if (pick && existsSync(dest)) {
                  writeFileSync(dest, applyLlmToEnvText(readFileSync(dest, 'utf8'), pick, { embedding: { ok: false, source: 'local' } }))
                }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ...await probePentagi(), stopped, logs: taskLogs }))
                return
              }
              savePentagiSettings({ embeddingSource: 'local' })
              const started = await ensureLocalEmbedder((line) => taskLogs.push(line))
              const embedding = await resolveEmbeddingForEnv((line) => taskLogs.push(line))
              const dest = pentagiEnvPath()
              const inspected = await inspectHarnessLlms()
              const pick = pickHarnessLlm(inspected)
              if (pick && existsSync(dest)) {
                writeFileSync(dest, applyLlmToEnvText(readFileSync(dest, 'utf8'), pick, { embedding }))
              }
              const ok = started.ok && embedding.ok
              res.writeHead(ok ? 200 : 500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ...await probePentagi(), started, embedding, logs: taskLogs, error: ok ? undefined : (started.error || embedding.error) }))
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(error?.message ?? error), logs: taskLogs }))
            } finally {
              isRunning = false
              runningTask = ''
            }
            return
          }
          if (sub === 'install-all') {
            if (isRunning) {
              const same = runningTask === 'install-all'
              res.writeHead(same ? 200 : 409, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                ok: same,
                error: same
                  ? undefined
                  : `已有任务在跑（${runningTask || 'unknown'}），请稍后再试。`,
                logs: taskLogs,
                runningTask,
                isRunning: true,
              }))
              return
            }
            isRunning = true
            runningTask = 'install-all'
            taskLogs = ['=== 一键安装全部后端 ===']
            taskProgress = null
            const log = (line) => { taskLogs.push(line); if (taskLogs.length > 400) taskLogs = taskLogs.slice(-300) }
            try {
              // Step 1: Docker + Colima + pull images
              taskLogs.push('【1/3】安装 Docker / Colima 并拉取镜像…')
              setTaskProgress(1, 3, '安装 Docker / Colima 并拉取镜像', 10)
              const dockerResult = await installDockerStack(log, process.env, { pullImages: true })
              if (!dockerResult.ok) {
                taskLogs.push(`Docker 安装失败: ${dockerResult.error}`)
                throw new Error(dockerResult.error || 'Docker 安装失败')
              }
              log('Docker 就绪')
              setTaskProgress(1, 3, 'Docker 就绪', 35)

              // Step 2: Start PentAGI backend (creates .env, syncs LLM, compose up, mints token)
              taskLogs.push('【2/3】启动 PentAGI 后端（compose + LLM + token）…')
              setTaskProgress(2, 3, '启动 PentAGI 后端（compose + LLM + token）', 40)
              const status = await startPentagiRuntime(log, process.env)
              taskLogs.push(`后端已启动 · :${status.port}`)
              setTaskProgress(2, 3, '后端已启动', 70)

              // Step 3: Start local embedder (best-effort)
              taskLogs.push('【3/3】启动本机向量 sidecar（fastembed）…')
              setTaskProgress(3, 3, '启动本机向量 sidecar', 75)
              try {
                const embedResult = await ensureLocalEmbedder(log, process.env)
                if (embedResult.ok) {
                  log(`向量 sidecar 已就绪 · ${embedResult.url}`)
                  setTaskProgress(3, 3, '向量 sidecar 已就绪', 95)
                  const dest = pentagiEnvPath()
                  if (existsSync(dest)) {
                    const embedding = await resolveEmbeddingForEnv(log, process.env)
                    const { inspectHarnessLlms, pickHarnessLlm, applyLlmToEnvText: applyEnv } = await import('./pentagi-providers.mjs')
                    const inspected = await inspectHarnessLlms()
                    const pick = pickHarnessLlm(inspected)
                    if (pick) {
                      const prev = readFileSync(dest, 'utf8')
                      writeFileSync(dest, applyEnv(prev, pick, { embedding }))
                    }
                  }
                } else {
                  log(`向量 sidecar 未就绪: ${embedResult.error}`)
                }
              } catch (err) {
                log(`向量 sidecar 跳过: ${err?.message ?? err}`)
              }

              taskLogs.push('=== 全部安装完成 ===')
              setTaskProgress(3, 3, '全部安装完成', 100)
              const finalStatus = await probePentagi()
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ...finalStatus, logs: taskLogs, installed: true, progress: taskProgressView() }))
            } catch (error) {
              taskLogs.push(`安装失败: ${error?.message ?? error}`)
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(error?.message ?? error), logs: taskLogs, progress: taskProgressView() }))
            } finally {
              isRunning = false
              runningTask = ''
              clearTaskProgress()
            }
            return
          }
          if (sub === 'uninstall-all') {
            if (isRunning) {
              res.writeHead(409, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                error: `已有任务在跑（${runningTask || 'unknown'}），请稍后再试。`,
                logs: taskLogs,
                runningTask,
                isRunning: true,
              }))
              return
            }
            isRunning = true
            runningTask = 'uninstall-all'
            taskLogs = ['=== 一键卸载全部后端 ===']
            const log = (line) => { taskLogs.push(line); if (taskLogs.length > 400) taskLogs = taskLogs.slice(-300) }
            try {
              // Step 1: Stop local embedder
              taskLogs.push('【1/4】停止本机向量 sidecar…')
              try {
                const stopped = await stopLocalEmbedder(log, process.env)
                if (stopped.ok) log(`向量 sidecar 已停止 (${stopped.pids?.join(',')})`)
                else log(`向量 sidecar 未在运行`)
              } catch (err) {
                log(`向量 sidecar 跳过: ${err?.message ?? err}`)
              }

              // Step 2: Stop and remove pentagi containers + volumes
              taskLogs.push('【2/4】停止并移除 pentagi 容器和卷…')
              try {
                const docker = whichDocker('docker', process.env)
                const root = pentagiRoot()
                if (existsSync(join(root, 'docker-compose.yml'))) {
                  const child = spawn(docker, ['compose', 'down', '-v', '--remove-orphans'], {
                    cwd: root,
                    env: pentagiComposeEnv(process.env),
                  })
                  await new Promise((resolvePromise) => {
                    child.on('close', (code) => {
                      log(`docker compose down -v exit ${code}`)
                      resolvePromise()
                    })
                    child.on('error', (error) => {
                      log(`docker compose down 出错: ${error?.message ?? error}`)
                      resolvePromise()
                    })
                    const timer = setTimeout(() => { child.kill('SIGKILL'); resolvePromise() }, 120_000)
                    child.on('close', () => clearTimeout(timer))
                  })
                  log('compose down -v 完成')
                } else {
                  log('compose 文件不存在，跳过 down')
                }
              } catch (err) {
                log(`compose down 跳过: ${err?.message ?? err}`)
              }

              // Step 3: Remove docker images (pentagi, pgvector, scraper, kali)
              taskLogs.push('【3/4】删除已拉取的镜像…')
              try {
                const docker = whichDocker('docker', process.env)
                for (const img of ['vxcontrol/pentagi:latest', 'vxcontrol/pgvector:latest', 'vxcontrol/scraper:latest', 'vxcontrol/kali-linux']) {
                  await new Promise((resolvePromise) => {
                    const child = spawn(docker, ['rmi', '-f', img], { env: { ...process.env, PATH: process.env.PATH ?? '' } })
                    const timer = setTimeout(() => { child.kill('SIGKILL'); resolvePromise() }, 15_000)
                    child.on('close', (code) => {
                      clearTimeout(timer)
                      log(`rmi ${img} exit ${code}`)
                      resolvePromise()
                    })
                    child.on('error', (error) => {
                      clearTimeout(timer)
                      log(`rmi ${img} 出错: ${error?.message ?? error}`)
                      resolvePromise()
                    })
                  })
                }
              } catch (err) {
                log(`rmi 跳过: ${err?.message ?? err}`)
              }

              // Step 4: Remove source dir
              taskLogs.push('【4/4】删除 pentagi 源码目录…')
              try {
                const root = pentagiRoot()
                if (existsSync(root)) {
                  await rm(root, { recursive: true, force: true })
                  log(`已删除 ${root}`)
                } else {
                  log('源码目录不存在，跳过')
                }
              } catch (err) {
                log(`删除源码跳过: ${err?.message ?? err}`)
              }

              // Reset config
              savePentagiSettings({ harnessProvider: 'auto', embeddingSource: 'none' })
              taskLogs.push('配置已重置（harnessProvider=auto, embedding=none）')
              taskLogs.push('=== 卸载完成 ===')

              const status = await probePentagi()
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ...status, logs: taskLogs, uninstalled: true }))
            } catch (error) {
              taskLogs.push(`卸载失败: ${error?.message ?? error}`)
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(error?.message ?? error), logs: taskLogs }))
            } finally {
              isRunning = false
              runningTask = ''
            }
            return
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(await probePentagi()))
          return
        }
        if (action === 'default') {
          let body = ''
          for await (const chunk of req) body += chunk
          let payload = {}
          try { payload = JSON.parse(body) } catch { /* tolerate empty body */ }
          const settings = await getSettings()
          settings.coldbrew ??= {}
          settings.coldbrew.defaultEnabled = payload.enabled === true
          await saveSettings(settings)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ defaultEnabled: payload.enabled === true }))
          return
        }
        if (action === 'profile') {
          const profileId = decodeURIComponent(segments[3] ?? '')
          if (PROFILES[profileId] === undefined) {
            res.writeHead(404)
            res.end('unknown profile')
            return
          }
          let body = ''
          for await (const chunk of req) body += chunk
          let payload = {}
          try { payload = JSON.parse(body) } catch { /* tolerate empty body */ }
          const settings = await getSettings()
          settings.coldbrew ??= {}
          settings.coldbrew.profiles ??= {}
          settings.coldbrew.profiles[profileId] = { defaultEnabled: payload.enabled === true }
          await saveSettings(settings)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ id: profileId, defaultEnabled: payload.enabled === true }))
          return
        }
        if (action === 'session') {
          const sessionId = decodeURIComponent(segments[3] ?? '')
          if (!sessionId) {
            res.writeHead(400)
            res.end('missing session id')
            return
          }
          let body = ''
          for await (const chunk of req) body += chunk
          let payload = {}
          try { payload = JSON.parse(body) } catch { /* tolerate empty body */ }
          const sessions = await getColdbrewSessions()
          const settings = await getSettings()
          const previous = sessions[String(sessionId)]
          // 第一次落盘锁全局模式：输入框开关可能带着过期的 React mode，
          // 不能把新会话从 Reverify 打回冷咖啡。已有记录才接受 payload.mode。
          const nextMode = previous === undefined
            ? settingsArmorMode(settings)
            : payload.mode === undefined
              ? sessionArmorMode(previous, settings)
              : normalizeArmorMode(payload.mode)
          sessions[String(sessionId)] = {
            enabled: payload.enabled === true,
            model: String(payload.model ?? previous?.model ?? ''),
            mode: nextMode,
          }
          await saveColdbrewSessions(sessions)
          const state = sessions[String(sessionId)]
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            ...state,
            profileId: state.enabled ? matchProfileId(state.model) : null,
          }))
          return
        }
        res.writeHead(404)
        res.end()
        return
      }

      res.writeHead(404)
      res.end()
    },
  })
  } // if webServer
}
