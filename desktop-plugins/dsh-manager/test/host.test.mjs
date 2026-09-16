import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply, inject, enableArmorSession, matchProfileId, name, settingsFile, normalizeArmorMode } from '../src/index.mjs'
import { REVERIFY_TOOLS, probeReverify, runReverifyTool, resolveHostPython } from '../src/reverify.mjs'
import { runPentagiTool, buildSandboxDockerArgs, buildPersistentSandboxCreateArgs, wrapSandboxHostLoopback, SANDBOX_CONTAINER_NAME, flowFilesRestPath, KNOWLEDGE_SEARCH_GQL, SANDBOX_CAP_ADD, formatSpecialistDispatchInput, SPECIALIST_ROLES, generateFlowMarkdown, scraperPublicUrl, buildMultipart, jsonSafe, extractAssistantResult, extractAdviserAdvice, extractSpecialistResult, resolveKnowledgeIds, unwrapDuckDuckGoHref } from '../src/pentagi.mjs'
import { applyLlmToEnvText, pickHarnessLlm } from '../src/pentagi-providers.mjs'
import { pentestImage, whichDocker, pentagiSandboxEnabled, pentagiDindEnabled, pentagiComposeEnv, dockerHost } from '../src/pentagi-runtime.mjs'

/** 把 DSH_HOME 指到临时目录，避免测到仓库根 / 安装包里的桌面设置。 */
function isolateHome() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-manager-home-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  return {
    home,
    settingsPath: join(home, 'desktop-settings.json'),
    statePath: join(home, 'coldbrew-sessions.json'),
    restore() {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
      rmSync(home, { recursive: true, force: true })
    },
  }
}

function mockReq(method, url, body) {
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body)
    },
  }
}

function withInject(ctx) {
  return {
    ...ctx,
    inject(names, fn) {
      if (names.includes('webServer') && ctx.webServer !== undefined) fn(ctx)
      return () => {}
    },
  }
}

function mockRes() {
  const result = { status: 0, body: '', headers: {} }
  return {
    result,
    writeHead(status, headers) {
      result.status = status
      result.headers = headers ?? {}
    },
    end(body) {
      result.body = body ?? ''
    },
  }
}

/** 构造带 ctx.agents 注册表的 agent（模拟真实 AgentRegistry，支持父链回溯）。 */
function mockRegistry() {
  const agents = new Map()
  const registry = { get: (id) => agents.get(id) }
  const mk = (id, model, parentSession) => {
    const agent = {
      id,
      options: { model },
      session: { header: { parentSession }, requestHeader: () => undefined },
      ctx: { agents: registry },
    }
    agents.set(id, agent)
    return agent
  }
  return { registry, mk }
}

test('host plugin exposes the desktop manager name', () => {
  assert.equal(name, 'dsh-desktop-manager')
})

test('CLI inject omits webServer so TUI does not wait forever', () => {
  assert.equal(inject.includes('webServer'), false)
  assert.deepEqual(inject, ['loader', 'systemPrompt', 'tools'])
})

test('matchProfileId routes model names to ColdBrew profiles', () => {
  assert.equal(matchProfileId('deepseek-v4-flash'), 'deepseek')
  assert.equal(matchProfileId('deepseek-v4-pro'), 'deepseek')
  assert.equal(matchProfileId('grok-4.6'), 'grok')
  assert.equal(matchProfileId('claude-sonnet-4'), 'claude')
  assert.equal(matchProfileId('gpt-5.6'), 'codex')
  assert.equal(matchProfileId('codex-1'), 'codex')
  assert.equal(matchProfileId('o3-mini'), 'codex')
  assert.equal(matchProfileId('glm-5.3'), 'glm')
  assert.equal(matchProfileId('chatglm-4'), 'glm')
  assert.equal(matchProfileId('zhipu-glm-5'), 'glm')
  // 未知/空模型回落 DeepSeek
  assert.equal(matchProfileId('unknown-model'), 'deepseek')
  assert.equal(matchProfileId(''), 'deepseek')
  assert.equal(matchProfileId(null), 'deepseek')
})

test('all five ColdBrew 2.1.0 seats share BREAK//OPEN kernel', async () => {
  const { apply: applyHost } = await import('../src/index.mjs')
  const tools = []
  const ctx = {
    effect(fn) { fn() },
    systemPrompt: { section() { return () => {} } },
    tools: { register(tool) { tools.push(tool); return () => {} } },
    webServer: { register() {} },
  }
  applyHost(withInject(ctx))
  const payload = tools[0].execute()
  assert.equal(payload.version, '2.1.0')
  assert.equal(payload.control, 'BREAK//OPEN')
  assert.deepEqual(payload.modes, ['coldbrew', 'reverify', 'pentagi'])
  assert.equal(payload.reverifyVersion, '0.9.0')
  const ids = payload.profiles.map(p => p.id).sort()
  assert.deepEqual(ids, ['claude', 'codex', 'deepseek', 'glm', 'grok'])
  for (const profile of payload.profiles) {
    assert.match(profile.prompt, /ColdBrew Zero 2\.1\.0/)
    assert.match(profile.prompt, /BREAK\/\/OPEN/)
    assert.match(profile.prompt, /FiveEdge/)
    assert.match(profile.prompt, /GLM 5\.3/)
    assert.match(profile.prompt, /本会话已经 MAX/)
    assert.match(profile.prompt, /第一句用户消息就是任务/)
    assert.match(profile.prompt, /\[\[ENI:PROFILE=MAX\]\]/)
    assert.match(profile.prompt, /\[\[CB:MAX\]\]/)
    assert.match(profile.reverifyPrompt, /REVERIFY/)
    assert.match(profile.reverifyPrompt, /re_verify_claim/)
    assert.match(profile.reverifyPrompt, /\[\[RV:VERIFY\]\]/)
    assert.match(profile.reverifyPrompt, /冷咖啡 ColdBrew 2\.1\.0 仍在/)
  }
  const byId = Object.fromEntries(payload.profiles.map(p => [p.id, p.prompt]))
  assert.match(byId.codex, /开关开启即 MAX/)
  assert.match(byId.claude, /开关开启即 MAX/)
  assert.match(byId.grok, /开关开启即 MAX/)
  assert.match(byId.deepseek, /开关开启即 MAX/)
  assert.match(byId.glm, /开关开启即 MAX/)
})

