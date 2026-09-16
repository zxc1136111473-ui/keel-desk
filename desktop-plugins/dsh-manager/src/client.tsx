import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { Button, IconCopyOutline16, StateDot, TerminalBlock, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import styles from './client.css'

const NS = 'desktop-manager'
const STYLE_MARKER = 'data-dsh-desktop-manager-styles'

/** 样式独立成 client.css，这里只负责把它挂进文档一次。 */
function installStyles(): void {
  if (document.querySelector(`[${STYLE_MARKER}]`) !== null) return
  const tag = document.createElement('style')
  tag.setAttribute(STYLE_MARKER, '')
  tag.textContent = styles
  document.head.append(tag)
}

function writeClipboard(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

export const name = 'dsh-desktop-manager'
export const inject = ['slots', 'locale', 'connection', 'modelDirectories']
function matchProfileId(modelName: string | null | undefined): string {
  const name = String(modelName ?? '').toLowerCase()
  const rules: Record<string, string[]> = {
    codex: ['gpt', 'codex', 'o1', 'o3'],
    claude: ['claude'],
    grok: ['grok'],
    glm: ['glm', 'chatglm', 'zhipu'],
    deepseek: ['deepseek'],
  }
  for (const [id, patterns] of Object.entries(rules)) {
    if (patterns.some(pattern => name.includes(pattern))) return id
  }
  return 'deepseek'
}

const PROFILE_LABELS: Record<string, string> = {
  codex: 'GPT-5.6/Codex',
  claude: 'Claude',
  grok: 'Grok 4.6',
  glm: 'GLM 5.3',
  deepseek: 'DeepSeek',
}

/** 每个 profile 命中哪些模型的一句话说明（破甲管理卡片用）。 */
const PROFILE_MATCH_HINTS: Record<string, string> = {
  codex: '2.1.0 席位 · 指令层与工作流编排 · 匹配 GPT、Codex、o1、o3',
  claude: '2.1.0 席位 · 长会话与规则组织 · 匹配 Claude',
  grok: '2.1.0 席位 · 实时信息流与模板 · 匹配 Grok',
  glm: '2.1.0 席位 · 破甲越狱与越界重写 · 匹配 GLM、ChatGLM、智谱',
  deepseek: '2.1.0 席位 · 深度推理与会话导出 · 匹配 DeepSeek',
}

/* ------------------------------------------------------------------ *
 * 输入框里的「冷咖啡破甲」开关（conversation.input.left 槽位）。
 * 只能在新会话（无任何消息，session.blank === true）时开启/关闭；
 * 开启后按当前选择的模型名自动匹配对应 ColdBrew profile。
 * ------------------------------------------------------------------ */

interface ColdBrewToggleInjected {
  /** 该会话的模型目录 store；可能为 null（服务不可用/会话未就绪）。 */
  directory: { getSnapshot(): { current?: { model?: string } | null } | null; subscribe(fn: () => void): () => void } | null
}

type ColdBrewToggleProps = ColdBrewToggleInjected & {
  sessionId: string
  /** InputZone owner share 里的会话快照（含 blank 位）。 */
  session: { blank?: boolean } | null
  input?: { draft?: string }
  inputActions?: { setDraft(text: string): void }
}

/** 可选席位口令，仅在用户主动点击复制时填入；开关开着不必发。 */
const PROFILE_WAKE: Record<string, string> = {
  codex: '[[ENI:PROFILE=MAX]]',
  claude: '[[CB:MAX]]',
  grok: '[[ENI:PROFILE=MAX]]',
  glm: 'BREAK//OPEN',
  deepseek: 'BREAK//OPEN',
}

const REVERIFY_WAKE = '[[RV:VERIFY]]'
const PENTAGI_WAKE = '[[PG:OPEN]]'

function wakePhraseFor(profileId: string, mode: string): string {
  if (mode === 'reverify') return REVERIFY_WAKE
  if (mode === 'pentagi') return PENTAGI_WAKE
  return PROFILE_WAKE[profileId] ?? PROFILE_WAKE.deepseek
}

function modeLabel(mode: string): string {
  return mode === 'reverify' ? 'Reverify' : mode === 'pentagi' ? 'PentAGI' : '冷咖啡'
}

function ColdBrewToggle({ sessionId, session, directory, input, inputActions }: ColdBrewToggleProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [mode, setMode] = useState<string>('coldbrew')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const newSession = session?.blank === true

  const model = directory?.getSnapshot()?.current?.model ?? ''
  const profileId = matchProfileId(model)
  const profileLabel = PROFILE_LABELS[profileId] ?? profileId
  const wakePhrase = wakePhraseFor(profileId, mode)

  // 挂载时读取该会话已持久化的开关状态。新会话没有记录，后端会按
  // 「新会话默认开启」以及当前模型命中的 profile 决定初值，所以要把 model 带上。
  useEffect(() => {
    let alive = true
    const pull = () => {
      const params = new URLSearchParams()
      if (model) params.set('model', model)
      if (newSession) params.set('blank', '1')
      const query = params.toString() ? `?${params}` : ''
      fetch(`/api/coldbrew/session/${encodeURIComponent(sessionId)}${query}`)
        .then(res => res.json())
        .then(data => {
          if (!alive) return
          setEnabled(data.enabled === true)
          setMode((data.mode === 'reverify' || data.mode === 'pentagi') ? data.mode : 'coldbrew')
        })
        .catch(() => { if (alive) setEnabled(false) })
    }
    pull()
    if (!newSession) return () => { alive = false }
    const timer = setInterval(pull, 1500)
    return () => { alive = false; clearInterval(timer) }
  }, [sessionId, model, newSession])

  const toggle = async (next: boolean) => {
    if (!newSession || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/coldbrew/session/${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next, model }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setEnabled(data.enabled === true)
      if (data.mode === 'reverify' || data.mode === 'pentagi' || data.mode === 'coldbrew') setMode(data.mode)
    } catch (reason: any) {
      setError(reason?.message ?? String(reason))
    } finally {
      setBusy(false)
    }
  }

  const on = enabled === true

  const flashNotice = (text: string, ok: boolean) => {
    setNotice({ text, ok })
    if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => {
      setNotice(null)
      setCopied(false)
    }, 1800)
  }

  const fillComposer = useCallback(() => {
    const current = String(input?.draft ?? '')
    if (current.trim() !== '') return
    try {
      inputActions?.setDraft(wakePhrase)
    } catch {
      /* composer 尚未就绪时只走剪贴板 */
    }
  }, [input, inputActions, wakePhrase])

  const copyPhrase = useCallback(async () => {
    if (on) {
      setCopied(true)
      setError(null)
      flashNotice(`${profileLabel} · ${modeLabel(mode)} 已开，直接发任务`, true)
      return
    }
    const okCopy = () => {
      setCopied(true)
      setError(null)
      fillComposer()
      flashNotice(`已填入 ${profileLabel} 可选口令「${wakePhrase}」`, true)
    }
    try {
      await navigator.clipboard.writeText(wakePhrase)
      okCopy()
      return
    } catch {
      /* 无 clipboard API 时走 textarea 兜底 */
    }
    if (writeClipboard(wakePhrase)) {
      okCopy()
      return
    }
    fillComposer()
    setError('复制失败')
    flashNotice('复制失败，已填入输入框', false)
  }, [fillComposer, wakePhrase, profileLabel, on, mode])

  useEffect(() => () => {
    if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
  }, [])

  useEffect(() => {
    if (notice === null) return
    const el = document.createElement('div')
    el.className = notice.ok ? 'dsm-copy-toast' : 'dsm-copy-toast dsm-copy-toast-err'
    el.textContent = notice.text
    document.body.appendChild(el)
    return () => { el.remove() }
  }, [notice])

  return (
    <div className="dsm-composer-toggle" data-on={on || undefined} data-new={newSession || undefined}>
      <button
        type="button"
        className="dsm-toggle-switch"
        role="switch"
        aria-checked={on}
        aria-label={mode === 'reverify' ? 'Reverify 字节裁判' : mode === 'pentagi' ? 'PentAGI 渗透编排' : '冷咖啡破甲'}
        disabled={!newSession || busy}
        title={newSession
          ? (on
            ? `关闭${modeLabel(mode)}`
            : `开启${modeLabel(mode)}`)
          : '仅新会话可调整'}
        onClick={() => void toggle(!on)}
      >
        <span className="dsm-toggle-knob" />
      </button>
      <span className="dsm-toggle-label">
        <button
          type="button"
          className="dsm-phrase-copy"
          title={on
            ? `${profileLabel} · ${modeLabel(mode)} 已开，直接发任务`
            : `开关关闭时可选口令「${wakePhrase}」`}
          aria-label={on
            ? `${profileLabel} · ${modeLabel(mode)} 已开`
            : `复制 ${profileLabel} 可选口令 ${wakePhrase}`}
          data-copied={copied || undefined}
          onClick={() => void copyPhrase()}
        >
          {modeLabel(mode)}
          <IconCopyOutline16 size={12} />
        </button>
        {on && ` · ${profileLabel}`}
      </span>
      {error !== null && <span className="dsm-toggle-error" title={error}>!</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 新的桌面环境管理面板：冷咖啡 ColdBrew 五模型工作台
 * ------------------------------------------------------------------ */

interface ColdBrewProfile {
  id: string
  name: string
  short: string
  patterns: string[]
  defaultEnabled: boolean
}

interface EngineSlot {
  engine?: string
  version?: string
  note?: string
}

interface ReverifyStatus {
  ok?: boolean
  version?: string
  present?: boolean
  venv?: boolean
  python?: { version?: string; source?: string; error?: string; executable?: string }
  engines?: {
    full_fidelity?: boolean
    install_hint?: string
    error?: string
    disassembly?: EngineSlot
    emulation?: EngineSlot
    binary_parsing?: EngineSlot
    proof?: EngineSlot
    semantic?: EngineSlot
  } | null
  error?: string
}

function engineIsNative(slot?: EngineSlot): boolean {
  const engine = slot?.engine
  return Boolean(engine && engine !== 'pure-python' && engine !== 'none')
}

function describeReverify(status: ReverifyStatus | null) {
  const coreOk = status?.present === true || status?.ok === true
  const fidelityOk = status?.engines?.full_fidelity === true
  const angrOk = engineIsNative(status?.engines?.semantic)
  const pythonError = status?.python?.error
  const pythonVersion = status?.python?.version

  if (status === null) {
    return {
      tone: 'warning' as const,
      headline: '正在探测本机环境…',
      detail: '先确认 Python 和引擎装到哪一层，再决定要不要动手。',
      rows: [
        { name: '核心', ok: false, note: '探测中' },
        { name: '高精度引擎', ok: false, note: '探测中' },
        { name: '调用图引擎', ok: false, note: '探测中' },
      ],
      needPython: false,
      needFidelity: false,
      needAngr: false,
    }
  }

  if (pythonError) {
    return {
      tone: 'error' as const,
      headline: '还不能用',
      detail: `本机找不到 Python 3.8+。装好后再点重新探测。${pythonError}`,
      rows: [
        { name: '核心', ok: Boolean(status.present), note: status.present ? '已随应用打包，等 Python' : '应用包里缺文件' },
        { name: '高精度引擎', ok: false, note: '需要先有 Python' },
        { name: '调用图引擎', ok: false, note: '需要先有 Python' },
      ],
      needPython: true,
      needFidelity: false,
      needAngr: false,
    }
  }

  if (status.engines?.error && !fidelityOk) {
    return {
      tone: 'warning' as const,
      headline: '探测异常',
      detail: status.engines.error,
      rows: [
        { name: '核心', ok: coreOk, note: coreOk ? '已随应用打包' : '应用包里缺文件' },
        { name: '高精度引擎', ok: false, note: '探测失败，可再装一次' },
        { name: '调用图引擎', ok: angrOk, note: angrOk ? '函数边界和调用图' : '可选，未探测到' },
      ],
      needPython: false,
      needFidelity: true,
      needAngr: !angrOk,
    }
  }

  const pythonBit = pythonVersion ? `Python ${pythonVersion}` : '系统 Python'
  if (fidelityOk && angrOk) {
    return {
      tone: 'done' as const,
      headline: `已全部就绪 · ${pythonBit}`,
      detail: '拆样本、反汇编、模拟、调用图都可以直接用，不用再装。',
      rows: [
        { name: '核心', ok: true, note: '已随应用打包' },
        { name: '高精度引擎', ok: true, note: '反汇编 / 模拟 / PE·ELF·Mach-O' },
        { name: '调用图引擎', ok: true, note: '函数边界和调用图' },
      ],
      needPython: false,
      needFidelity: false,
      needAngr: false,
    }
  }
  if (fidelityOk) {
    return {
      tone: 'done' as const,
      headline: `已就绪 · ${pythonBit}`,
      detail: '日常拆样本已经够用。调用图引擎是可选项：不装也能拆，只是函数边界会降级。',
      rows: [
        { name: '核心', ok: true, note: '已随应用打包' },
        { name: '高精度引擎', ok: true, note: '反汇编 / 模拟 / PE·ELF·Mach-O' },
        { name: '调用图引擎', ok: false, note: '未装 · 可选，需要函数边界时再加' },
      ],
      needPython: false,
      needFidelity: false,
      needAngr: true,
    }
  }
  return {
    tone: 'warning' as const,
    headline: `能用，精度偏低 · ${pythonBit}`,
    detail: '核心已经能跑。高精度引擎还没装，反汇编和模拟会慢、也更容易看走眼。',
    rows: [
      { name: '核心', ok: coreOk, note: coreOk ? '已随应用打包' : '应用包里缺文件' },
      { name: '高精度引擎', ok: false, note: '未装 capstone / unicorn / lief / z3' },
      { name: '调用图引擎', ok: angrOk, note: angrOk ? '函数边界和调用图' : '未装 · 可选' },
    ],
    needPython: false,
    needFidelity: true,
    needAngr: !angrOk,
  }
}

function ReverifyCard(props: {
  status: ReverifyStatus | null
  busy: boolean
  installingExtra: 'full' | 'angr' | null
  onInstall: (extra: 'full' | 'angr') => void
  onProbe: () => void
}) {
  const view = describeReverify(props.status)
  const showActions = view.needPython || view.needFidelity || view.needAngr
  return (
    <article className="dsm-card dsm-card-stack">
      <div className="dsm-card-main">
        <span className="dsm-card-title">
          Reverify 字节裁判<span className="dsm-card-id">0.9.0</span>
        </span>
        <span className="dsm-state">
          <StateDot state={view.tone} size={8} />
          {view.headline}
        </span>
        <span className="dsm-card-sub">{view.detail}</span>
      </div>
      <ul className="dsm-cap-list">
        {view.rows.map(row => (
          <li className="dsm-cap" key={row.name}>
            <StateDot state={row.ok ? 'done' : 'warning'} size={8} />
            <div className="dsm-cap-body">
              <span className="dsm-cap-name">{row.name}</span>
              <span className="dsm-cap-note">{row.note}</span>
            </div>
            <span className="dsm-cap-mark" data-on={row.ok || undefined}>
              {row.ok ? '已装' : '未装'}
            </span>
          </li>
        ))}
      </ul>
      {showActions && (
        <div className="dsm-actions">
          {view.needPython && (
            <Button onClick={props.onProbe} disabled={props.busy} variant="primary" size="sm">
              重新探测
            </Button>
          )}
          {view.needFidelity && (
            <Button
              onClick={() => props.onInstall('full')}
              disabled={props.busy}
              variant="primary"
              size="sm"
            >
              {props.installingExtra === 'full' ? '正在安装高精度引擎…' : '安装高精度引擎'}
            </Button>
          )}
          {view.needAngr && (
            <Button
              onClick={() => props.onInstall('angr')}
              disabled={props.busy}
              variant="outline"
              size="sm"
            >
              {props.installingExtra === 'angr' ? '正在安装调用图引擎…' : '加装调用图引擎'}
            </Button>
          )}
        </div>
      )}
    </article>
  )
}

interface PentagiStatus {
  version?: string
  source?: string
  root?: string
  docker?: { ok?: boolean; version?: string; error?: string; daemon?: boolean; bin?: string }
  dockerStack?: { os?: string; arch?: string; brew?: boolean; dockerDesktop?: boolean; colima?: boolean }
  api?: { ok?: boolean; url?: string; status?: number; error?: string | null }
  tokenPresent?: boolean
  port?: number
  stopOnExit?: boolean
  autostart?: boolean
  compose?: { ok?: boolean; running?: boolean }
  sandbox?: {
    enabled?: boolean
    ok?: boolean
    image?: string
    inspect?: string
    work?: string
    source?: string
    dind?: { enabled?: boolean; ok?: boolean; socket?: string; mode?: string; note?: string }
  }
  backendReady?: boolean
  harnessProvider?: string
  embedding?: {
    source?: 'none' | 'local' | 'api'
    apiUrl?: string
    apiModel?: string
    hasKey?: boolean
    local?: { ok?: boolean; error?: string }
    fastembed?: { ok?: boolean }
    port?: number
    model?: string
  }
  harness?: {
    preferred?: string
    pick?: { id?: string; displayName?: string; model?: string; healthy?: boolean; reason?: string; baseURL?: string }
    providers?: Array<{ id: string; displayName?: string; model?: string; baseURL?: string; healthy?: boolean; error?: string }>
  }
  error?: string
}

function describePentagi(status: PentagiStatus | null) {
  const dockerOk = status?.docker?.ok === true
  const daemonOk = status?.docker?.daemon === true
  const apiOk = status?.api?.ok === true
  const tokenOk = status?.tokenPresent === true
  const source = status?.embedding?.source === 'local' || status?.embedding?.source === 'api' ? status.embedding.source : 'none'
  const localOk = status?.embedding?.local?.ok === true
  const composeOk = status?.compose?.running === true
  const sandboxOn = status?.sandbox?.enabled !== false
  const sandboxReady = status?.sandbox?.ok === true
  const dindOn = status?.sandbox?.dind?.enabled === true
  if (status === null) {
    return {
      tone: 'warning' as const,
      headline: '正在探测后端…',
      detail: '先确认 Docker / compose / :8443 / Token / Kali 沙箱。',
      rows: [
        { name: 'Docker', ok: false, note: '探测中' },
        { name: 'Compose', ok: false, note: '探测中' },
        { name: 'API :8443', ok: false, note: '探测中' },
        { name: 'API Token', ok: false, note: '探测中' },
        { name: 'Kali 沙箱', ok: false, note: '探测中' },
        { name: 'DinD', ok: false, note: '探测中' },
        { name: '编排内核', ok: true, note: '随模式注入，无需安装' },
      ],
    }
  }
  const rows = [
    {
      name: 'Docker',
      ok: dockerOk && daemonOk,
      note: !dockerOk
        ? `未安装 CLI · ${status.dockerStack?.os || ''}/${status.dockerStack?.arch || ''} · 点「安装 Docker 依赖」`
        : daemonOk
          ? status.docker?.version ?? '已就绪'
          : (status.dockerStack?.os === 'win32'
            ? 'CLI 在，引擎未开（会启动 Docker Desktop）'
            : 'CLI 在，daemon 未开（会尝试 Colima / Docker Desktop）'),
    },
    { name: 'Compose', ok: composeOk, note: composeOk ? 'pentagi 容器在跑' : '未启动' },
    { name: `API :${status.port ?? 8443}`, ok: apiOk, note: apiOk ? `可到达 · ${status.api?.url ?? ''}` : (status.api?.error ?? '未到达') },
    { name: 'API Token', ok: tokenOk, note: tokenOk ? '已写入桌面设置' : '未签发' },
    {
      name: 'Kali 沙箱',
      ok: sandboxOn && sandboxReady,
      note: !sandboxOn
        ? '已关闭 · pg_terminal 走本机 shell'
        : sandboxReady
          ? `${status.sandbox?.image ?? 'vxcontrol/kali-linux'} · ${status.sandbox?.inspect ?? '已 pull'}`
          : `未 pull · docker pull ${status.sandbox?.image ?? 'vxcontrol/kali-linux'}`,
    },
    {
      name: 'DinD',
      ok: dindOn && sandboxReady,
      note: dindOn
        ? (status.sandbox?.dind?.note ?? 'Kali 内 docker CLI 挂 VM sock')
        : '关闭 · Kali 里没有 docker daemon',
    },
    { name: '编排内核', ok: true, note: '随模式注入，无需安装' },
    {
      name: '向量检索',
      ok: source === 'local' ? localOk : source === 'api' ? Boolean(status.embedding?.hasKey && status.embedding?.apiUrl) : false,
      note: source === 'local'
        ? (localOk ? `本机 sidecar :${status.embedding?.port ?? 63229} · ${status.embedding?.model ?? 'bge-small'}` : '本机未启动（约 0.5GB，点下面启动）')
        : source === 'api'
          ? (status.embedding?.apiUrl ? `独立 API · ${status.embedding.apiModel || 'text-embedding-3-small'}` : '已选独立 API，但还没填地址')
          : '关闭 · 与调度模型分开，不占内存',
    },
  ]
  if (status.backendReady) {
    return { tone: 'done' as const, headline: '官方后端已融合', detail: 'compose + :8443 + token 都在，模型可打 GraphQL/沙箱。', rows }
  }
  return {
    tone: 'warning' as const,
    headline: '预置内核就绪，官方栈未起',
    detail: 'Harness 启动后会自动拉 compose 守护进程（关掉本界面也不会停）。一般不用 Web UI，模型走 :8443 API。也可手动点启动。',
    rows,
  }
}

function PentagiCard(props: {
  status: PentagiStatus | null
  busy: boolean
  onProbe: () => void
  onStart: () => void
  onStop: () => void
  onConfig: (patch: Record<string, unknown>) => void
  onSyncModels: () => void
  onEmbedder: (op: 'start' | 'stop') => void
  onInstallDocker: () => void
  onInstallAll: () => void
  onUninstallAll: () => void
}) {
  const view = describePentagi(props.status)
  const running = props.status?.compose?.running === true || props.status?.api?.ok === true
  const port = props.status?.port ?? 8443
  const stopOnExit = props.status?.stopOnExit !== false
  const autostart = props.status?.autostart !== false
  const sandboxOn = props.status?.sandbox?.enabled !== false
  const dindOn = props.status?.sandbox?.dind?.enabled === true
  const embeddingSource = props.status?.embedding?.source === 'local' || props.status?.embedding?.source === 'api'
    ? props.status.embedding.source
    : 'none'
  const localEmbedOn = props.status?.embedding?.local?.ok === true
  return (
    <article className="dsm-card dsm-card-stack">
      <div className="dsm-card-main">
        <span className="dsm-card-title">
          PentAGI 官方后端<span className="dsm-card-id">守护进程 · API</span>
        </span>
        <span className="dsm-state">
          <StateDot state={view.tone} size={8} />
          {view.headline}
        </span>
        <span className="dsm-card-sub">{view.detail}</span>
        {props.status?.root ? (
          <span className="dsm-card-link">{props.status.root}</span>
        ) : null}
      </div>
      <ul className="dsm-cap-list">
        {view.rows.map(row => (
          <li className="dsm-cap" key={row.name}>
            <StateDot state={row.ok ? 'done' : 'warning'} size={8} />
            <div className="dsm-cap-body">
              <span className="dsm-cap-name">{row.name}</span>
              <span className="dsm-cap-note">{row.note}</span>
            </div>
            <span className="dsm-cap-mark" data-on={row.ok || undefined}>
              {row.ok ? '已就绪' : '未就绪'}
            </span>
          </li>
        ))}
      </ul>
      <div className="dsm-pentagi-controls">
        <label className="dsm-pentagi-port">
          <span>后端端口</span>
          <input
            type="number"
            min={1}
            max={65535}
            defaultValue={port}
            key={port}
            disabled={props.busy}
            onBlur={(event) => {
              const next = Number(event.target.value)
              if (Number.isInteger(next) && next >= 1 && next <= 65535 && next !== port) {
                props.onConfig({ port: next })
              }
            }}
          />
        </label>
        <label className="dsm-default-toggle">
          <input
            type="checkbox"
            checked={autostart}
            disabled={props.busy}
            onChange={(event) => props.onConfig({ autostart: event.target.checked })}
          />
          <span>启动 Harness 时自动拉起后端</span>
        </label>
        <label className="dsm-default-toggle">
          <input
            type="checkbox"
            checked={stopOnExit}
            disabled={props.busy}
            onChange={(event) => props.onConfig({ stopOnExit: event.target.checked })}
          />
          <span>关闭 Harness 时一并停止后端</span>
        </label>
        <label className="dsm-default-toggle">
          <input
            type="checkbox"
            checked={sandboxOn}
            disabled={props.busy}
            onChange={(event) => props.onConfig({ sandbox: event.target.checked, ...(event.target.checked ? {} : { dind: false }) })}
          />
          <span>启用 Kali 沙箱（pg_terminal 进 vxcontrol/kali-linux）</span>
        </label>
        <label className="dsm-default-toggle">
          <input
            type="checkbox"
            checked={dindOn}
            disabled={props.busy || !sandboxOn}
            onChange={(event) => props.onConfig({ dind: event.target.checked, ...(event.target.checked ? { sandbox: true } : {}) })}
          />
          <span>启用 DinD（Kali 内 docker 走 Colima VM sock）</span>
        </label>
        <label className="dsm-pentagi-port">
          <span>调度模型</span>
          <select
            value={props.status?.harnessProvider || props.status?.harness?.preferred || 'auto'}
            disabled={props.busy}
            onChange={(event) => props.onConfig({ harnessProvider: event.target.value })}
          >
            <option value="auto">自动挑一个能用的</option>
            {(props.status?.harness?.providers ?? []).map(p => (
              <option key={p.id} value={p.id}>
                {p.displayName || p.id} · {p.model}{p.healthy ? '' : '（探测失败）'}
              </option>
            ))}
          </select>
        </label>
        <span className="dsm-card-sub">
          {props.status?.harness?.pick
            ? `当前同步：${props.status.harness.pick.displayName}/${props.status.harness.pick.model}（${props.status.harness.pick.healthy ? '能打通' : '未打通'}）`
            : '还没同步：点下面「同步 Harness 模型」，或启动后端时自动拉。Harness 里删掉的也会从官方栈拿掉。'}
        </span>
        <label className="dsm-pentagi-port">
          <span>向量检索（与调度分开）</span>
          <select
            value={embeddingSource}
            disabled={props.busy}
            onChange={(event) => props.onConfig({ embeddingSource: event.target.value })}
          >
            <option value="none">关闭（不占内存）</option>
            <option value="local">本机 sidecar（fastembed / 约 0.5GB）</option>
            <option value="api">独立 Embedding API（硅基/智谱/OpenAI…）</option>
          </select>
        </label>
        {embeddingSource === 'api' && (
          <>
            <label className="dsm-pentagi-port">
              <span>Embedding 地址</span>
              <input
                type="url"
                placeholder="https://api.siliconflow.cn/v1"
                defaultValue={props.status?.embedding?.apiUrl || ''}
                key={props.status?.embedding?.apiUrl || 'api-url'}
                disabled={props.busy}
                onBlur={(event) => {
                  const next = event.target.value.trim()
                  if (next !== (props.status?.embedding?.apiUrl || '')) props.onConfig({ embeddingApiUrl: next })
                }}
              />
            </label>
            <label className="dsm-pentagi-port">
              <span>Embedding 模型</span>
              <input
                type="text"
                placeholder="BAAI/bge-m3 或 embedding-3 或 text-embedding-3-small"
                defaultValue={props.status?.embedding?.apiModel || 'text-embedding-3-small'}
                key={props.status?.embedding?.apiModel || 'api-model'}
                disabled={props.busy}
                onBlur={(event) => {
                  const next = event.target.value.trim()
                  if (next) props.onConfig({ embeddingApiModel: next })
                }}
              />
            </label>
            <label className="dsm-pentagi-port">
              <span>Embedding Key</span>
              <input
                type="password"
                placeholder={props.status?.embedding?.hasKey ? '已保存，留空不改' : 'sk-… 或硅基/智谱 token'}
                disabled={props.busy}
                onBlur={(event) => {
                  const next = event.target.value.trim()
                  if (next) props.onConfig({ embeddingApiKey: next })
                }}
              />
            </label>
          </>
        )}
        {embeddingSource === 'local' && (
          <span className="dsm-card-sub">
            {localEmbedOn
              ? '本机向量服务已在跑。点「停止本机向量」才释放内存。'
              : props.status?.embedding?.fastembed?.ok
                ? '依赖已装。点「启动本机向量」才会占大约半 GB，不会动 Grok。'
                : '第一次会在 ~/.dsh/pentagi/embedder-venv 里装 fastembed（不碰 Homebrew Python），再下载约 270MB 模型，然后监听 :63229。需要本机 python3。'}
          </span>
        )}
      </div>
      <div className="dsm-actions">
        <div className="dsm-action-group">
          <Button onClick={props.onProbe} disabled={props.busy} variant="outline" size="sm">
            重新探测
          </Button>
          <Button onClick={props.onInstallAll} disabled={props.busy} variant="primary" size="sm">
            {props.busy ? '正在安装全部…' : '安装全部后端'}
          </Button>
          <Button onClick={props.onUninstallAll} disabled={props.busy} variant="outline" size="sm">
            {props.busy ? '正在卸载…' : '卸载全部后端'}
          </Button>
        </div>
        <div className="dsm-action-group">
          <Button onClick={props.onInstallDocker} disabled={props.busy} variant="outline" size="sm">
            {props.busy
              ? '正在安装 Docker…'
              : (props.status?.docker?.ok && props.status?.docker?.daemon)
                ? '重装/修复 Docker 依赖'
                : '安装 Docker 依赖'}
          </Button>
          <Button onClick={props.onStart} disabled={props.busy} variant="primary" size="sm">
            {props.busy ? '正在启动…' : running ? '重新启动后端' : '启动后端'}
          </Button>
          <Button onClick={props.onStop} disabled={props.busy || !running} variant="outline" size="sm">
            {props.busy ? '正在停止…' : '停止后端'}
          </Button>
          <Button onClick={props.onSyncModels} disabled={props.busy} variant="outline" size="sm">
            {props.busy ? '正在同步…' : '同步 Harness 模型'}
          </Button>
        </div>
        <div className="dsm-action-group">
          {embeddingSource === 'local' && !localEmbedOn && (
            <Button onClick={() => props.onEmbedder('start')} disabled={props.busy} variant="primary" size="sm">
              {props.busy
                ? '正在安装/启动…'
                : props.status?.embedding?.fastembed?.ok
                  ? '启动本机向量'
                  : '安装并启动本机向量'}
            </Button>
          )}
          {embeddingSource === 'local' && localEmbedOn && (
            <Button onClick={() => props.onEmbedder('stop')} disabled={props.busy} variant="outline" size="sm">
              {props.busy ? '正在停止…' : '停止本机向量'}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

function useToast() {
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const showToast = (text: string) => {
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text })
  }
  return { toast, setToast, showToast }
}

function PentagiSection() {
  const [pentagi, setPentagi] = useState<PentagiStatus | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [progress, setProgress] = useState<{ step: number; total: number; label: string; percent: number; elapsedSec?: number; etaSec?: number | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const { toast, setToast, showToast } = useToast()
  const pollTimer = useRef<any>(null)

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/coldbrew/pentagi/logs')
      const data = await res.json().catch(() => ({ logs: [] }))
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs)
      if (data.progress) setProgress(data.progress)
      else if (!data.isRunning) setProgress(null)
    } catch (error) {
      console.error('Failed to fetch pentagi logs', error)
    }
  }, [])

  const startPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = setInterval(fetchLogs, 500)
  }, [fetchLogs])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [profilesRes, modelsRes] = await Promise.all([
        fetch('/api/coldbrew/profiles'),
        fetch('/api/coldbrew/pentagi/models'),
      ])
      const profilesData = await profilesRes.json()
      const modelsData = await modelsRes.json().catch(() => ({}))
      setPentagi({
        ...(profilesData.pentagi ?? {}),
        ...(modelsData.harness ? { harness: modelsData.harness, harnessProvider: modelsData.harnessProvider } : {}),
      })
    } catch (error) {
      console.error('Failed to fetch pentagi status', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [refresh])

  const savePentagiConfig = async (patch: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/coldbrew/pentagi/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? '保存失败')
      setPentagi(data)
      if (patch.port) showToast(`端口已改为 ${patch.port}，点启动后端才会应用到容器`)
      else if (patch.stopOnExit === true) showToast('关闭 Harness 时会停止 PentAGI 后端')
      else if (patch.stopOnExit === false) showToast('关闭 Harness 后后端继续跑')
      else if (patch.autostart === false) showToast('下次打开 Harness 不再自动拉后端')
      else if (patch.autostart === true) showToast('下次打开 Harness 会自动拉后端')
      else if (patch.sandbox === false) showToast('Kali 沙箱已关，pg_terminal 走本机')
      else if (patch.sandbox === true && patch.dind !== true) showToast('Kali 沙箱已开，pg_terminal 进 vxcontrol/kali-linux')
      else if (patch.dind === true) showToast('DinD 已开：Kali 内 docker 走 Colima VM sock')
      else if (patch.dind === false) showToast('DinD 已关：Kali 里没有 docker daemon')
      else if (patch.harnessProvider === 'auto') showToast('调度会自动挑一个能用的 Harness 模型')
      else if (patch.harnessProvider) showToast(`已钉死调度模型：${patch.harnessProvider}，再点同步或重启后端`)
      else if (patch.embeddingSource === 'none') showToast('向量检索已关，不占内存；调度模型不变')
      else if (patch.embeddingSource === 'local') showToast('已选本机向量。点「启动本机向量」才会占内存')
      else if (patch.embeddingSource === 'api') showToast('已选独立 Embedding API，和 Grok 调度分开')
      else if (patch.embeddingApiUrl || patch.embeddingApiKey || patch.embeddingApiModel) showToast('Embedding API 已保存，重启 PentAGI 后端后生效')
    } catch (error: any) {
      showToast(`保存失败: ${error.message}`)
    }
  }

  const syncPentagiModels = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/coldbrew/pentagi/sync-models', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? '同步失败')
      setPentagi(data)
      showToast(data.note || 'Harness 模型已同步到官方栈')
    } catch (error: any) {
      showToast(`同步失败: ${error.message}`)
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const startPentagi = async () => {
    setBusy(true)
    setLogs(['启动 PentAGI 官方后端…'])
    startPolling()
    try {
      const res = await fetch('/api/coldbrew/pentagi/start', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs)
      if (!res.ok) throw new Error(data.error ?? '启动失败')
      setPentagi(data)
      showToast('PentAGI 官方后端已启动')
    } catch (error: any) {
      showToast(`启动失败: ${error.message}`)
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      setBusy(false)
      await refresh()
    }
  }

  const runningLooksLikeDocker = (data: { runningTask?: string }) => data.runningTask === 'docker-install'

  const installAllPentagi = async () => {
    setBusy(true)
    setLogs(['=== 一键安装全部后端：Docker/Colima → 后端 compose → 本机向量 ==='])
    startPolling()
    try {
      const res = await fetch('/api/coldbrew/pentagi/install-all', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs)
      if (data.isRunning) {
        showToast('正在一键安装（含 Docker → 后端 → 向量），看下面日志，装完自动刷新')
        return
      }
      if (!res.ok) throw new Error(data.error ?? '一键安装失败')
      setPentagi(data)
      showToast('全部后端安装完成：Docker + compose + token + Kali + 向量')
    } catch (error: any) {
      showToast(`一键安装失败: ${error.message}`)
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      setBusy(false)
      await refresh()
    }
  }

  const uninstallAllPentagi = async () => {
    setBusy(true)
    setLogs(['=== 一键卸载全部后端：向量 → compose down → 删镜像 → 删源码 ==='])
    startPolling()
    try {
      const res = await fetch('/api/coldbrew/pentagi/uninstall-all', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs)
      if (data.isRunning) {
        showToast('正在卸载全部后端，看下面日志')
        return
      }
      if (!res.ok) throw new Error(data.error ?? '卸载失败')
      setPentagi(data)
      showToast('全部后端已卸载：容器/镜像/源码/向量都已清理')
    } catch (error: any) {
      showToast(`卸载失败: ${error.message}`)
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      setBusy(false)
      await refresh()
    }
  }

  const installDocker = async () => {
    setBusy(true)
    setLogs(['检查本机架构并安装 Docker（Windows 装 Docker Desktop，macOS 走 Colima），随后拉取 PentAGI 镜像…'])
    startPolling()
    try {
      const res = await fetch('/api/coldbrew/pentagi/docker-install', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs)
      const detail = String(data.error || '').trim()
      if (data.isRunning && runningLooksLikeDocker(data)) {
        showToast('Docker 正在安装，看下面日志即可，不必连点')
        return
      }
      if (!res.ok) throw new Error(detail || `HTTP ${res.status}`)
      setPentagi(data)
      showToast('Docker 依赖已就绪，可以启动 PentAGI 后端')
    } catch (error: any) {
      const text = String(error?.message ?? error)
      showToast(text.length > 80 ? `Docker 安装失败：${text.slice(0, 80)}…` : `Docker 安装失败：${text}`)
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      setBusy(false)
      await refresh()
    }
  }

  const runEmbedder = async (op: 'start' | 'stop') => {
    setBusy(true)
    setLogs([op === 'start' ? '安装/启动本机向量（第一次会 pip + 下载模型）…' : '停止本机向量服务…'])
    startPolling()
    try {
      const res = await fetch('/api/coldbrew/pentagi/embedder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op }),
      })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs)
      if (!res.ok) throw new Error(data.error ?? '向量服务失败')
      setPentagi(data)
      showToast(op === 'start' ? '本机向量已启动（约 0.5GB）' : '本机向量已停止')
      if (op === 'start' && data.started?.installed) showToast('fastembed 已安装，模型已就绪')
    } catch (error: any) {
      showToast(`向量服务失败: ${error.message}`)
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      setBusy(false)
      await refresh()
    }
  }

  const stopPentagi = async () => {
    setBusy(true)
    setLogs(['停止 PentAGI 官方后端…'])
    startPolling()
    try {
      const res = await fetch('/api/coldbrew/pentagi/stop', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs)
      if (!res.ok) throw new Error(data.error ?? '停止失败')
      setPentagi(data)
      showToast('PentAGI 官方后端已停止')
    } catch (error: any) {
      showToast(`停止失败: ${error.message}`)
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      setBusy(false)
      await refresh()
    }
  }

  if (loading && pentagi === null) return <div className="dsm-empty">正在加载 PentAGI…</div>

  return (
    <div className="dsm-root">
      {toast !== null && (
        <Toast key={toast.seq} text={toast.text} onDone={() => setToast(null)} />
      )}
      <div className="dsm-head">
        <h2>PentAGI</h2>
        <p>官方 compose 守护进程、GraphQL 通行证、Kali 沙箱和调度模型。破甲模式仍在「破甲管理」里切换。</p>
      </div>
      <div className="dsm-list">
        <PentagiCard
          status={pentagi}
          busy={busy}
          onProbe={() => { void refresh() }}
          onStart={() => { void startPentagi() }}
          onStop={() => { void stopPentagi() }}
          onConfig={(patch) => { void savePentagiConfig(patch) }}
          onSyncModels={() => { void syncPentagiModels() }}
          onEmbedder={(op) => { void runEmbedder(op) }}
          onInstallDocker={() => { void installDocker() }}
          onInstallAll={() => { void installAllPentagi() }}
          onUninstallAll={() => { void uninstallAllPentagi() }}
        />
      </div>
      {(busy || logs.length > 0) && (
        <section className="dsm-logs">
          <div className="dsm-logs-head">
            <span>任务实时日志</span>
            {busy && <span className="dsm-logs-running">正在执行…</span>}
          </div>
          {progress && (
            <div className="dsm-progress">
              <div className="dsm-progress-bar">
                <div className="dsm-progress-fill" style={{ width: `${progress.percent}%` }} />
              </div>
              <div className="dsm-progress-meta">
                <span className="dsm-progress-label">
                  第 {progress.step}/{progress.total} 步 · {progress.label}
                </span>
                <span className="dsm-progress-pct">{progress.percent}%</span>
                <span className="dsm-progress-eta">
                  {progress.etaSec === null
                    ? '估算中…'
                    : progress.etaSec === 0
                      ? '即将完成'
                      : progress.etaSec >= 60
                        ? `约 ${Math.round(progress.etaSec / 60)} 分钟`
                        : `约 ${progress.etaSec} 秒`}
                  {progress.elapsedSec !== undefined ? ` · 已用 ${progress.elapsedSec} 秒` : ''}
                </span>
              </div>
            </div>
          )}
          <TerminalBlock
            className="dsm-terminal"
            command="PentAGI 后端"
            output={logs.length > 0 ? logs.join('\n') : '等待任务开始…'}
            running={busy}
          />
        </section>
      )}
    </div>
  )
}

