import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePlan, openTopics, listOpenPlans } from "../dist/index.js";

const sample = `---
title: Short-turn chat delivery
session: abc
updated: 2026-10-30T10:15:00Z
---

## [x] Done one
Decision: yes.

## [ ] Current one
Full content.

More.

## [-] Parked one
later

## [ ] Next one
text
`;

test("parsePlan reads frontmatter and topics", () => {
  const p = parsePlan(sample);
  assert.equal(p.title, "Short-turn chat delivery");
  assert.equal(p.session, "abc");
  assert.equal(p.updated, "2026-10-30T10:15:00Z");
  assert.deepEqual(p.topics.map((t) => t.status), ["resolved", "open", "parked", "open"]);
  assert.equal(p.topics[1].body, "Full content.\n\nMore.");
});

test("current topic is the first open one", () => {
  assert.deepEqual(openTopics(parsePlan(sample)).map((t) => t.title), ["Current one", "Next one"]);
});

test("missing frontmatter uses fallback title", () => {
  assert.equal(parsePlan("## [ ] A\nx", "my-file").title, "my-file");
});

test("listOpenPlans: recent only, open only, newest first", () => {
  const dir = mkdtempSync(join(tmpdir(), "plans-"));
  const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  const plan = (title: string, updated: string, mark = " ") => `---\ntitle: ${title}\nupdated: ${updated}\n---\n## [${mark}] T ${title}\n`;
  writeFileSync(join(dir, "old.md"), plan("old", day(30)));
  writeFileSync(join(dir, "recent.md"), plan("recent", day(1)));
  writeFileSync(join(dir, "newer.md"), plan("newer", day(0)));
  writeFileSync(join(dir, "closed.md"), plan("closed", day(1), "x"));
  writeFileSync(join(dir, "nofm.md"), "## [ ] Loose\n");
  utimesSync(join(dir, "nofm.md"), new Date(Date.now() - 40 * 86400000), new Date(Date.now() - 40 * 86400000));
  const res = listOpenPlans(dir, 7);
  assert.deepEqual(res.map((r) => r.title), ["newer", "recent"]);
  assert.deepEqual(res[0].open, ["T newer"]);
  assert.equal(res[0].file, join(dir, "newer.md"));
});
