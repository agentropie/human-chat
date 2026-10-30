import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lint, extractMarker, REASON_TYPES, RULES_TEXT, NUDGE_TEXT } from "../dist/index.js";

const fx = (p: string) => readFileSync(new URL(`../fixtures/${p}`, import.meta.url), "utf8");
const rules = (r: ReturnType<typeof lint>) => r.violations.map((v) => v.rule);
const NOTE = "needs more room here";

for (const n of [1, 2, 3]) {
  test(`fail/connie-${n} fails in short mode`, () => assert.equal(lint(fx(`fail/connie-${n}.md`)).ok, false));
}
for (const n of [1, 6]) {
  test(`drawing/turn-${n} passes in short mode`, () => assert.equal(lint(fx(`drawing/turn-${n}.md`)).ok, true));
}
const longTurns: [number, string][] = [
  [2, "reference"], [3, "several_points_one_topic"], [4, "several_points_one_topic"],
  [5, "several_points_one_topic"], [7, "user_asked"], [8, "steps"],
];
for (const [n, type] of longTurns) {
  test(`drawing/turn-${n} fails short, passes long (${type})`, () => {
    const text = fx(`drawing/turn-${n}.md`);
    assert.equal(lint(text).ok, false);
    assert.equal(lint(text, { mode: { mode: "long", type: type as never, note: NOTE } }).ok, true);
  });
}
test("turn-2 also passes as comparison", () => {
  assert.equal(lint(fx("drawing/turn-2.md"), { mode: { mode: "long", type: "comparison", note: NOTE } }).ok, true);
});

test("sentence splitter edge cases", () => {
  const t = "Use e.g. a tool, i.e. this one, etc. vs. that. Mr. Smith has 1.5 units in campaign-brief.html at yoplai.com v1.2.3. Done!";
  assert.equal(lint(t).stats.sentences, 3);
  assert.equal(lint("One. Two! Three? Four… Five").stats.sentences, 5);
  assert.equal(lint("See `memory.md.` now. Next.").stats.sentences, 2);
  assert.equal(lint("Hello there. Teaser line without end").stats.sentences, 2);
  assert.equal(lint("Here are the rows:\n\n| a | b |\n|---|---|\n| 1 | 2 |").stats.sentences, 1);
});

test("six sentences fail", () => {
  assert.deepEqual(rules(lint("A. B. C. D. E. F.")), ["too_many_sentences"]);
  assert.equal(lint("A. B. C. D. E.").ok, true);
});

test("footer is not counted, may follow a question", () => {
  const r = lint("A. B. C. D. E?\n\nI saved the notes in `memory.md`.");
  assert.equal(r.ok, true);
  assert.equal(r.stats.footer, true);
  assert.equal(r.stats.sentences, 5);
  assert.equal(lint("A. B.\n\nI SAVED it. And more.").stats.footer, false);
});

test("questions", () => {
  assert.deepEqual(rules(lint("Why? Really?")), ["too_many_questions"]);
  assert.deepEqual(rules(lint("Why now? Because.")), ["question_not_last"]);
  assert.equal(lint("Because. Why now?").ok, true);
});

test("structure rules", () => {
  assert.deepEqual(rules(lint("# Title\n\nText.")), ["structure_heading"]);
  assert.deepEqual(rules(lint("Text.\n\n| a | b |\n|---|---|\n| 1 | 2 |")), ["structure_table"]);
  assert.deepEqual(rules(lint("Text:\n\n- one\n- two")), ["structure_list"]);
  assert.deepEqual(rules(lint("Text:\n\n1. one\n2. two")), ["structure_list"]);
  assert.deepEqual(rules(lint("**Label.** Text.")), ["structure_bold_label"]);
  assert.deepEqual(rules(lint("**Label:** Text.")), ["structure_bold_label"]);
  assert.equal(lint("Some **bold** text.").ok, true);
});

test("code blocks are ignored", () => {
  const r = lint("Run this.\n\n```sh\n# not a heading. Nor a sentence. Or? this?\n- not a list\n```\n\nDone.");
  assert.equal(r.ok, true);
  assert.equal(r.stats.sentences, 2);
});

test("marker: valid", () => {
  const r = extractMarker("<!-- reply-mode: long | type: comparison | note: compare brief vs decisions -->\nBody text.");
  assert.deepEqual(r.mode, { mode: "long", type: "comparison", note: "compare brief vs decisions" });
  assert.equal(r.body, "Body text.");
  assert.equal(r.error, undefined);
});

