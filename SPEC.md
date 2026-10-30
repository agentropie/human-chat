# human-chat — spec v1 (core package)

Goal: agents reply to a human in short, one-topic turns. They keep the full answer in a topic plan and give it one topic at a time. This package is the shared core. Adapters in Yoplai, DAR, Pi, Claude Code, and Codex use it. Adapters are out of scope here.

## Tech

- TypeScript, Node >= 22, ESM. No runtime dependencies. Dev dependency: `typescript` only.
- Build with `tsc` to `dist/`. Tests with `node --test` on the built files (or `node --test` with type stripping on `test/*.test.ts`, your choice, but `npm test` must build and run all tests).
- `package.json`: `name: "human-chat"`, `type: "module"`, `exports` for the library, `bin: { "human-chat": "dist/cli.js" }`.
- Keep it small. No abstractions beyond what this spec needs.

## 1. Reply contract

Two modes.

**Short mode (default, no declaration):**
- 1-5 sentences of prose.
- Max one question. If there is a question, it is the last sentence.
- No structure: no markdown headings, no tables, no list items, no paragraph that starts with a bold label (`**Label.**` or `**Label:**`).
- Fenced code blocks are allowed. They do not count as sentences or structure.
- Inline code (`` `memory.md` ``) counts as one word, never as a sentence end.
- An optional footer about background work is allowed and is not counted: the last paragraph, one sentence, that starts with `I saved`, `I updated`, `I changed`, `I created`, `I wrote`, `I added`, `I noted`, or `I stored` (case-insensitive). It may come after the question.

**Long mode (declared):**
- The agent declares it with a reason `type` from a fixed list, plus a short free-text `note` for the log.
- Long mode lifts the sentence, question, and structure limits. The only checks: `type` is in the list, and `note` is not empty (trimmed, at least 3 words).
- Reason types (export as a const array and a TS union):
  - `user_asked`: the user asked for detail, a report, a list, or "everything".
  - `comparison`: a table or side-by-side comparison.
  - `several_points_one_topic`: several points on the same single topic.
  - `steps`: ordered steps the user must follow.
  - `reference`: data the user needs as is (a list of decisions, facts, values).

## 2. Long mode declaration

Two forms. Adapters translate both into the same `ReplyMode` value.

- Tool call (adapters that support tools): `reply_mode({ mode: "long", type, note })`. The adapter passes it to `lint()` as an option.
- Hidden marker (adapters without tools): an HTML comment at the start of the reply:
  `<!-- reply-mode: long | type: comparison | note: compare brief vs decisions -->`
  `extractMarker(text)` parses it and returns the reply body without the marker. Adapters send the body without the marker to the user. Bad marker syntax = no marker (short mode) plus a violation `bad_marker` with detail.

## 3. Library API

```ts
export const REASON_TYPES: readonly ["user_asked","comparison","several_points_one_topic","steps","reference"];
export type ReasonType = typeof REASON_TYPES[number];
export type ReplyMode = { mode: "short" } | { mode: "long"; type: ReasonType; note: string };

export interface Violation { rule: string; detail: string }
export interface LintResult {
  ok: boolean;
  mode: ReplyMode;
  violations: Violation[];
  hint: string;            // empty when ok
  stats: { sentences: number; questions: number; words: number; footer: boolean };
}

export function extractMarker(text: string): { mode: ReplyMode | null; body: string; error?: string };
export function lint(text: string, opts?: { mode?: ReplyMode }): LintResult;
// If opts.mode is absent, lint() calls extractMarker() first. If no marker, short mode.

export const RULES_TEXT: string;   // the AGENTS.md block, verbatim from rules/chat-replies.md
export const NUDGE_TEXT: string;   // one line, verbatim from rules/nudge.txt

export function parsePlan(markdown: string): Plan;
export function openTopics(plan: Plan): Topic[];
export function listOpenPlans(dir: string, days: number): { file: string; title: string; open: string[] }[];
```

Rule ids for violations: `too_many_sentences`, `sentence_too_long` (short mode, more than 30 words in one sentence), `too_many_questions`, `question_not_last`, `structure_heading`, `structure_table`, `structure_list`, `structure_bold_label`, `bad_marker`, `bad_reason_type`, `empty_note`.

