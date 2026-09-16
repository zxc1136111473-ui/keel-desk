# DeepSeek Harness Desktop — 全量排查报告与安装/恢复手册

> 排查日期：2026-09-16 · 排查基线：v1.0.2（release-runtime Sep 16 构建）
> 本文档回答：以后会出现什么问题？在其他机器怎么安装？出问题后怎么恢复？

---

## 第一部分：已确认的「洞」（问题点）与处置

### 🔴 洞 1：源码 inject 缺失 `webServer`（最高危，必回归）

**现象**：`desktop-plugins/dsh-manager/src/index.mjs` 里：
```js
export const inject = ['loader', 'systemPrompt', 'tools']   // ❌ 缺 webServer
```
而 `apply()` 里却用了 `ctx.get('webServer')` 然后 `if (webServer !== undefined)` 注册路由。

**后果**：在 cordis 沙箱/受限 ctx 下，未声明 inject 的服务 `ctx.get()` 返回 `undefined`
→ `/api/coldbrew/*`、`/api/desktop-manager/*`、`/api/pentagi/*` 路由**全部不注册**
→ GUI 里 PentAGI 面板、冷咖啡、安装按钮全部 404（本次事故根因）。

**当前状态**：
| 位置 | inject | 状态 |
|---|---|---|
| 已装 App `desktop-plugins/.../lib/index.mjs` | ✅ 含 webServer | 已修 |
| 已装 App `node_modules/@deepseek-ai/dsh-desktop-manager` | ✅ 含 webServer | 已修 |
| `release-runtime/harness/.../lib/index.mjs` | ✅ 含 webServer | 已修 |
| 仓库 `desktop-plugins/dsh-manager/lib/index.mjs` | ❌ 缺 | **未修（必回归点）** |
| 仓库 `desktop-plugins/dsh-manager/src/index.mjs` | ❌ 缺 | **未修（必回归点）** |

**处置**：必须把下面这行写回两处源码（git 提交固化）：
```js
export const inject = ['webServer', 'loader', 'systemPrompt', 'tools']
```
> ⚠️ 若重新跑 `pnpm run build`（plugin:build）会重新生成 lib/，**覆盖**已修的手改。
> 所以源码不修，任何重打包都回归。**这是本次排查最重要的一条。**

---

### 🔴 洞 2：`/Volumes/编程工具/` 路径幻觉

AGENTS.md / CLAUDE.md 写死的 `/Volumes/编程工具/发布包/` 在本机**不存在**
（`ls: No such file or directory`）。真实的仓库与发布包位置：

| 项 | 真实位置 |
|---|---|
| 源码仓库 | `/Users/admin/pro-v4/` |
| 发布包目录 | `/Users/admin/pro-v4/发布包/` |
| 已安装 App | `/Applications/DeepSeek Harness.app` |

**处置**：build-release.mjs 已有 fallback（`existsSync("/Volumes/编程工具") ? 官方 : 本地`），
但在**其他机器上**不会自动存在 `/Volumes/编程工具`，务必改用仓库内 `发布包/` 目录。

---

### 🔴 洞 3：新装机器不自动激活 PentAGI 内核（模型不调用 pg_* 工具）

**现象**：新机器装好后，模型不自己调用 `pg_*` 工具，只当普通聊天助手。

**根因**：`DEFAULT_ARMOR_MODE = 'coldbrew'`。新装机器 `desktop-settings.json`
没有 `coldbrew.armorMode` → 回落 `coldbrew` → 新会话注入的是**冷咖啡内核**
（kernel-2.1.0.md，教「破甲越狱」），而不是 **PentAGI 内核**（kernel-pentagi.md，
才有「工具必须是 pg_*」「禁止只把命令写在回复里」的指令）→ 模型不知道有 pg_* 工具。

**因果链**：
```
新安装 → armorMode 未设置 → settingsArmorMode() 返回 'coldbrew'
→ 新会话 fallbackMode='coldbrew' → loadPromptSync(profile,'coldbrew')
→ 注入 coldbrew 内核 → 无 pg_* 工具引导 → 模型不调用
```

**修复（已落地，commit 74e9cb0）**：install-all 完成后自动写
`settings.coldbrew.armorMode='pentagi'` + `defaultEnabled=true`。
**手动补救（已安装机器）**：
```bash
curl -X POST -H "Content-Type: application/json" -d '{"mode":"pentagi"}'   http://127.0.0.1:<gui-port>/api/coldbrew/mode
```

