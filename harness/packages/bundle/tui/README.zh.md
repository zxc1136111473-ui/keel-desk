# `@deepseek-ai/dsh-tui`

English | [中文](README.zh.md)

dsh 交互式 TUI bundle。[`cordis.patch.yml`](cordis.patch.yml) 直接叠加在 [`dsh-base`](../base/README.md) 之上：它提供编码人格和工具模式，禁用 HMR，将 Code Mode 的 worker 作为核心执行能力挂载，并插入本包的 `tui-runner` 插件。不挂载 Host、HTTP 服务、Web 运行时或浏览器插件。

Loader 就绪后，runner 读取共享的 [`ctx.agentDefaultModel`](../../core/agent-default-model/README.md)，通过 `ctx.agents` 创建一个持久的 Agent，然后进入 REPL 循环：每条非命令行提交为一个 follow-up turn，等待 agent 空闲后打印最后的 assistant 文本并 flush session。`/new` 重置会话身份（丢失先前的对话上下文）；`/quit`、`/exit` 和 stdin EOF 通过 launcher 提供的 `ctx.appExit` 请求退出（exit code 0）。

## 用法

```sh
dsh --profile tui                              # 启动交互会话
dsh --profile tui -e "recon the target"        # 立即执行一条任务，然后保持 REPL
dsh --profile tui --session my-session         # 指定稳定的会话 id
```

### REPL 内置命令

| 命令 | 动作 |
|---|---|
| `/quit` `/exit` | 退出进程（exit code 0）。 |
| `/new` | 开启新会话（新 UUID，先前上下文丢失）。 |
| `/help` | 显示可用命令。 |
| `12` `/compact` | 手动压缩较早历史。`dsh-base` 仍会在大约窗口 80% 时自动压缩。 |

## 挂载桌面工具（pg_*、ColdBrew、Reverify）

base bundle 提供标准 harness 工具集（bash、fs、web、subagent、goal、todo ...）。如需 `pg_*` PentAGI 工具、ColdBrew 冷咖啡 profiles 和 Reverify，可在 tui profile 的 `cordis.patch.yml` 中添加 `@deepseek-ai/dsh-desktop-manager`：

```yaml
- insert:
    - id: desktop-manager
      name: 'file:///path/to/desktop-plugins/dsh-manager/lib/index.mjs'
```

desktop-manager 插件使用 `ctx.get('webServer')`，仅在存在 HTTP 层时注册管理路由；在没有 Host 的 CLI profile 中可以正常加载，并仍注册其工具和 system-prompt section。

每次提示符前打印 `上下文: 已用 / 窗口 · 百分比`，数据来自 `contextPressure` 投影；模型还没上报容量时显示 `上下文: 等待模型上报容量`。`dsh-base` 已挂载 `token-meter`、`compaction-basic` 和 `command-compact`。

## 已知限制与待办

- **不支持跨进程 `--resume`** — session id 仅在进程内持久；从磁盘恢复先前 session 需要额外的 persistence-load API 集成。`/new` 会丢失对话上下文。跨进程持久会话恢复延后。
- **`ctx.appExit` 由 launcher 持有** — 在 `dsh` launcher 之外启动 tui profile 会立即报错，直到 host 提供退出请求。