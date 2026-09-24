import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REF = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Harness 凭据文档 `<home>/.credentials.yaml` 里的引用 → 值。
 *
 * 本插件也会直接从源码目录加载（Tauri 开发模式），那里解析不到 `yaml` 包，所以这里
 * 只读两个 Harness 版本的 YAML 库实际会写出的写法，不依赖第三方包：
 * - 扁平布局：根上 `KEY: value`；
 * - version 1 布局（较新的 Harness 会就地迁移成这种）：`version: 1`，条目在 `refs:` 下，
 *   可以是块格式（每行一条），也可以是流式 `refs: { KEY: value, … }`（可能折成多行）；
 *   `records:` 段忽略。
 * 值可以是普通、单引号或双引号标量；普通值行尾的 ` # 注释` 去掉；块标量（`|`、`>`）跳过。
 * @param {string} text 文档内容。
 * @returns {Record<string, string>} 非空的字符串值，按引用名索引。
 */
export function parseHarnessCredentials(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
  const out = {}
  const put = (key, raw) => {
    const value = scalar(raw)
    if (REF.test(key) && value) out[key] = value
  }
  // 与 credentials-local 一致：根上出现 `version` 键即为 version 1 布局。
  if (!lines.some((line) => /^version\s*:/.test(line))) {
    for (const line of lines) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:(.*)$/)
      if (m) put(m[1], m[2])
    }
    return out
  }
  const start = lines.findIndex((line) => /^refs\s*:/.test(line))
  if (start < 0) return out
  const section = [lines[start].replace(/^refs\s*:/, '')]
  for (const line of lines.slice(start + 1)) {
    if (/^[^\s#]/.test(line)) break
    section.push(line)
  }
  const body = section.join('\n').replace(/^\s*(#[^\n]*)?\n?/, '').trimStart()
  if (body.startsWith('{')) {
    for (const entry of flowEntries(body)) {
      const colon = entry.indexOf(':')
      if (colon > 0) put(entry.slice(0, colon).trim(), entry.slice(colon + 1))
    }
    return out
  }
  for (const line of section.slice(1)) {
    const m = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:(.*)$/)
    if (m) put(m[1], m[2])
  }
  return out
}

/**
 * 读取 `<home>/.credentials.yaml`；文件不存在时为空。
 * @param {string} home Harness home（`$DSH_HOME` 或 `~/.dsh`）。
 * @returns {Record<string, string>}
 */
export function readHarnessCredentials(home) {
  const file = join(home, '.credentials.yaml')
  if (!existsSync(file)) return {}
  return parseHarnessCredentials(readFileSync(file, 'utf8'))
}

/** 一个 YAML 标量的字符串值；块标量与无法识别的写法返回空串。 */
function scalar(raw) {
  const s = String(raw).trim()
  if (s.startsWith('"')) {
    const m = s.match(/^"((?:[^"\\]|\\.)*)"/)
    if (!m) return ''
    try {
      return JSON.parse(`"${m[1]}"`)
    } catch {
      // JSON 不认识的 YAML 转义（如 \x41、\e）：按原样返回引号内的内容。
      return m[1]
    }
  }
  if (s.startsWith("'")) {
    const m = s.match(/^'((?:[^']|'')*)'/)
    return m ? m[1].replace(/''/g, "'") : ''
  }
  if (/^[|>]/.test(s)) return ''
  return s.replace(/\s+#.*$/, '').trim()
}

/**
 * 拆开一个流式映射 `{ K: v, … }` 的顶层条目（可跨行）。引号只在键或值开头时才算引号，
 * 引号内的 `,` `}` `#` 不参与拆分；引号外、前面是空白的 `#` 起到行尾是注释。
 */
function flowEntries(body) {
  const entries = []
  let current = ''
  let quote = ''
  let fresh = true
  let depth = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (quote) {
      current += c
      if (quote === '"' && c === '\\') current += body[++i] ?? ''
      else if (c === quote && quote === "'" && body[i + 1] === "'") current += body[++i]
      else if (c === quote) quote = ''
      continue
    }
    if (c === '#' && /\s/.test(body[i - 1] ?? ' ')) {
      while (i + 1 < body.length && body[i + 1] !== '\n') i++
      continue
    }
    if (c === '{' || c === '[') {
      depth++
      fresh = true
      if (depth === 1) continue
    } else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) {
        entries.push(current)
        break
      }
    } else if (c === ',' && depth === 1) {
      entries.push(current)
      current = ''
      fresh = true
      continue
    } else if (c === ':' && depth === 1) {
      fresh = true
    } else if ((c === '"' || c === "'") && fresh) {
      quote = c
    } else if (!/\s/.test(c)) {
      fresh = false
    }
    current += c
  }
  return entries
}
