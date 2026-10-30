# Yoplai adapter

Read COMMON.md first. Worktree: `/Users/thinh/.worktrees/yoplai-human-chat` (branch `human-chat`, repo `~/code/algodyn/yoplai/platform`). Read its AGENTS.md / CLAUDE.md first and follow it. pnpm, vitest (`pnpm test:gateway`, single file `pnpm exec vitest run <file>`).

Design (from a scout, verify each line ref):
- Dependency: add `human-chat` as `"file:/Users/thinh/code/agentropy/human-chat"` in `apps/gateway/package.json` for now (local only; a git URL replaces it later). Import in process.
- Extension: a core factory extension `human-chat` like `session-history/index.ts`, registered in `apps/gateway/src/extensions/registry.ts` (~451-454). It owns the `reply_mode` tool and `getSystemPromptContributions` (rules). Enabled only when `extensions.human-chat` is in agent.yaml (core extensions may default on: make sure this one defaults OFF).
- The hook context lacks the run source. Add `source`, `sender`, `background` to `RunIdentity` / `buildHookContext` (`extensions/runtime.ts` ~18, ~38) only as far as needed.
- Nudge: host Pi `sdk/pi/adapter.ts` ~707 (model only, not history). Sandbox: `sdk/container/input-builder.ts` ~82. Do not change `params.message` before `beginUserTurn` (`runner.ts` ~426).
- Hold + lint + rewrite: core `apps/gateway/src/agents/runner.ts`, between the `isNoReply` check (~519) and the flush (~524). Streaming path: `adapter.ts` text_delta → `runner.ts` holdback.push (~470) → `run-lifecycle.ts` emit. When on, do not emit deltas for the turn. Prefer a small generic `beforeDeliver`-style hook only if it stays small, else keep the logic in one helper module called from runner.ts. Lint the joined text of all segments the user would receive.
- Rewrite: test whether `queueMessage` on the live handle (`adapter.ts` ~1034) or a second `adapter.run` keeps history cleaner. Use the cleaner one and report why.
- Human sources allowlist: `web`, `telegram`, `discord`, `slack`, `mattermost`, `irc`. Skip: no source, `scheduler`, `heartbeat`, `webhook`, `threadit`, `dream`, `sender.kind === "agent"`, `background: true`, session ids that start with `compact:`. Do not use `sessionIdIsInteractive`.
- `/topics`: early return in `runAgent` like `/abort` (~132) or `/think` (~274). Workspace via `resolveWorkspaceDir(agent.workspace)`.
- Per-turn state (declaration, rewrite count) clears on abort and on queued turns (~590).
- Tests: vitest next to the code you touch, plus `pnpm test:gateway` and the repo typecheck/lint commands green.
