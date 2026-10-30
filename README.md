# human-chat

Makes agents reply like people in chat: one topic per turn, 1-5 sentences, at most one question. The agent keeps the full answer in a topic plan and gives it over many short turns.

This repo is the shared core. Each agent host (DAR, Yoplai) has an adapter that calls it. Full contract: [SPEC.md](SPEC.md). Adapter contract: [adapters/COMMON.md](adapters/COMMON.md).

## Install

```sh
npm install
npm run build   # writes dist/
npm test
```

Node 22 or later. No runtime dependencies.

## Reply rules

- Short mode (default): 1-5 sentences of 30 words or fewer, max one question at the end, no headings, tables, lists, or bold labels. Code blocks do not count. A last one-line footer about background work ("I saved X in `memory.md`.") does not count.
- Long mode: the agent declares it before the reply, with a reason type and a short note. Types: `user_asked`, `comparison`, `several_points_one_topic`, `steps`, `reference`. Long mode lifts the sentence, question, and structure limits.

The agent declares long mode with the `reply_mode` tool (`{ mode: "long", type, note }`), or with a hidden marker at the start of the reply:

```
<!-- reply-mode: long | type: comparison | note: compare brief vs decisions -->
```

The rules text for AGENTS.md is in `rules/chat-replies.md`. The one-line nudge for each user turn is in `rules/nudge.txt`.

## CLI

```sh
human-chat lint [FILE] [--json]                                  # stdin if no FILE. Exit 0 pass, 1 fail, 2 usage
human-chat lint FILE --mode long --type steps --note "install steps" --log long-mode.jsonl
human-chat rules                                                 # print the rules text
human-chat nudge                                                 # print the nudge
human-chat topics FILE                                           # open topics of one plan, current first
human-chat topics --dir topics/ [--days 7]                       # plans with open topics
```

`--log` appends one JSONL line for a long-mode reply that passes: `{ ts, agent, session, type, note, words }`. It never logs the reply text.

## Library

```ts
import { lint, extractMarker, RULES_TEXT, NUDGE_TEXT, REASON_TYPES, parsePlan, openTopics, listOpenPlans } from "human-chat";

const r = lint(replyText, { mode: { mode: "long", type: "steps", note: "install steps" } });
// r.ok, r.violations, r.hint (feed back to the agent on failure), r.stats
```

## Topic plan

One markdown file per session, in `<agent workspace>/topics/`. Status marks: `[ ]` open, `[x]` resolved, `[-]` parked. The first open topic is the current topic.

```markdown
---
title: Short-turn chat delivery
session: <session id>
updated: 2026-10-30T10:15:00Z
---

## [ ] Topic title
Full prepared content.

## [x] Resolved topic
Decision: ...
```

## Adapters

| Host | Where | Switch |
|---|---|---|
| DAR | `crates/cap-chat/src/shape.rs` + `pi/extension.ts` (this repo) | `extensions.human-chat: {}` in `agent.yaml` |
| Yoplai | `apps/gateway/src/human-chat/` | `extensions.human-chat: {}` in `agent.yaml` |

When the switch is on, the adapter adds the rules to the system prompt, adds the nudge to each human turn, gives the agent the `reply_mode` tool, and holds the reply until the turn ends. It lints the full reply. On a failure, it asks the agent for one hidden rewrite and sends the rewrite. Live streaming stops for these turns. Scheduled jobs, sub-agents, and agent-to-agent turns are not shaped. A user message that is exactly `/topics` lists the open topics with no model call.

When the switch is off, the host behaves exactly as before.

Yoplai uses a pnpm `file:` dependency, and pnpm copies the package. After a change here, run `npm run build`, then `pnpm install --force` in the Yoplai checkout, and restart the gateway. DAR reads `dist/` and `rules/` from this folder directly.

`pi/extension.ts` is a Pi extension for DAR. It acts only on prompts that DAR marks as human turns.