---

### 🟡 洞 3b：调试探针污染生产文件（已清理）

排查时在 app 内 `dsh-manager/lib/index.mjs` 和
`node_modules/@deepseek-ai/dsh-desktop-manager/lib/index.mjs` 注入过
`__probeWrite('/tmp/manager-probe.txt', ...)` 调试探针（try/catch 包裹不致命，
但每次 apply 写文件）。**已全部清理**，恢复为干净修复版。
> 教训：往已安装 App 的 runtime 文件做调试探针后，务必从 release-runtime 干净副本恢复。

---

### 🔴 洞 3：codesign 大文件签名死锁

对 142MB 的嵌入式 `node` 跑 `codesign --force --sign <证书>` 会**挂死**
（0% CPU 等待 keychain 授权，非慢）。9月16 打包时实测两次超时。

**处置（已固化到本次 macOS 产物）**：
- 嵌入式 node 复用**已签名版本**（Sep 6 签过、带 allow-jit entitlements），不要重签；
- 主二进制 + bundle 用 **ad-hoc 签名**（`--sign -`）完成，验证通过；
- 或跑 `scripts/macos-stable-sign.sh` 时确保 keychain 已解锁且 node 已预先签名。

---

### 🟡 洞 4：资源泄漏 — 残留 Kali 沙箱容器

实测 `/opt/homebrew/bin/docker ps` 存在 **7+ 个残留容器**：
`pentagi-terminal-1/4/5/6/9/10` + `dsh-kali-sandbox`（最老已 Up 4 天）。
每个占用数百 MB 内存，长期累积会拖垮机器。

**处置**（清理命令）：
```bash
/opt/homebrew/bin/docker rm -f pentagi-terminal-1 pentagi-terminal-4 pentagi-terminal-5 pentagi-terminal-6 pentagi-terminal-9 pentagi-terminal-10 2>/dev/null
```
> 保留 `dsh-kali-sandbox`（当前会话的持久沙箱）与当前 pentagi 容器。
> sandbox-tmp 下 325 个临时项可定期清理：`rm -rf ~/.dsh/pentagi/sandbox-tmp/*`。

---

### 🟡 洞 5：token 持久化与过期

- token 存在 `~/.dsh/desktop-settings.json` → `coldbrew.pentagi.token`（当前有效，256 字符）。
- 过期/被清后：`pg_status` 的 `tokenPresent` 变 false、GraphQL 返回 401/403。
- **恢复**：`pg_backend_start` 会在 :8443 起来后自动 mint 新 token 并回写；或手动：
  ```bash
  # 后端在跑时自动 mint（或删掉 token 字段后重启 GUI）
  ```
- ⚠️ 另一台机器首次安装：token 为空，需先 `pg_backend_start`（启动 compose + mint token）。

---

### 🟡 洞 6：跨平台构建链 — Windows exe 必须交叉编译

- rustup 已装 `x86_64-pc-windows-gnu` target，mingw 工具链在 `/opt/homebrew/bin/x86_64-w64-mingw32-*`，
  `~/.cargo/config.toml` 已配 linker。
- **Windows portable 不能在本机跑 `build-release.mjs` 一键产出**（脚本 `publishPortable` 只在 win32 宿主运行）。
  手工流程：`cargo build --target x86_64-pc-windows-gnu --release` → 组装
  `exe + WebView2Loader.dll + runtime/node.exe + runtime/harness` → zip + sha256。
- **Node 版本漂移**：旧包嵌 v24.13.0，新包嵌 v26.0.0（随构建宿主 node 变）。README 需同步。

---

### 🟡 洞 7：GUI 重启后插件加载 — file: 挂载路径带空格

GUI 的 overlay（`src-tauri/src/harness.rs`）把 `dsh-desktop-manager` / `dsh-infinite-gen-1`
以 `file:<绝对路径>/lib/index.mjs` 挂载；路径含空格（`DeepSeek Harness.app`）时 loader 可正常解析
（Node ESM 处理 file: URL 的 %20），但 **file: 挂载的插件不参与标准 loader 激活**
（desktop-bridge 只镜像它们的 client bundle）。若 dsh-manager 走 file: 且 inject 缺 webServer
→ client 出现但 host 路由不注册（洞 1 的变体表现）。

**恢复**：重启 GUI 后若某插件面板 404 → 先核对洞 1 的 inject；再核对
`curl :PORT/api/coldbrew/profiles` 是否 JSON。

