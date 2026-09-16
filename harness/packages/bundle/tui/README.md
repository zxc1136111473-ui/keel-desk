# `@deepseek-ai/dsh-tui`

English | [中文](README.zh.md)

The dsh interactive TUI bundle. [`cordis.patch.yml`](cordis.patch.yml) rides directly over [`dsh-base`](../base/README.md): it supplies the coding persona and tool mode, disables HMR, mounts Code Mode's worker as a core execution capability, and inserts this package's `tui-runner` plugin. It mounts no Host, HTTP server, Web runtime, or browser plugin.

After the Loader settles, the runner reads the shared [`ctx.agentDefaultModel`](../../core/agent-default-model/README.md), creates one persistent Agent through `ctx.agents`, and enters a REPL loop: each non-command line is submitted as a follow-up turn, the agent is awaited to quiescence, the last assistant text is printed, and the session is flushed. `/new` resets to a fresh session identity (losing prior thread context); `/quit`, `/exit`, and stdin EOF request process exit with code 0 through the launcher's `ctx.appExit` host hook ([`dsh-cmdline`](../../boot/cmdline/README.md)).

The session id is stable within a process (`session-<random UUID>`), and `/new` generates a fresh identity. The initial task (`-e/--task`) runs before the first prompt and is only applied to the first session.

## Usage

```sh
dsh                                            # interactive TUI (default)
dsh tui                                        # same as --profile tui
dsh --profile tui                              # interactive session
dsh --profile tui -e "recon the target"        # run one task, then keep the REPL open
dsh --profile tui --session my-session         # pin a stable session id
```

### In-REPL commands

| Command | Action |
|---|---|
| `1` `/model` | Numbered menu of configured providers/models; pick one as the default. |
| `2` `/config` | Print the current default model and provider inventory. |
| `3` `/help` | Reprint the command menu. |
| `4` `/new` | Start a fresh session (new UUID, prior context lost). |
| `5` `/quit` `/exit` | Exit the process with code 0. |
| `12` `/compact` | Manually compact older history. Automatic compaction still runs from `dsh-base` at about 80% of the model window. |

The REPL uses cooked line input (`readline` `terminal: false`) so kernel/IME echo is not doubled on macOS. Command menus are printed in Chinese. Each prompt prints `上下文: used / window · percent` from the `contextPressure` projection once a model reports capacity; before that it prints `上下文: 等待模型上报容量`. `dsh-base` already mounts `token-meter`, `compaction-basic`, and `command-compact`.

## Mounting desktop tools (pg_*, ColdBrew, Reverify)

The base bundle carries the standard harness tool set (bash, fs, web, subagent, goal, todo, ...). For the `pg_*` PentAGI tools, ColdBrew 冷咖啡 profiles, and Reverify, add `@deepseek-ai/dsh-desktop-manager` to the tui profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: desktop-manager
      name: 'file:///path/to/desktop-plugins/dsh-manager/lib/index.mjs'
```

The desktop-manager plugin uses `ctx.get('webServer')` and registers its HTTP management routes only when an HTTP layer is present; in a CLI profile without a Host, it loads cleanly and still registers its tools and system-prompt sections.

## Model Experience

The runner submits user lines as ordinary messages; prompts and tools belong to the base and tui bundle rows, plus any profile-level inserts.

## Known Limitations and Deferred Work

- **No `--resume` across processes** — the session id is per-process only; reloading a prior session from disk would require an explicit persistence-load API integration. `/new` loses thread context. Persistent cross-process session resumption is deferred.
- **`ctx.appExit` is launcher-owned** — booting the tui profile outside the `dsh` launcher fails loud at activation until the host provides the exit request.