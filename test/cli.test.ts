import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = new URL("../dist/cli.js", import.meta.url).pathname;
const run = (args: string[], input = "") => spawnSync("node", [cli, ...args], { input, encoding: "utf8" });
const dir = mkdtempSync(join(tmpdir(), "cli-"));
const longText = "1. a\n2. b\n";

test("exit 0 on pass, 1 on fail, 2 on usage error", () => {
  assert.equal(run(["lint"], "Short reply.").status, 0);
  assert.match(run(["lint"], "Short reply.").stdout, /^PASS/);
  const f = run(["lint"], "A. B. C. D. E. F.");
  assert.equal(f.status, 1);
  assert.match(f.stdout, /^FAIL[\s\S]*too_many_sentences/);
  assert.equal(run(["lint", "--bogus"]).status, 2);
  assert.equal(run(["lint", "--mode", "long"], "x").status, 2);
  assert.equal(run(["nope"]).status, 2);
  assert.equal(run(["lint", join(dir, "missing.md")]).status, 2);
});

test("--json output shape", () => {
  const r = run(["lint", "--json"], "Hi. Ok?");
  const j = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(j).sort(), ["hint", "mode", "ok", "stats", "violations"]);
  assert.deepEqual(j.stats, { sentences: 2, questions: 1, words: 2, footer: false });
  assert.deepEqual(j.mode, { mode: "short" });
});

test("--log appends one line in long mode only", () => {
  const log = join(dir, "log.jsonl");
  const args = ["lint", "--mode", "long", "--type", "steps", "--note", "do these steps", "--log", log, "--agent", "a1", "--session", "s1"];
  assert.equal(run(args, longText).status, 0);
  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const e = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(e), ["ts", "agent", "session", "type", "note", "words"]);
  assert.equal(e.type, "steps");
  assert.ok(!lines[0].includes("1. a"));
  const shortLog = join(dir, "short.jsonl");
  assert.equal(run(["lint", "--log", shortLog], "Fine.").status, 0);
  assert.equal(existsSync(shortLog), false);
  const failLog = join(dir, "fail.jsonl");
  run(["lint", "--mode", "long", "--type", "bad", "--note", "do these steps", "--log", failLog], "x");
  assert.equal(existsSync(failLog), false);
});

test("rules, nudge, topics", () => {
  assert.match(run(["rules"]).stdout, /^## Chat replies/);
  assert.match(run(["nudge"]).stdout, /^Reply on one topic/);
  const f = join(dir, "plan.md");
  writeFileSync(f, "## [x] Done\n## [ ] First\n## [ ] Second\n");
  assert.equal(run(["topics", f]).stdout, "> First\n  Second\n");
  const out = run(["topics", "--dir", dir, "--days", "7"]).stdout;
  assert.match(out, /^plan \(2 open\): .*plan\.md$/m);
});