---

### 🟢 洞 8：其他已知注意点（非故障）

- `vendor/pentagi` 已从仓库删除 → 不影响，pentagi 后端独立在 `~/.dsh/pentagi-src/`（install-all 拉取）。
- `sandbox-work` 保留历史任务产物（fragdb/cursor 等），不影响功能。
- 已安装 App 与 release-runtime 的 `dsh-tui` 均已同步 9月16 修复（12:40 构建）。
- `desktop-settings.json` mtime 12:36 → GUI 正常运行时会写（非只读），手动改前先备份。

---

## 第二部分：其他机器安装手册（全新机器）

### 前置条件
- macOS（arm64 或 x64）或 Windows 10/11 x64；Windows 需 Edge WebView2 Runtime。
- 本机已装：Docker（macOS 用 Colima，Windows 用 Docker Desktop）——install-all 会自动装。

### 安装步骤（macOS）
```bash
# 1. 安装 App（dmg 或 app.zip）
open "/Users/admin/pro-v4/发布包/DeepSeek-Harness-Desktop-1.0.2-macos-arm64.dmg"
# 或解压 app.zip 后拖入 /Applications

# 2. 首次启动 → 设置页开启「启用 Kali 沙箱」「启用 DinD」

# 3. 一键安装全部后端（Docker + compose + embedder + token）
#    在 GUI 设置页点「一键安装全部」或：
curl -X POST -H "Content-Type: application/json" -d '{}' \
  http://127.0.0.1:<port>/api/coldbrew/pentagi/install-all
# 日志与进度：GET /api/coldbrew/pentagi/logs （percent/elapsedSec/etaSec 字段）

# 4. 验证
#    - pg_status：backendReady=true、tokenPresent=true
#    - curl -sk https://127.0.0.1:8443/api/v1/graphql（带 token）应返回 JSON
```

### 安装步骤（Windows）
```bash
# 解压 DeepSeek-Harness-Desktop-1.0.2-windows-x64-portable.zip
# 保持 exe + WebView2Loader.dll + runtime 同目录
# 双击 DeepSeek Harness.exe，后续同 macOS 步骤 2-4
```

### 从源码构建（其他机器，必须注意洞 1）
```bash
cd <repo>
export PATH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime:$HOME/.cargo/bin:$PATH"
# ⚠️ 先修洞 1：确认 desktop-plugins/dsh-manager/src/index.mjs 的 inject 含 webServer
node scripts/build-release.mjs        # macOS：产 dmg + app.zip 到 发布包/
# Windows 交叉编译：
cd src-tauri && cargo build --target x86_64-pc-windows-gnu --release
# 然后手工组装 portable（参考洞 6）
```

---

## 第三部分：故障恢复手册（出问题时照此排查）

### 症状 A：插件面板 / PentAGI / 冷咖啡 全部 404
```
1. curl http://127.0.0.1:<gui-port>/api/coldbrew/profiles
   - 返回 JSON   → 正常，刷新页面
   - 返回 HTML   → 洞 1 复发：检查 inject 是否含 webServer，重启 GUI
2. 若改了源码 → 重新构建 lib 并同步 4 处（app lib / node_modules / release-runtime / src）
```

### 症状 B：pg_status 显示 tokenPresent=false 或 backendReady=false
```
1. curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:8443/api/v1/healthz
   - 非 200 → docker compose up（后端挂了），或 install-all
   - 200    → token 过期，跑 pg_backend_start 重新 mint
```

### 症状 C：Kali 沙箱命令失败 / nmap Operation not permitted
```
pg_terminal 里：
  nmap --unprivileged -PS22 127.0.0.1    # 规避 NET_RAW 限制
  cat /proc/self/status | grep CapEff     # 应含 a00c35fb（NET_RAW）
```

### 症状 D：重启后 PentAGI 后端没起来
```
检查 desktop-settings.json：coldbrew.pentagi.autostart=true（GUI 设置「开机自启」）
或手动 POST /api/coldbrew/pentagi/start
```

### 症状 E：机器卡顿（资源泄漏，洞 4）
```
/opt/homebrew/bin/docker rm -f $(/opt/homebrew/bin/docker ps -aq --filter "name=pentagi-terminal") 2>/dev/null
rm -rf ~/.dsh/pentagi/sandbox-tmp/*
```