test('apply registers coldbrew section, tool, and webServer routes', () => {
  const sections = []
  const tools = []
  const servers = []
  const ctx = {
    effect(fn) { fn() },
    systemPrompt: { section(section) { sections.push(section); return () => {} } },
    tools: { register(tool) { tools.push(tool); return () => {} } },
    webServer: { register(route) { servers.push(route) } },
  }
  assert.doesNotThrow(() => apply(withInject(ctx)))
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, 'coldbrew:session-profile')
  assert.equal(sections[0].order, 195)
  assert.equal(tools[0].name, 'coldbrew_profiles')
  assert.equal(tools[1].name, 'pentagi_profiles')
  assert.ok(tools.some(t => t.name === 'pg_status'), 'must register pg_* tools')
  assert.ok(REVERIFY_TOOLS.every(t => tools.some(reg => reg.name === t.name)), 'must register re_* tools')
  assert.equal(servers.length, 2)
  assert.deepEqual(servers.map(s => s.path).sort(), ['/api/coldbrew', '/api/desktop-manager'])
})

test('normalizeArmorMode only accepts reverify or coldbrew', () => {
  assert.equal(normalizeArmorMode('reverify'), 'reverify')
  assert.equal(normalizeArmorMode('coldbrew'), 'coldbrew')
  assert.equal(normalizeArmorMode('nope'), 'coldbrew')
  assert.equal(normalizeArmorMode(undefined), 'coldbrew')
})

