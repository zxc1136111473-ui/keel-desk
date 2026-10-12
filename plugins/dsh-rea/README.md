# dsh-rea

DeepSeek Harness plugin that mounts the [REA](https://github.com/morluto/rea)
reverse-engineering MCP server through `@deepseek-ai/dsh-mcp-client`. The model
gains the complete REA tool catalog as native tools named
`mcp__rea__<name>` — 170+ tools covering native analysis (Ghidra/Hopper/IDA
providers), JavaScript/Electron recovery, .NET managed inspection, Go binaries,
Android/ADB, firmware, EVM, web captures, and the shared evidence/session
workflows.

## How it works

- **Host half** (`src/index.mjs`) resolves the vendored REA runtime and mounts
  `@deepseek-ai/dsh-mcp-client` with a `stdio` transport:
  `node <runtime>/node_modules/rea-agents/scripts/rea.mjs mcp`.
- **Runtime** (`lib/rea-runtime/`) is created by `scripts/build.mjs`, which runs
  `npm install rea-agents@<version>` (default `6.4.0`) into `lib/rea-runtime`
  and keeps only the `node_modules` tree. It is not committed (see
  `.gitignore`) and is re-vendored automatically whenever it is missing.
- Tool calls default to a 300 s timeout; REA analysis jobs on real binaries can
  legitimately take minutes. Reconnect and other MCP client behaviour follow
  `@deepseek-ai/dsh-mcp-client` defaults.

## Build

```bash
cd plugins/dsh-rea
pnpm run build   # or: node scripts/build.mjs
```

Set `REA_VERSION=...` to pin a different REA release.

## Test

```bash
pnpm run test
```

Requires a successful build first (tests assert the vendored runtime exists and
that `rea mcp` boots on stdio).

## Layout

```
src/index.mjs          Host cordis plugin (entry)
scripts/build.mjs      Build + runtime vendoring
cordis.patch.yml       Loader bundle patch
test/rea.test.mjs      Build/runtime smoke tests
lib/index.mjs          Built Host entry
lib/rea-runtime/       Vendored REA runtime (generated, not committed)
```