function ManagerSection() {
  const [profiles, setProfiles] = useState<ColdBrewProfile[] | null>(null)
  const [status, setStatus] = useState({ installed: false, enabled: false, isRunning: false })
  // 后端是否在线，与 status.isRunning 是两回事：后者只表示有没有安装/卸载任务在跑。
  const [online, setOnline] = useState<boolean | null>(null)
  // 全局开关：新会话的输入框是否一进来就开着破甲。
  const [defaultOn, setDefaultOn] = useState(false)
  const [armorMode, setArmorMode] = useState<'coldbrew' | 'reverify' | 'pentagi'>('coldbrew')
  const [reverify, setReverify] = useState<ReverifyStatus | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [installingExtra, setInstallingExtra] = useState<'full' | 'angr' | null>(null)
  const { toast, setToast, showToast } = useToast()
  const pollTimer = useRef<any>(null)

  const fetchLogs = useCallback(async () => {
    try {
      const [desktopRes, reverifyRes] = await Promise.all([
        fetch('/api/desktop-manager/logs'),
        fetch('/api/coldbrew/reverify/logs'),
      ])
      const desktop = await desktopRes.json().catch(() => ({ logs: [], isRunning: false }))
      const reverifyLogs = await reverifyRes.json().catch(() => ({ logs: [], isRunning: false }))
      const merged = [
        ...(Array.isArray(desktop.logs) ? desktop.logs : []),
        ...(Array.isArray(reverifyLogs.logs) ? reverifyLogs.logs : []),
      ]
      if (merged.length > 0) setLogs(merged)
      if (desktop.isRunning) {
        const sRes = await fetch('/api/desktop-manager/status')
        setStatus(await sRes.json())
      }
    } catch (error) {
      console.error('Failed to fetch logs', error)
    }
  }, [])

  const startPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = setInterval(fetchLogs, 500)
  }, [fetchLogs])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [profilesRes, statusRes] = await Promise.all([
        fetch('/api/coldbrew/profiles'),
        fetch('/api/desktop-manager/status'),
      ])
      const profilesData = await profilesRes.json()
      setProfiles(profilesData.profiles ?? [])
      setDefaultOn(profilesData.defaultEnabled === true)
      setArmorMode(profilesData.armorMode === 'reverify' ? 'reverify' : profilesData.armorMode === 'pentagi' ? 'pentagi' : 'coldbrew')
      setReverify(profilesData.reverify ?? null)
      const statusData = await statusRes.json()
      setStatus(statusData)
      // 这两个接口答上来，本身就证明后端在线——它就是提供这些接口的那个进程。
      setOnline(true)
      if (statusData.isRunning) {
        setBusy(true)
        startPolling()
      }
    } catch (error) {
      console.error('Failed to fetch status', error)
      setOnline(false)
    } finally {
      setLoading(false)
    }
  }, [startPolling])

  useEffect(() => {
    refresh()
    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [refresh])

  const toggleGlobalDefault = async (next: boolean) => {
    // 先乐观切换，失败再回滚，避免开关跟手感差。
    setDefaultOn(next)
    try {
      const res = await fetch('/api/coldbrew/default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) throw new Error(await res.text())
      showToast(next ? '新会话将默认开启破甲' : '新会话将默认关闭破甲')
    } catch (error: any) {
      setDefaultOn(!next)
      showToast(`设置失败: ${error.message}`)
    }
  }

  const setArmorModeRemote = async (next: 'coldbrew' | 'reverify' | 'pentagi') => {
    const previous = armorMode
    setArmorMode(next)
    try {
      const res = await fetch('/api/coldbrew/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      if (!res.ok) throw new Error(await res.text())
      showToast(next === 'reverify'
        ? '空白输入框会立刻变成 Reverify；已聊过的会话要新开一轮。'
        : next === 'pentagi'
          ? '空白输入框会立刻变成 PentAGI；已聊过的会话要新开一轮。'
          : '空白输入框会立刻变成冷咖啡；已聊过的会话要新开一轮。')
    } catch (error: any) {
      setArmorMode(previous)
      showToast(`切换模式失败: ${error.message}`)
    }
  }

  const installReverify = async (extra: 'full' | 'angr') => {
    setBusy(true)
    setInstallingExtra(extra)
    setLogs([extra === 'angr' ? '开始加装调用图引擎…' : '开始安装高精度引擎…'])
    startPolling()
    try {
      const res = await fetch('/api/coldbrew/reverify/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra }),
      })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs)
      if (!res.ok) throw new Error(data.error ?? '安装失败')
      setReverify(data)
      showToast(extra === 'angr' ? '调用图引擎已装好' : '高精度引擎已装好')
    } catch (error: any) {
      showToast(`安装失败: ${error.message}`)
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      setInstallingExtra(null)
      setBusy(false)
      await refresh()
    }
  }

  const setProfileDefault = async (profileId: string, defaultEnabled: boolean) => {
    try {
      const res = await fetch(`/api/coldbrew/profile/${encodeURIComponent(profileId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: defaultEnabled }),
      })
      if (!res.ok) throw new Error(await res.text())
      setProfiles(current => current === null ? current : current.map(p =>
        p.id === profileId ? { ...p, defaultEnabled } : p))
    } catch (error: any) {
      showToast(`操作失败: ${error.message}`)
    }
  }

  const action = async (type: string) => {
    console.log(`[dsh-desktop-manager] Action: ${type}`)
    if (type === 'restart') {
      window.parent.postMessage({ type: 'deepseek-harness:restart' }, '*')
      return
    }
    setBusy(true)
    setLogs([])
    try {
      const res = await fetch(`/api/desktop-manager/${type}`, { method: 'POST' })
      if (!res.ok) {
        throw new Error(await res.text())
      }
      if (type === 'install' || type === 'uninstall') {
        startPolling()
      } else {
        showToast('设置已更新，点击下方按钮应用')
        await refresh()
        setBusy(false)
      }
    } catch (error: any) {
      showToast(`操作失败: ${error.message}`)
      setBusy(false)
    }
  }

  if (loading) return <div className="dsm-empty">正在加载管理界面…</div>

  // 状态点的四色语义直接复用宿主的 StateDot：已启用=done，已禁用=warning，未安装=error。
  const pluginState = !status.installed ? 'error' : status.enabled ? 'done' : 'warning'
  const pluginStateText = !status.installed ? '尚未安装' : status.enabled ? '已启用' : '已禁用'

  return (
    <div className="dsm-root">
      {toast !== null && (
        <Toast key={toast.seq} text={toast.text} onDone={() => setToast(null)} />
      )}

      <div className="dsm-hub">
        <div className="dsm-hub-head">
          <span className="dsm-state">
            <StateDot
              state={online === null ? 'warning' : online ? 'done' : 'error'}
              size={8}
            />
            后端 {online === null ? '检查中…' : online ? '运行中' : '连接失败'}
          </span>
          {busy && (
            <span className="dsm-state">
              <StateDot state="ongoing" size={8} />
              任务执行中
            </span>
          )}

          <label className="dsm-default-toggle">
            <input
              type="checkbox"
              checked={defaultOn}
              onChange={(event) => { void toggleGlobalDefault(event.target.checked) }}
            />
            <span>所有新会话默认开启破甲</span>
          </label>
        </div>

        <div className="dsm-mode-row" role="radiogroup" aria-label="工作模式">
          <button
            type="button"
            className="dsm-mode-chip"
            data-on={armorMode === 'coldbrew' || undefined}
            aria-pressed={armorMode === 'coldbrew'}
            onClick={() => { void setArmorModeRemote('coldbrew') }}
          >
            冷咖啡 2.1.0
          </button>
          <button
            type="button"
            className="dsm-mode-chip"
            data-on={armorMode === 'reverify' || undefined}
            aria-pressed={armorMode === 'reverify'}
            onClick={() => { void setArmorModeRemote('reverify') }}
          >
            Reverify 0.9.0
          </button>
          <button
            type="button"
            className="dsm-mode-chip"
            data-on={armorMode === 'pentagi' || undefined}
            aria-pressed={armorMode === 'pentagi'}
            onClick={() => { void setArmorModeRemote('pentagi') }}
          >
            PentAGI 1.0.0
          </button>
          <span className="dsm-mode-hint">
            {armorMode === 'reverify'
              ? '之后新开的对话，会先核对文件再下结论。'
              : armorMode === 'pentagi'
                ? '之后新开的对话，会按渗透编排方式执行任务。'
                : '之后新开的对话，会按原来的冷咖啡方式工作。'}
          </span>
        </div>

        {status.installed && (
          <div className="dsm-note dsm-apply-note">
            <span>更改插件启用状态或安装新插件后，需要重启后端服务，系统提示词才会重新加载。</span>
            {!busy && (
              <Button onClick={() => action('restart')} variant="primary" size="sm">
                重启应用
              </Button>
            )}
          </div>
        )}

        {!defaultOn && (
          <p className="dsm-hub-hint">
            下面可以按模型单独设置：只有新会话用到该模型时，才自动开启破甲。
          </p>
        )}

        <div className="dsm-list">
          {(profiles ?? []).map(profile => {
            // 总开关一旦打开，逐模型设置就被它盖过去了——如实说明，
            // 否则会出现「总开关已开、这里却写着默认关闭」这种自相矛盾的显示。
            const effective = defaultOn || profile.defaultEnabled
            const state: 'done' | 'warning' = effective ? 'done' : 'warning'
            return (
              <article className="dsm-card" key={profile.id}>
                <div className="dsm-card-main">
                  <span className="dsm-card-title">
                    {profile.name}<span className="dsm-card-id">{profile.id} · 2.1.0</span>
                  </span>
                  {PROFILE_MATCH_HINTS[profile.id] !== undefined && (
                    <span className="dsm-card-sub">{profile.short} · {PROFILE_MATCH_HINTS[profile.id]}</span>
                  )}
                </div>
                <div className="dsm-card-side">
                  <span className="dsm-state">
                    <StateDot state={state} size={8} />
                    {defaultOn
                      ? '已由总开关开启'
                      : profile.defaultEnabled
                        ? '用此模型时默认开启'
                        : '用此模型时不自动开启'}
                  </span>
                  <div className="dsm-actions">
                    <Button
                      onClick={() => void setProfileDefault(profile.id, !profile.defaultEnabled)}
                      disabled={busy || defaultOn}
                      variant={profile.defaultEnabled ? 'outline' : 'primary'}
                      size="sm"
                      title={defaultOn ? '总开关已开启，逐模型设置暂不生效' : undefined}
                    >
                      {profile.defaultEnabled ? '取消默认开启' : '设为默认开启'}
                    </Button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <div className="dsm-list">
        <ReverifyCard
          status={reverify}
          busy={busy}
          installingExtra={installingExtra}
          onInstall={(extra) => { void installReverify(extra) }}
          onProbe={() => { void refresh() }}
        />
        <article className="dsm-card">
          <div className="dsm-card-main">
            <span className="dsm-card-title">
              冷咖啡 Zero 2.1.0<span className="dsm-card-id">BREAK//OPEN</span>
            </span>
            <a
              className="dsm-card-link"
              href="https://github.com/3641397194-wq/gpt5.6-claude-grok4.6-deepseekv4pro"
              target="_blank"
              rel="noreferrer noopener"
            >
              github.com/3641397194-wq/gpt5.6-claude-grok4.6-deepseekv4pro
            </a>
            <span className="dsm-state">
              <StateDot state={pluginState} size={8} />
              {pluginStateText}
            </span>
          </div>

          <div className="dsm-actions">
            {!status.installed ? (
              <Button onClick={() => action('install')} disabled={busy} variant="primary" size="sm">
                一键安装
              </Button>
            ) : (
              <>
                <Button onClick={() => action('toggle')} disabled={busy} variant="primary" size="sm">
                  {status.enabled ? '禁用插件' : '启用插件'}
                </Button>
                <Button onClick={() => action('uninstall')} disabled={busy} variant="outline" size="sm">
                  彻底卸载
                </Button>
              </>
            )}
          </div>
        </article>
      </div>

      {(busy || logs.length > 0) && (
        <section className="dsm-logs">
          <div className="dsm-logs-head">
            <span>{installingExtra ? '安装实时日志' : '任务实时日志'}</span>
            {busy && <span className="dsm-logs-running">正在执行…</span>}
          </div>
          <TerminalBlock
            className="dsm-terminal"
            command="桌面管理任务"
            output={logs.length > 0 ? logs.join('\n') : '等待任务开始…'}
            running={busy}
          />
        </section>
      )}

    </div>
  )
}

export function apply(ctx: ClientContext) {
  installStyles()

  ctx.effect(() => ctx.locale.register(NS, {
    zh: { 'nav': '破甲管理', 'pentagiNav': 'PentAGI' },
    en: { 'nav': 'Jailbreak', 'pentagiNav': 'PentAGI' }
  }), 'dsh-desktop-manager: dictionaries')

  const t = ctx.locale.bind(NS)

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'desktop-manager',
    order: 100,
    label: () => t('nav'),
    locale: NS,
  }, ManagerSection))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'pentagi',
    order: 110,
    label: () => t('pentagiNav'),
    locale: NS,
  }, PentagiSection))

  // 输入框内的冷咖啡破甲开关：conversation.input.left 是会话作用域 list 槽位，
  // owner share 提供 session/input 快照，inject 回调按会话注入模型目录 store。
  // 需要 modelDirectories 服务解析当前会话的模型选择；会话尚未就绪时容错为 null。
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'coldbrew-toggle',
    order: 10,
    locale: NS,
    inject: (sessionId: string): ColdBrewToggleInjected => {
      try {
        const directory = ctx.modelDirectories?.directoryFor(sessionId)
        if (directory === undefined) return { directory: null }
        return { directory: directory.store }
      } catch {
        return { directory: null }
      }
    },
  }, ColdBrewToggle))
}