`hint` (on failure) is one short paragraph the adapter can feed back to the agent, for example:
"Your reply breaks the short reply rules: <violations>. Keep one topic in 1-5 sentences with at most one question, at the end. Keep the rest in the topic plan. If this reply really needs more room, declare long mode with a type from: user_asked, comparison, several_points_one_topic, steps, reference, and a short note."

### Sentence counting

- Remove fenced code blocks. Replace inline code spans with a single token.
- Ignore table rows and list items for the prose count (they are structure violations in short mode).
- Split on `.`, `!`, `?` (and `…`) followed by whitespace or end of text. Also count a final paragraph with no end punctuation as one sentence (a teaser line such as "There's a pending issue about consent though").
- Do not split on: `e.g.`, `i.e.`, `etc.`, `vs.`, `Mr.`, `Dr.`, decimals (`1.5`), file names and URLs (`campaign-brief.html`, `yoplai.com`), version numbers.
- A line ending with `:` that introduces a table or list is part of the next sentence count only once (count it as one sentence).
- Count words with a simple whitespace split on the prose.

## 4. Rules text (verbatim)

`rules/chat-replies.md`: see the file (the source of truth). It holds the reply rules and a "Topic plan" section with the path and format of the plan file (section 5), so agents write the plan where `/topics` can read it.

`rules/nudge.txt`:

```
Reply on one topic, in 1-5 sentences, with one question at most. Keep the rest in the topic plan. For more room, declare long mode with a reason type.
```

## 5. Topic plan format

One file per session, in the agent workspace, for example `topics/2026-10-30-chat-delivery.md`. The agent writes it with its normal file tools.

```
---
title: Short-turn chat delivery
session: <session id>
updated: 2026-10-30T10:15:00Z
---

## [ ] Topic title
Full prepared content for this topic.

## [x] Resolved topic title
Decision: ...

## [-] Parked topic title
...
```

- `[ ]` open, `[x]` resolved, `[-]` parked. The first `[ ]` topic is the current topic.
- `parsePlan` reads frontmatter (title, session, updated) and topics (status, title, body). Tolerate missing frontmatter (title = file name).
- `listOpenPlans(dir, days)`: plans in `dir` with at least one `[ ]` topic and `updated` (or file mtime if missing) within the last `days` days, newest first.

## 6. CLI

```
human-chat lint [FILE]            # reads FILE or stdin
    [--mode long --type <type> --note <text>]
    [--log <path.jsonl>] [--agent <id>] [--session <id>]
    [--json]
human-chat rules                  # print RULES_TEXT
human-chat nudge                  # print NUDGE_TEXT
human-chat topics FILE            # open topics of one plan, one line each, current first, marked "> "
human-chat topics --dir DIR [--days 7]   # plans with open topics: "<title> (<n> open): <file>"
```

- `lint` exit code: 0 pass, 1 fail, 2 usage error. Default output: human text (PASS/FAIL, violations, hint). `--json`: the `LintResult` as JSON.
- `--log`: when the reply passes in long mode, append one JSONL line: `{ ts, agent, session, type, note, words }`. Create the file if missing. Never log reply text.

## 7. Tests (must pass)

Fixtures are in `fixtures/`. Do not edit them.

- `fixtures/fail/connie-1.md`, `connie-2.md`, `connie-3.md`: fail in short mode.
- `fixtures/drawing/turn-1.md`, `turn-6.md`: pass in short mode.
- `fixtures/drawing/turn-2.md` (`reference` or `comparison`), `turn-3.md` (`several_points_one_topic`), `turn-4.md` (`several_points_one_topic`), `turn-5.md` (`several_points_one_topic`), `turn-7.md` (`user_asked`), `turn-8.md` (`steps`): fail in short mode, pass in long mode with that type and a note.
- Unit tests: sentence splitter edge cases from section 3, footer handling, question-not-last, each structure rule, code blocks ignored, marker parse (valid, bad syntax, bad type, empty note), `extractMarker` strips the marker from the body.
- Topic plan: parse a sample plan, current topic = first `[ ]`, `listOpenPlans` with a temp dir and two files (one old, one recent).
- CLI: exit codes 0/1/2, `--json` output shape, `--log` appends one line in long mode only.

## Out of scope (v1)

Adapters, the `/topics` command wiring, any model call, any network access, npm publish, GitHub remote.
