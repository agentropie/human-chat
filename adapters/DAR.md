# DAR adapter

Read COMMON.md first. Repos:
- DAR worktree: `/Users/thinh/.worktrees/dar-chat-shape` (branch `chat-shape`). Read its AGENTS.md first and follow it.
- Pi extension: in the core repo, `/Users/thinh/code/agentropy/chat-shape/pi/extension.ts` (new). Commit it in the core repo on `main` (local only).

Design (from a scout, verify each line ref):
- DAR spawns `pi --mode rpc` for chat: `extensions/chat-pi/src/lib.rs` (spawn ~252-300, args ~396-435). When chat-shape is on, add `-e <path to pi/extension.ts>` and set env `CHAT_SHAPE=1` for the child. Resolve the extension path from config key `pi_extension` if set, else `~/code/agentropy/chat-shape/pi/extension.ts`. (This is the one extra config key allowed for DAR.)
- The Pi extension does rules (`before_agent_start` → append system prompt), nudge (user turns only), and the `reply_mode` tool. It never lints. It acts only when `CHAT_SHAPE=1`, and skips when `PI_SUBAGENT_CHILD=1` or `ctx.mode` is print. Pattern: `~/dotagents/settings/pi/extensions/delegation-gate.ts`. Import the core in process (relative import of `../dist/index.js`).
- Hold + lint + rewrite in Rust at the single choke point `crates/cap-chat/src/silence.rs` (`open_guarded`, `GuardedSession`, the `NoReplyFilter` pattern). Buffer deltas until turn finish, then lint, then emit one delta + finish, or send one `[chat-shape]` rewrite turn with `inner.send_turn`.
- Lint from Rust with a subprocess: `node <core>/dist/cli.js lint --json [--mode long --type T --note N]`, reply on stdin. Core path from config key `core` if set, else `~/code/agentropy/chat-shape`. If node or the CLI fails, send the reply unchanged and log a warning (fail open).
- Learn the long-mode declaration from the `reply_mode` tool call event in the chat stream (check that chat-pi forwards tool name and args). If args are not in the stream, use the hidden marker from SPEC section 2 instead, and tell the agent so in the tool description. Report which path you used.
- Skip: runner/cron runs do not use chat-pi (verify). Skip agent senders (sender info in `cap-chat/src/lib.rs` ~546) and the chat-web title session (`chat-web/src/lib.rs` ~1459).
- `/topics`: handle in Rust before the turn goes to Pi, like the `/compact` path (`cap-chat/src/lib.rs` ~24, `chat-pi/src/lib.rs` ~438-452). Call `node <core>/dist/cli.js topics --dir <agent root>/topics`.
- Config: read `extensions.chat-shape` from agent.yaml the way other extension blocks are read. Find where `chat-web` or `scheduler` config is parsed.
- Discord has a 60 s reply timeout. The rewrite must fit in it. Note the risk if not.
- Tests: `cargo test` for the crates you touch, `cargo clippy` clean, `cargo fmt`.
