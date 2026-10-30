# Adapter contract (DAR and Yoplai)

Core: `/Users/thinh/code/agentropy/human-chat` (read SPEC.md). Do not change the core API. If the core needs a change, stop and report it.

## Switch
- The adapter is off unless `agent.yaml` has `extensions.human-chat` (an empty block `human-chat: {}` or `human-chat:` turns it on, `enabled: false` turns it off).
- Off = zero change in behavior. Streaming, prompts, tools, and commands stay exactly as today. Add a test for this.
- Optional key: `log` (path for the long-mode JSONL log). Default: `<agent root>/data/human-chat/long-mode.jsonl`. No other config keys.

## When on, for interactive human turns only
1. Rules: append `RULES_TEXT` to the system prompt (survives compaction).
2. Nudge: add `NUDGE_TEXT` to each user turn that goes to the model. Do not store it in the visible chat history if the host can avoid it.
3. `reply_mode` tool: `{ mode: "long", type: <one of REASON_TYPES>, note: string }`. It records the declaration for the current turn only and returns "Long mode on for this reply." Bad input returns an error that lists the valid types.
4. Hold: do not stream text deltas of the turn to any channel. Keep the typing indicator. At turn end, lint the full text the user would receive (all text segments of the turn, joined as the channel shows them), with the declared mode if any.
5. Pass: send the reply. If long mode, append the log line (`{ ts, agent, session, type, note, words }`, never the reply text).
6. Fail: send the core `hint` to the agent as one follow-up turn, prefixed `[human-chat] `. The user does not see the failed draft or the hint. Hold and lint the rewrite. Send the rewrite even if it fails again, and log `{ ts, agent, session, event: "rewrite_failed", rules: [...] }` to the same log. Max one rewrite for each user turn.
7. `/topics`: a user message that is exactly `/topics` returns the open topics of plans in `<agent workspace>/topics/` (core `listOpenPlans(dir, 7)` and `openTopics`), with no model call. Format: one line for each plan, then its open topics, current first marked "> ". If none: "No open topics."
8. Abort, errors, NO_REPLY / silence handling: keep the existing behavior. A NO_REPLY reply is never linted.

## Skip (adapter acts as off for the turn)
Scheduler/cron jobs, heartbeats, webhooks, sub-agents, one-shot print or CLI sends, agent-to-agent messages (sender is an agent or bot), compaction and title-generation runs, and any run with no known human source. Use an allowlist of human sources, not a denylist.

## Done means
- Existing test suites pass. New tests cover: switch off = streaming unchanged, switch on = no deltas before turn end, pass, fail + one rewrite, long mode via tool, log line, skip for a scheduled run and an agent sender, `/topics`.
- One manual end-to-end check described in your report (command + observed output).
- Commit on the feature branch in the worktree. No push, no PR, no remote, no deploy, no restart of any running agent or gateway.