test("marker: bad syntax is short mode plus bad_marker", () => {
  const r = lint("<!-- reply-mode: long type comparison -->\nBody.");
  assert.equal(r.mode.mode, "short");
  assert.deepEqual(rules(r), ["bad_marker"]);
  assert.ok(extractMarker("<!-- reply-mode: long -->\nBody.").error);
  assert.ok(extractMarker("<!-- reply-mode: long | type: steps | note: x").error);
});

test("marker: bad type and empty note", () => {
  assert.deepEqual(rules(lint("<!-- reply-mode: long | type: nope | note: a fine note -->\nA. B. C. D. E. F.")), ["bad_reason_type"]);
  assert.deepEqual(rules(lint("<!-- reply-mode: long | type: steps | note:   -->\nBody.")), ["empty_note"]);
  assert.deepEqual(rules(lint("<!-- reply-mode: long | type: steps | note: two words -->\nBody.")), ["empty_note"]);
});

test("marker: valid marker lifts limits, body is stripped", () => {
  const r = lint("<!-- reply-mode: long | type: steps | note: do the steps now -->\n1. a\n2. b");
  assert.equal(r.ok, true);
  assert.equal(r.hint, "");
  assert.equal(lint("A. B. C. D. E. F.").hint.includes(REASON_TYPES.join(", ")), true);
});

test("text constants", () => {
  assert.ok(RULES_TEXT.startsWith("## Chat replies\n- Reply on one topic"));
  assert.ok(NUDGE_TEXT.startsWith("Reply on one topic, in 1-5 short sentences") && !NUDGE_TEXT.includes("\n"));
});

test("longer fence is not closed by a shorter one", () => {
  const r = lint("Done.\n\n~~~~markdown\n~~~\nA. B. C. D. E. F.\n~~~\n~~~~");
  assert.equal(r.stats.sentences, 1);
  assert.equal(r.ok, true);
});
test("double-backtick code is not prose", () => {
  const r = lint("Use ``a. b. c. d. e. f.`` now.");
  assert.deepEqual([r.stats.sentences, r.stats.words, r.ok], [1, 3, true]);
});
test("?! counts as a question", () => {
  const r = lint("Why?! Because.");
  assert.equal(r.stats.questions, 1);
  assert.deepEqual(rules(r), ["question_not_last"]);
});
test("table without outer pipes is a table", () => {
  assert.deepEqual(rules(lint("Name | Value\n--- | ---\nA | B")), ["structure_table"]);
});
test("underlined heading is a heading", () => {
  assert.deepEqual(rules(lint("Title\n=====\n\nDone.")), ["structure_heading"]);
});
test("empty input fails", () => assert.equal(lint("").ok, false));
test("word count excludes the footer", () => {
  const r = lint("Hello.\n\nI saved the notes.");
  assert.deepEqual([r.stats.footer, r.stats.words], [true, 1]);
});

test("sentence_too_long: a sentence over 30 words fails in short mode", () => {
  const long = Array.from({ length: 31 }, (_, i) => `w${i}`).join(" ") + ".";
  const r = lint(`Short one. ${long}`);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.rule === "sentence_too_long"));
  const ok30 = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ") + ".";
  assert.equal(lint(ok30).ok, true);
});

test("sentence_too_long: long mode lifts the limit", () => {
  const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ") + ".";
  assert.equal(lint(long, { mode: { mode: "long", type: "user_asked", note: "the user asked" } }).ok, true);
});

test("limits: leeway tolerates sentences and words over the max", () => {
  const six = "One. Two. Three. Four. Five. Six.";
  assert.equal(lint(six).ok, false);
  assert.equal(lint(six, { limits: { sentenceLeeway: 1 } }).ok, true);
  assert.equal(lint(six, { limits: { maxSentences: 6 } }).ok, true);
  const s28 = Array.from({ length: 28 }, (_, i) => `w${i}`).join(" ") + ".";
  assert.equal(lint(s28).ok, true); // default 25 + 5 leeway
  assert.equal(lint(s28, { limits: { wordLeeway: 0 } }).ok, false);
  assert.equal(lint(s28, { limits: { maxSentenceWords: 20, wordLeeway: 8 } }).ok, true);
});

test("limits: rules and nudge text show the max", async () => {
  const { rulesText, nudgeText } = await import("../dist/index.js");
  assert.ok(rulesText({ maxSentences: 3, maxSentenceWords: 18 }).includes("in 1-3 sentences") );
  assert.ok(rulesText({ maxSentenceWords: 18 }).includes("18 words or fewer"));
  assert.ok(nudgeText({ maxSentences: 3 }).includes("in 1-3 short sentences"));
  assert.ok(!RULES_TEXT.includes("{"));
});