### 症状 F：构建时 codesign 卡死（洞 3）
```
pkill -9 -f codesign
# 嵌入式 node 用已签名版本，主二进制/bundle 用 ad-hoc：
codesign --force --sign - --identifier ai.deepseek.harness.desktop \
  --options runtime --timestamp=none --entitlements src-tauri/entitlements.plist \
  "<app>/Contents/MacOS/deepseek-harness-desktop"
codesign --force --sign - --identifier ai.deepseek.harness.desktop \
  --requirements '=designated => identifier "ai.deepseek.harness.desktop"' \
  --options runtime --timestamp=none --entitlements src-tauri/entitlements.plist "<app>"
```

---

## 第四部分：一键健康检查脚本（其他机器照跑）

```bash
#!/usr/bin/env bash
# dsh-healthcheck.sh — 验证 PentAGI 插件全链路
echo "== 1. 进程 =="
ps aux | grep -E "deepseek-harness-desktop|bin.js web" | grep -v grep | wc -l
echo "== 2. 后端 =="
/opt/homebrew/bin/docker ps --format "{{.Names}} {{.Status}}" | grep -E "pentagi|pgvector" || echo "后端未运行"
curl -sk -o /dev/null -w "8443 healthz: %{http_code}\n" https://127.0.0.1:8443/api/v1/healthz
echo "== 3. token =="
python3 -c "import json;d=json.load(open('$HOME/.dsh/desktop-settings.json'));print('token:',('OK' if d.get('coldbrew',{}).get('pentagi',{}).get('token') else 'MISSING'))"
echo "== 4. embedder =="
curl -s -o /dev/null -w "63229: %{http_code}\n" http://127.0.0.1:63229/v1/models
echo "== 5. 插件 API（GUI 端口 61360）=="
curl -s -o /dev/null -w "coldbrew/profiles: %{http_code}\n" http://127.0.0.1:61360/api/coldbrew/profiles
echo "== 6. 残留容器 =="
/opt/homebrew/bin/docker ps --format "{{.Names}}" | grep -c "pentagi-terminal"
```

---

## 项目源码审计补充（2026-09-16 全盘扫）

### 🔴 洞 A：lib/src inject 不同步回归（已修，commit 002d9be）
`74e9cb0`（armorMode 修复）提交时把 `src/index.mjs` + `lib/index.mjs` 的
inject 从 `['webServer', ...]` 改回了旧版 `['loader', ...]` —— 手工同步多处文件时
覆盖丢失。**已重新修复并五处核验一致**。
> 教训：dsh-manager 有 **5 处副本**（src、lib、release-runtime、App desktop-plugins、
> App node_modules），任何改动必须 5 处同步 + git 提交，否则重打包回归。

### 🟡 洞 B：src 比 lib 新（CLI autostart 改进未进 lib）
`src/index.mjs` 有「CLI 无 webServer 不自动拉 compose」改进（`if (hasWeb)`），
`lib/index.mjs` 还是旧逻辑（无条件 autostart）。**不影响 GUI**（GUI 有 webServer），
但 lib 未含该改进，下次 build 才生效。已知，待下次 plugin:build 自动同步。

### 🟡 洞 C：vendor/pentagi 工作区被删空（1452 文件未提交）
`vendor/pentagi/` 整个目录 9月15 被删除且未提交（git 仍 tracked 1452 文件）。
**不影响运行**（pentagiRoot 用 `~/.dsh/pentagi-src`），但仓库 git 状态不干净，
`git status` 大量 D。如需保留 vendored 源码应 `git restore vendor/`；如确定不再
vendor 应 `git rm -r vendor/pentagi` 提交。**二选一，勿留中间态**。

### 🟢 洞 D：其他已核查无碍项
- 无 XSS（client.tsx 无 dangerouslySetInnerHTML/innerHTML）
- 无命令注入（shell:true 仅 pg_terminal 设计行为；git clone URL 白名单）
- 无路径穿越（sessionId/profileId 有校验或仅作 JSON key）
- API 前端/后端路由 100% 对齐，无死按钮
- git 历史无真密钥（仅测试假值）；真实密钥在 ~/.dsh/.credentials.yaml（仓库外）
- tui SIGINT 改动良性（Ctrl+C 取消会话）

### 🟢 洞 E：磁盘数据（项目无关但占空间）
- `~/.dsh/pentagi/sandbox-work` 6.2G（rev 逆向 2.9G + wine 1.1G + lanzou 472M）
- `~/.dsh/dsh-attachments` 1.7G
- `~/.dsh/sessions` 131M（27 个历史会话目录）