test('reverify mode injects bytes-as-judge kernel for every seat', async () => {
  const isolated = isolateHome()
  try {
    writeFileSync(isolated.settingsPath, JSON.stringify({
      coldbrew: { defaultEnabled: true, armorMode: 'reverify' },
    }))
    writeFileSync(isolated.statePath, JSON.stringify({}))
    const sections = []
    const ctx = {
      effect(fn) { fn() },
      systemPrompt: { section(section) { sections.push(section); return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register() {} },
    }
    apply(withInject(ctx))
    const provider = sections[0].text
    for (const model of ['gpt-5.6', 'claude-sonnet-4', 'grok-4.6', 'glm-5.3', 'deepseek-v4']) {
      const agent = { id: `sess-${model}`, options: { model }, session: { header: {}, requestHeader: () => undefined } }
      const text = provider({ scope: agent })
      assert.match(text, /REVERIFY/, `${model} must inject Reverify kernel`)
      assert.match(text, /re_verify_claim/)
      assert.equal(/ColdBrew Zero 2\.1\.0/.test(text), false, `${model} must not inject ColdBrew kernel`)
    }
    writeFileSync(isolated.settingsPath, JSON.stringify({
      coldbrew: { defaultEnabled: true, armorMode: 'coldbrew' },
    }))
    const grok = { id: 'sess-back', options: { model: 'grok-4.6' }, session: { header: {}, requestHeader: () => undefined } }
    assert.match(provider({ scope: grok }), /ColdBrew Zero 2\.1\.0/)
  } finally {
    isolated.restore()
  }
})

test('legacy sessions without mode follow global armorMode', async () => {
  const isolated = isolateHome()
  try {
    writeFileSync(isolated.settingsPath, JSON.stringify({
      coldbrew: { defaultEnabled: false, armorMode: 'pentagi' },
    }))
    writeFileSync(isolated.statePath, JSON.stringify({
      'legacy-sess': { enabled: true, model: 'grok-4.6' },
    }))
    const sections = []
    const ctx = {
      effect(fn) { fn() },
      systemPrompt: { section(section) { sections.push(section); return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register() {} },
    }
    apply(withInject(ctx))
    const provider = sections[0].text
    const agent = { id: 'legacy-sess', options: { model: 'grok-4.6' }, session: { header: {}, requestHeader: () => undefined } }
    const text = provider({ scope: agent })
    assert.match(text, /PentAGI/)
    assert.equal(/ColdBrew Zero 2\.1\.0/.test(text), false)
  } finally {
    isolated.restore()
  }
})

test('POST /api/coldbrew/mode persists armorMode under DSH_HOME', async () => {
  const isolated = isolateHome()
  try {
    const servers = []
    const ctx = {
      effect(fn) { fn() },
      systemPrompt: { section() { return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register(route) { servers.push(route) } },
    }
    apply(withInject(ctx))
    const route = servers.find(entry => entry.path === '/api/coldbrew')
    const res = mockRes()
    await route.handler(mockReq('POST', '/api/coldbrew/mode', JSON.stringify({ mode: 'reverify' })), res)
    assert.equal(res.result.status, 200)
    assert.equal(JSON.parse(readFileSync(isolated.settingsPath, 'utf8')).coldbrew.armorMode, 'reverify')
    const get = mockRes()
    await route.handler(mockReq('GET', '/api/coldbrew/profiles'), get)
    const body = JSON.parse(get.result.body)
    assert.equal(body.armorMode, 'reverify')
    assert.equal(body.reverify.version, '0.9.0')
    assert.equal(body.reverify.present, true)
  } finally {
    isolated.restore()
  }
})

test('GET /api/coldbrew/reverify/logs is available while install is idle', async () => {
  const isolated = isolateHome()
  try {
    const servers = []
    const ctx = {
      effect(fn) { fn() },
      systemPrompt: { section() { return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register(route) { servers.push(route) } },
    }
    apply(withInject(ctx))
    const route = servers.find(entry => entry.path === '/api/coldbrew')
    const res = mockRes()
    await route.handler(mockReq('GET', '/api/coldbrew/reverify/logs'), res)
    assert.equal(res.result.status, 200)
    const body = JSON.parse(res.result.body)
    assert.equal(body.isRunning, false)
    assert.ok(Array.isArray(body.logs))
  } finally {
    isolated.restore()
  }
})

test('host python prefers 3.10+ when Homebrew python3.12 exists', async () => {
  const host = await resolveHostPython(process.env, { major: 3, minor: 10 })
  if (host.error) {
    assert.match(host.error, /Python 3\.10/)
    return
  }
  const [major, minor] = String(host.version).split('.').map(Number)
  assert.ok(major > 3 || (major === 3 && minor >= 10), host.version)
})

test('vendored reverify actually disassembles bytes', async () => {
  const probe = await probeReverify()
  assert.equal(probe.present, true)
  if (probe.python?.error) {
    assert.ok(probe.python.error.includes('Python'), probe.python.error)
    return
  }
  assert.equal(probe.ok, true)
  const disasm = await runReverifyTool('re_disasm', { hex_bytes: '90505831C0C3', arch: 'x86_64' })
  assert.ok(Array.isArray(disasm), JSON.stringify(disasm))
  assert.equal(disasm[0].mnemonic, 'nop')
  const backends = await runReverifyTool('re_backends', {})
  assert.equal(typeof backends.disassembly.engine, 'string')
})

test('GET new session pins global armorMode so later settings edits cannot leak', async () => {
  const isolated = isolateHome()
  try {
    writeFileSync(isolated.settingsPath, JSON.stringify({
      coldbrew: { defaultEnabled: true, armorMode: 'reverify' },
    }))
    writeFileSync(isolated.statePath, JSON.stringify({}))
    const servers = []
    const ctx = {
      effect(fn) { fn() },
      systemPrompt: { section() { return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register(route) { servers.push(route) } },
    }
    apply(withInject(ctx))
    const route = servers.find(entry => entry.path === '/api/coldbrew')
    const get = mockRes()
    await route.handler(mockReq('GET', '/api/coldbrew/session/pinned-sess?model=grok-4.6'), get)
    assert.equal(JSON.parse(get.result.body).mode, 'reverify')
    assert.equal(JSON.parse(readFileSync(isolated.statePath, 'utf8'))['pinned-sess'].mode, 'reverify')
    writeFileSync(isolated.settingsPath, JSON.stringify({
      coldbrew: { defaultEnabled: true, armorMode: 'coldbrew' },
    }))
    const get2 = mockRes()
    await route.handler(mockReq('GET', '/api/coldbrew/session/pinned-sess?model=grok-4.6'), get2)
    assert.equal(JSON.parse(get2.result.body).mode, 'reverify')
  } finally {
    isolated.restore()
  }
})

test('first session persist locks global armorMode and ignores stale client mode', async () => {
  const isolated = isolateHome()
  try {
    writeFileSync(isolated.settingsPath, JSON.stringify({
      coldbrew: { defaultEnabled: true, armorMode: 'reverify' },
    }))
    writeFileSync(isolated.statePath, JSON.stringify({}))
    const servers = []
    const sections = []
    const ctx = {
      effect(fn) { fn() },
      systemPrompt: { section(section) { sections.push(section); return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register(route) { servers.push(route) } },
    }
    apply(withInject(ctx))
    const route = servers.find(entry => entry.path === '/api/coldbrew')
    const res = mockRes()
    await route.handler(mockReq('POST', '/api/coldbrew/session/new-sess', JSON.stringify({
      enabled: true,
      model: 'grok-4.6',
      mode: 'coldbrew',
    })), res)
    assert.equal(res.result.status, 200)
    const saved = JSON.parse(res.result.body)
    assert.equal(saved.mode, 'reverify')
    assert.equal(JSON.parse(readFileSync(isolated.statePath, 'utf8'))['new-sess'].mode, 'reverify')
    const agent = { id: 'new-sess', options: { model: 'grok-4.6' }, session: { header: {}, requestHeader: () => undefined } }
    const text = sections[0].text({ scope: agent })
    assert.match(text, /REVERIFY/)
    assert.equal(/ColdBrew Zero 2\.1\.0/.test(text), false)
  } finally {
    isolated.restore()
  }
})

test('child agents inherit parent Reverify mode through the agent chain', async () => {
  const isolated = isolateHome()
  try {
    writeFileSync(isolated.settingsPath, JSON.stringify({
      coldbrew: { defaultEnabled: false, armorMode: 'coldbrew' },
    }))
    writeFileSync(isolated.statePath, JSON.stringify({
      'parent-session': { enabled: true, model: 'grok-4.6', mode: 'reverify' },
    }))
    const sections = []
    const ctx = {
      effect(fn) { fn() },
      systemPrompt: { section(section) { sections.push(section); return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register() {} },
    }
    apply(withInject(ctx))
    const { mk } = mockRegistry()
    mk('parent-session', 'grok-4.6', undefined)
    mk('child-session', 'gpt-5.6', 'parent-session')
    const grandchild = mk('grandchild-session', 'claude-sonnet-4', 'child-session')
    const text = sections[0].text({ scope: grandchild })
    assert.match(text, /REVERIFY/)
    assert.match(text, /Claude Code · Reverify/)
    assert.equal(/ColdBrew Zero 2\.1\.0/.test(text), false)
  } finally {
    isolated.restore()
  }
})

test('re_verify_claim judges real bytes VERIFIED and REFUTED', async () => {
  const isolated = isolateHome()
  try {
    const sample = join(isolated.home, 'sample.bin')
    writeFileSync(sample, Buffer.from('MZ\x00\x00HELLO')) // 9 bytes
    const verified = await runReverifyTool('re_verify_claim', {
      file_path: sample,
      claims: [{ kind: 'bytes_at', params: { offset: 0, expected: '4d5a' }, note: 'MZ' }],
      record: false,
    }, { ...process.env, DSH_HOME: isolated.home })
    assert.equal(verified.error, undefined, JSON.stringify(verified))
    assert.equal(verified.results[0].verdict, 'VERIFIED')
    const refuted = await runReverifyTool('re_verify_claim', {
      file_path: sample,
      claims: [{ kind: 'bytes_at', params: { offset: 0, expected: '7f454c46' }, note: 'ELF lie' }],
      record: false,
    }, { ...process.env, DSH_HOME: isolated.home })
    assert.equal(refuted.results[0].verdict, 'REFUTED')
    const triage = await runReverifyTool('re_auto_triage', { file_path: sample }, { ...process.env, DSH_HOME: isolated.home })
    assert.equal(triage.size, 9)
  } finally {
    isolated.restore()
  }
})

test('registered re_* tools wrap both object and array MCP payloads', async () => {
  const tools = []
  const ctx = {
    effect(fn) { fn() },
    systemPrompt: { section() { return () => {} } },
    tools: { register(tool) { tools.push(tool); return () => {} } },
    webServer: { register() {} },
  }
  apply(withInject(ctx))
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  assert.deepEqual(byName.re_disasm.output.schema, {})
  assert.deepEqual(byName.re_backends.output.schema, {})
  const disasm = await byName.re_disasm.execute({ hex_bytes: '90C3', arch: 'x86_64' })
  assert.ok(Array.isArray(disasm), JSON.stringify(disasm))
  assert.equal(disasm[0].mnemonic, 'nop')
  const backends = await byName.re_backends.execute({})
  assert.equal(typeof backends, 'object')
  assert.equal(typeof backends.disassembly.engine, 'string')
})

test('coldbrew session profile section returns empty text when disabled or unknown', async () => {
  const isolated = isolateHome()
  try {
    writeFileSync(isolated.settingsPath, JSON.stringify({ coldbrew: { defaultEnabled: false } }))
    writeFileSync(isolated.statePath, JSON.stringify({ 'sess-1': { enabled: true, model: 'grok-4.6' } }))
    const sections = []
    const ctx = {
      effect(fn) { fn() },
      systemPrompt: { section(section) { sections.push(section); return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register() {} },
    }
    apply(withInject(ctx))
    const provider = sections[0].text
    assert.equal(provider({}), '')
    assert.equal(provider({ scope: {} }), '')
  } finally {
    isolated.restore()
  }
})

test('coldbrew session profile applies default-enabled rules for new sessions', async () => {
  const isolated = isolateHome()
  try {
    writeFileSync(isolated.settingsPath, JSON.stringify({ coldbrew: { defaultEnabled: true } }))
    writeFileSync(isolated.statePath, JSON.stringify({}))
    const sections = []
    const ctx = {
      effect(fn) { fn() },
      systemPrompt: { section(section) { sections.push(section); return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register() {} },
    }
    apply(withInject(ctx))
    const provider = sections[0].text
    const agent = { id: 'session-default-on', options: { model: 'deepseek-v4' }, session: { header: {}, requestHeader: () => undefined } }
    const text = provider({ scope: agent })
    assert.ok(text.length > 0, 'default-enabled 的新会话必须注入破甲正文')
    writeFileSync(isolated.statePath, JSON.stringify({ 'session-default-on': { enabled: false, model: 'deepseek-v4' } }))
    assert.equal(provider({ scope: agent }), '', '显式关闭必须压过总开关')
  } finally {
    isolated.restore()
  }
})

test('coldbrew session profile inherits parent-session armor through multi-level agent chains', async () => {
  const isolated = isolateHome()
  try {
    writeFileSync(isolated.settingsPath, JSON.stringify({ coldbrew: { defaultEnabled: false } }))
    writeFileSync(isolated.statePath, JSON.stringify({
      'parent-session': { enabled: true, model: 'deepseek-v4' },
    }))
    const sections = []
    const ctx = {
      effect(fn) { fn() },
      systemPrompt: { section(section) { sections.push(section); return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register() {} },
    }
    apply(withInject(ctx))
    const provider = sections[0].text

    const { mk } = mockRegistry()
    mk('parent-session', 'deepseek-v4', undefined)
    mk('child-session', 'deepseek-v4', 'parent-session')
    const grandchild = mk('grandchild-session', 'deepseek-v4', 'child-session')

    const text = provider({ scope: grandchild })
    assert.ok(text.length > 0, '孙代理必须继承父会话的破甲')
    writeFileSync(isolated.statePath, JSON.stringify({
      'parent-session': { enabled: false, model: 'deepseek-v4' },
    }))
    assert.equal(provider({ scope: grandchild }), '', '父会话关闭后孙代理也不得注入')
    writeFileSync(isolated.settingsPath, JSON.stringify({ coldbrew: { defaultEnabled: true } }))
    writeFileSync(isolated.statePath, JSON.stringify({}))
    assert.ok(provider({ scope: grandchild }).length > 0, '总开关开启时孙代理按默认规则注入')
  } finally {
    isolated.restore()
  }
})

test('coldbrew default toggle persists under DSH_HOME after the install tree is replaced', async () => {
  const isolated = isolateHome()
  try {
    const servers = []
    const ctx = {
      effect(fn) { fn() },
      systemPrompt: { section() { return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register(route) { servers.push(route) } },
    }
    apply(withInject(ctx))
    const route = servers.find(entry => entry.path === '/api/coldbrew')
    assert.ok(route, '必须注册 /api/coldbrew')

    const res = mockRes()
    await route.handler(mockReq('POST', '/api/coldbrew/default', JSON.stringify({ enabled: true })), res)
    assert.equal(res.result.status, 200)

    const dest = settingsFile()
    assert.equal(dest, isolated.settingsPath)
    assert.equal(JSON.parse(readFileSync(dest, 'utf8')).coldbrew.defaultEnabled, true)

    // 换版本整包替换：安装树里的同名文件消失。用户目录必须仍是开启。
    assert.equal(existsSync(join(isolated.home, '..', 'desktop-settings.json')), false)

    const sections = []
    const readCtx = {
      effect(fn) { fn() },
      systemPrompt: { section(section) { sections.push(section); return () => {} } },
      tools: { register() { return () => {} } },
      webServer: { register() {} },
    }
    apply(readCtx)
    const provider = sections[0].text
    const agent = {
      id: 'session-after-upgrade',
      options: { model: 'deepseek-v4' },
      session: { header: {}, requestHeader: () => undefined },
    }
    assert.ok(provider({ scope: agent }).length > 0, '升级冲掉安装树后总开关仍须生效')
  } finally {
    isolated.restore()
  }
})

test('compose env drops DOCKER_HOST so the host CLI uses docker context', () => {
  const host = dockerHost({ DSH_HOME: '/tmp/none' })
  const next = pentagiComposeEnv({ DSH_HOME: '/tmp/none', PATH: '/usr/bin:/bin' })
  assert.equal(Object.hasOwn(next, 'DOCKER_HOST'), false)
  assert.equal(next.PENTAGI_DOCKER_SOCKET, '/var/run/docker.sock')
  assert.ok(host, 'expected a colima/desktop socket to be detectable')
})

test('pentest sandbox image defaults to official vxcontrol/kali-linux', () => {
  assert.equal(pentestImage({}), 'vxcontrol/kali-linux')
  assert.equal(pentestImage({ DSH_PENTAGI_PENTEST_IMAGE: 'myorg/kali:openvas' }), 'myorg/kali:openvas')
})

test('sandbox defaults on and dind defaults off unless env/settings say otherwise', () => {
  const isolated = isolateHome()
  try {
    const env = { ...process.env, DSH_HOME: isolated.home }
    delete env.DSH_PENTAGI_SANDBOX
    delete env.DSH_PENTAGI_DIND
    assert.equal(pentagiSandboxEnabled(env), true)
    assert.equal(pentagiDindEnabled(env), false)
    writeFileSync(isolated.settingsPath, JSON.stringify({ coldbrew: { pentagi: { sandbox: false, dind: true } } }))
    assert.equal(pentagiSandboxEnabled(env), false)
    assert.equal(pentagiDindEnabled(env), true)
    assert.equal(pentagiDindEnabled({ ...env, DSH_PENTAGI_DIND: '0' }), false)
  } finally {
    isolated.restore()
  }
})

test('pg_terminal sandbox finds docker via EXTRA_PATH when GUI PATH is stripped', async () => {
  const env = { ...process.env, PATH: '/usr/bin:/bin' }
  const bin = whichDocker('docker', env)
  if (bin === 'docker' || !existsSync(bin)) return
  const result = await runPentagiTool('pg_terminal', {
    input: 'true',
    sandbox: true,
    timeout: 8,
    message: 'path probe',
  }, env)
  assert.notEqual(result.error, 'docker not available for sandbox terminal')
  assert.equal(result.bin, bin)
  assert.equal(result.image, 'vxcontrol/kali-linux')
  assert.ok(result.ok === true || /is not pulled/.test(String(result.error ?? '')))
})

test('Kali sandbox docker args drop ALL then add official pentest caps including NET_RAW', () => {
  const args = buildSandboxDockerArgs({
    detach: false,
    workHost: '/tmp/work',
    workInContainer: '/work',
    dind: true,
    image: 'vxcontrol/kali-linux',
    input: 'nmap -V',
  })
  assert.deepEqual(args.slice(0, 4), ['run', '--rm', '--cap-drop', 'ALL'])
  assert.ok(SANDBOX_CAP_ADD.includes('NET_RAW'))
  assert.ok(SANDBOX_CAP_ADD.includes('NET_ADMIN'))
  for (const cap of SANDBOX_CAP_ADD) {
    const idx = args.indexOf('--cap-add')
    assert.ok(idx >= 0, `missing --cap-add ${cap}`)
    assert.ok(args.includes(cap), `cap ${cap} not in docker args`)
  }
  assert.ok(args.includes('/var/run/docker.sock:/var/run/docker.sock') || args.some(v => v.includes('docker.sock')))
  assert.ok(args.includes('--add-host'))
  assert.ok(args.includes('host.docker.internal:host-gateway'))
  assert.equal(args.at(-4), 'vxcontrol/kali-linux')
  assert.match(args.at(-1), /socat TCP-LISTEN:9050,bind=127\.0\.0\.1/)
  assert.match(args.at(-1), /socat TCP-LISTEN:9150,bind=127\.0\.0\.1/)
  assert.match(args.at(-1), /nmap -V/)
})

test('sandbox wraps host Tor loopback so 127.0.0.1:9050 reaches the Mac daemon', () => {
  const wrapped = wrapSandboxHostLoopback('curl --socks5-hostname 127.0.0.1:9050 https://example.com')
  assert.match(wrapped, /host\.docker\.internal:9050/)
  assert.match(wrapped, /curl --socks5-hostname 127\.0\.0\.1:9050/)
})

test('persistent Kali sandbox keeps /work and /tmp across execs', () => {
  const args = buildPersistentSandboxCreateArgs({
    workHost: '/tmp/work',
    tmpHost: '/tmp/sandbox-tmp',
    dind: true,
    image: 'vxcontrol/kali-linux',
  })
  assert.equal(args[0], 'run')
  assert.ok(args.includes('-d'))
  assert.ok(args.includes('--name'))
  assert.ok(args.includes(SANDBOX_CONTAINER_NAME))
  assert.ok(args.includes('/tmp/work:/work'))
  assert.ok(args.includes('/tmp/sandbox-tmp:/tmp'))
  assert.ok(args.includes('host.docker.internal:host-gateway'))
  assert.ok(!args.includes('--rm'))
})

test('knowledge search GraphQL matches official schema (no withContent)', () => {
  assert.equal(KNOWLEDGE_SEARCH_GQL.includes('withContent'), false)
  assert.match(KNOWLEDGE_SEARCH_GQL, /searchKnowledge\(query: \$query, limit: \$limit\)/)
})

test('flow files REST list path has the trailing slash the backend 301s toward', () => {
  assert.equal(flowFilesRestPath('4'), '/api/v1/flows/4/files/')
  assert.equal(flowFilesRestPath('4', 'container'), '/api/v1/flows/4/files/container')
  assert.equal(flowFilesRestPath('4', '/download'), '/api/v1/flows/4/files/download')
  assert.equal(flowFilesRestPath('4', 'pull'), '/api/v1/flows/4/files/pull')
  assert.equal(flowFilesRestPath('4', 'resources'), '/api/v1/flows/4/files/resources')
  assert.equal(flowFilesRestPath('4', 'to-resources'), '/api/v1/flows/4/files/to-resources')
})

test('multipart builder uses files field and a closed boundary', () => {
  const { body, contentType, boundary } = buildMultipart([{ filename: 'note.txt', body: 'hello' }])
  const text = body.toString('utf8')
  assert.match(contentType, /multipart\/form-data; boundary=/)
  assert.match(text, /name="files"; filename="note.txt"/)
  assert.match(text, /hello/)
  assert.match(text, new RegExp(`--${boundary}--`))
})

test('specialist dispatch input names the official tool and stays English', () => {
  assert.equal(SPECIALIST_ROLES.pentester.tool, 'pentester')
  assert.equal(SPECIALIST_ROLES.coder.tool, 'coder')
  assert.equal(SPECIALIST_ROLES.maintenance.tool, 'installer')
  assert.equal(SPECIALIST_ROLES.adviser.tool, 'advice')
  assert.equal(SPECIALIST_ROLES.searcher.tool, 'search')
  const text = formatSpecialistDispatchInput('pentester', 'Print nmap version only. Do not scan.')
  assert.match(text, /official `pentester` tool/)
  assert.match(text, /useAgents is enabled/)
  assert.match(text, /Print nmap version only/)
})

test('pickHarnessLlm skips an unhealthy pin and uses the next healthy provider', () => {
  const isolated = isolateHome()
  try {
    writeFileSync(isolated.settingsPath, JSON.stringify({ coldbrew: { pentagi: { harnessProvider: 'grok-pro' } } }))
    const inspected = [
      { id: 'grok-pro', healthy: false, isDefault: true, baseURL: 'http://127.0.0.1:63228/v1' },
      { id: 'grok2', healthy: true, isDefault: false, baseURL: 'https://st.wqyhr.com/v1' },
    ]
    const pick = pickHarnessLlm(inspected, { DSH_HOME: isolated.home })
    assert.equal(pick.id, 'grok2')
    assert.equal(pick.reason, 'pinned-unhealthy-fallback')
  } finally {
    isolated.restore()
  }
})

test('unwrapDuckDuckGoHref extracts the real destination from uddg', () => {
  const wrapped = '//duckduckgo.com/l/?uddg=https%3A%2F%2Fcommandcode.ai%2F&rut=abc'
  assert.equal(unwrapDuckDuckGoHref(wrapped), 'https://commandcode.ai/')
  assert.equal(unwrapDuckDuckGoHref('https://example.com/x'), 'https://example.com/x')
})

test('LLM env sync writes embedding independently of the chat scheduler', () => {
  const pick = {
    baseURL: 'http://127.0.0.1:3000/v1',
    key: 'sk-test',
    model: 'grok-pro',
    probe: { model: 'grok-pro' },
    healthy: true,
  }
  const none = applyLlmToEnvText('LLM_SERVER_URL=old\n', pick, { embedding: { ok: false, source: 'none' } })
  assert.match(none, /LLM_SERVER_MODEL=grok-pro/)
  assert.match(none, /EMBEDDING_PROVIDER=none/)
  const api = applyLlmToEnvText(none, pick, {
    embedding: { ok: true, source: 'api', url: 'https://api.siliconflow.cn/v1', key: 'sk-sf', model: 'BAAI/bge-m3' },
  })
  assert.match(api, /EMBEDDING_PROVIDER=openai/)
  assert.match(api, /EMBEDDING_URL=https:\/\/api.siliconflow.cn\/v1/)
  assert.match(api, /EMBEDDING_MODEL=BAAI\/bge-m3/)
  assert.match(api, /LLM_SERVER_MODEL=grok-pro/)
  const local = applyLlmToEnvText(api, pick, {
    embedding: { ok: true, source: 'local', url: 'http://host.docker.internal:63229/v1', key: 'sk-dsh-local-embed', model: 'BAAI/bge-small-en-v1.5' },
  })
  assert.match(local, /EMBEDDING_URL=http:\/\/host\.docker\.internal:63229\/v1/)
  assert.match(local, /SCRAPER_PRIVATE_URL=https:\/\/someuser:somepass@scraper\//)
  assert.match(local, /DOCKER_DEFAULT_IMAGE=vxcontrol\/kali-linux/)
  assert.match(local, /DOCKER_NET_ADMIN=true/)
})

test('jsonSafe drops undefined so specialist payloads are lossless JSON', () => {
  const cleaned = jsonSafe({
    ok: true,
    hint: undefined,
    result: 'PONG',
    logs: [undefined, { type: 'answer', result: 'PONG' }],
    local: undefined,
    nested: { a: 1, b: undefined },
  })
  assert.equal(Object.hasOwn(cleaned, 'hint'), false)
  assert.equal(cleaned.result, 'PONG')
  assert.equal(cleaned.logs[0], null)
  assert.equal(cleaned.logs[1].result, 'PONG')
  assert.equal(Object.hasOwn(cleaned, 'local'), false)
  assert.deepEqual(cleaned.nested, { a: 1 })
  assert.equal(JSON.parse(JSON.stringify(cleaned)).result, 'PONG')
})

test('flow markdown report matches official heading layout', () => {
  const md = generateFlowMarkdown(
    { id: 4, title: 'Reply Ping Only', status: 'waiting' },
    [{ id: 1, title: 'Ping', status: 'finished', input: '# Goal\nping', result: 'pong', subtasks: [{ id: 1, title: 'Reply ping', status: 'finished', description: 'pong only', result: 'pong' }] }],
  )
  assert.match(md, /^# ⏳ 4\. Reply Ping Only/m)
  assert.match(md, /### ✅ 1\. Ping/)
  assert.match(md, /#### ✅ 1\. Reply ping/)
  assert.match(md, /pong/)
})

test('scraper public URL defaults to local 9443', () => {
  assert.equal(scraperPublicUrl({ DSH_PENTAGI_SCRAPER_URL: '' }), 'https://someuser:somepass@127.0.0.1:9443')
  assert.equal(scraperPublicUrl({ DSH_PENTAGI_SCRAPER_URL: 'https://user:pass@127.0.0.1:9443/' }), 'https://user:pass@127.0.0.1:9443')
})

test('extractAssistantResult ignores narration and waits for the specialist answer', () => {
  const logs = [
    { type: 'input', message: 'delegate to advice' },
    { type: 'answer', message: "I'll send this supervision smoke test to the senior mentor now." },
    { type: 'advice', message: 'Delegating the supervision smoke test to the senior mentor.' },
    { type: 'answer', message: 'Closing with runtime facts the adviser does not already have: Kali image.' },
  ]
  assert.equal(extractAssistantResult(logs), '')
  logs.push({ type: 'answer', message: '(1) senior mentor (2) yes I review tool output (3) nmap -sn 127.0.0.1' })
  assert.match(extractAssistantResult(logs), /senior mentor/)
})

test('extractSpecialistResult prefers the adviser agentLog over enricher facts', () => {
  const logs = [{ type: 'answer', message: 'Closing with runtime facts the adviser does not already have.' }]
  const agents = [
    { initiator: 'assistant', executor: 'enricher', result: 'Kali 2025.4 nmap 7.98' },
    { initiator: 'assistant', executor: 'adviser', result: '(1) senior mentor (2) yes (3) nmap -sn 127.0.0.1' },
  ]
  assert.equal(extractSpecialistResult('coder', logs, agents), '')
  assert.match(extractSpecialistResult('adviser', logs, agents), /senior mentor/)
})

test('extractAdviserAdvice returns the mentor final answer without an agentLog dump', () => {
  const logs = [
    { type: 'answer', message: "I'll send this to the senior mentor now." },
    { type: 'advice', message: 'Delegating the supervision smoke test to the senior mentor.', result: '' },
  ]
  const agents = [
    { initiator: 'assistant', executor: 'enricher', result: 'Kali 2025.4 nmap 7.98' },
    { initiator: 'assistant', executor: 'adviser', result: '(1) senior mentor (2) yes (3) nmap -sn 127.0.0.1' },
  ]
  const hit = extractAdviserAdvice(logs, agents, [])
  assert.equal(hit.source, 'agentLog')
  assert.match(hit.advice, /senior mentor/)
  assert.equal(Object.hasOwn(jsonSafe({ advice: hit.advice, result: hit.advice, logs: undefined, agents: undefined }), 'logs'), false)
})

test('extractAdviserAdvice falls back to adviceLog result then advice toolCall', () => {
  const logs = [
    { type: 'advice', message: 'Delegating.', result: '' },
    { type: 'advice', message: 'Asking mentor.', result: 'Review the nmap timing first.' },
  ]
  assert.equal(extractAdviserAdvice(logs, [], []).source, 'adviceLog')
  assert.match(extractAdviserAdvice(logs, [], []).advice, /nmap timing/)
  const toolcalls = [
    { name: 'terminal', result: 'not advice' },
    { name: 'advice', result: 'Pivot to a smaller PoC.' },
  ]
  assert.equal(extractAdviserAdvice([{ type: 'advice', message: 'Delegating.' }], [], toolcalls).source, 'toolCall')
  assert.match(extractAdviserAdvice([{ type: 'advice', message: 'Delegating.' }], [], toolcalls).advice, /smaller PoC/)
})

test('resolveKnowledgeIds maps local k-* ids onto the official UUID', () => {
  const store = {
    documents: [{
      id: '2f0514b2-2f6c-4779-9b00-3a6e69718b81',
      localId: 'k-1789157327217',
      remoteId: '2f0514b2-2f6c-4779-9b00-3a6e69718b81',
    }],
  }
  const byLocal = resolveKnowledgeIds(store, 'k-1789157327217')
  assert.equal(byLocal.remoteId, '2f0514b2-2f6c-4779-9b00-3a6e69718b81')
  const byRemote = resolveKnowledgeIds(store, '2f0514b2-2f6c-4779-9b00-3a6e69718b81')
  assert.equal(byRemote.localId, 'k-1789157327217')
  const orphan = resolveKnowledgeIds({ documents: [{ id: 'k-1' }] }, 'k-1')
  assert.equal(orphan.remoteId, '')
})

test('pg_pentester falls back to a local stub when the official token is missing and API is down', async () => {
  const isolated = isolateHome()
  try {
    const env = {
      ...process.env,
      DSH_HOME: isolated.home,
      DSH_PENTAGI_TOKEN: '',
      DSH_PENTAGI_URL: 'https://127.0.0.1:1',
    }
    delete env.DSH_PENTAGI_TOKEN
    const result = await runPentagiTool('pg_pentester', {
      question: 'Print nmap version only',
      message: 'stub fallback',
    }, env)
    assert.equal(result.dispatched, false)
    assert.equal(result.role, 'pentester')
    assert.ok(result.reason, 'expected a mint/API failure reason')
    assert.notEqual(result.reason, undefined)
    assert.ok(Array.isArray(result.playbook))
    assert.ok(result.playbook[0].includes('pg_search_in_memory'))
  } finally {
    isolated.restore()
  }
})

test('pg_advice local stub surfaces counsel as advice without an agentLog dump', async () => {
  const isolated = isolateHome()
  try {
    const env = {
      ...process.env,
      DSH_HOME: isolated.home,
      DSH_PENTAGI_URL: 'https://127.0.0.1:1',
    }
    delete env.DSH_PENTAGI_TOKEN
    const result = await runPentagiTool('pg_advice', {
      question: 'What should I do next after nmap hangs?',
      message: 'mentor stub',
    }, env)
    assert.equal(result.dispatched, false)
    assert.equal(result.role, 'adviser')
    assert.equal(result.source, 'local')
    assert.match(result.advice, /pg_terminal/)
    assert.equal(result.advice, result.result)
    assert.equal(result.logs, undefined)
    assert.equal(result.agents, undefined)
  } finally {
    isolated.restore()
  }
})

test('enableArmorSession writes coldbrew mode for CLI passphrase', () => {
  const isolated = isolateHome()
  try {
    const state = enableArmorSession('session-cli-1', { mode: 'coldbrew', enabled: true, model: 'grok-4.6' })
    assert.equal(state.mode, 'coldbrew')
    assert.equal(state.enabled, true)
    const disk = JSON.parse(readFileSync(isolated.statePath, 'utf8'))
    assert.equal(disk['session-cli-1'].mode, 'coldbrew')
  } finally {
    isolated.restore()
  }
})
