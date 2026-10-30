#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { lint, nudgeText, rulesText, type Limits, type ReasonType, type ReplyMode } from "./lint.js";
import { listOpenPlans, openTopics, parsePlan } from "./plan.js";

class Usage extends Error {}

function parseArgs(argv: string[], valued: string[], flags: string[]) {
  const opts: Record<string, string | boolean> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) pos.push(a);
    else if (flags.includes(a.slice(2))) opts[a.slice(2)] = true;
    else if (valued.includes(a.slice(2))) {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Usage(`${a} needs a value`);
      opts[a.slice(2)] = argv[++i];
    } else throw new Usage(`unknown option ${a}`);
  }
  return { opts, pos };
}

const LIMIT_FLAGS: Record<string, keyof Limits> = {
  "max-sentences": "maxSentences",
  "sentence-leeway": "sentenceLeeway",
  "max-sentence-words": "maxSentenceWords",
  "word-leeway": "wordLeeway",
};

function readLimits(opts: Record<string, string | boolean>): Partial<Limits> {
  const out: Partial<Limits> = {};
  for (const [flag, key] of Object.entries(LIMIT_FLAGS)) {
    if (opts[flag] === undefined) continue;
    const n = Number(opts[flag]);
    if (!Number.isInteger(n) || n < 0) throw new Usage(`--${flag} must be a whole number`);
    out[key] = n;
  }
  return out;
}

function runLint(args: string[]): number {
  const { opts, pos } = parseArgs(args, ["mode", "type", "note", "log", "agent", "session", ...Object.keys(LIMIT_FLAGS)], ["json"]);
  if (pos.length > 1) throw new Usage("lint takes at most one FILE");
  let mode: ReplyMode | undefined;
  if (opts.mode === "short") mode = { mode: "short" };
  else if (opts.mode === "long") {
    if (typeof opts.type !== "string" || typeof opts.note !== "string") throw new Usage("--mode long needs --type and --note");
    mode = { mode: "long", type: opts.type as ReasonType, note: opts.note };
  } else if (opts.mode !== undefined) throw new Usage("--mode must be short or long");

  const text = readFileSync(pos[0] ?? 0, "utf8");
  const res = lint(text, { mode, limits: readLimits(opts) });
  if (res.ok && res.mode.mode === "long" && typeof opts.log === "string") {
    const line = { ts: new Date().toISOString(), agent: opts.agent ?? null, session: opts.session ?? null, type: res.mode.type, note: res.mode.note, words: res.stats.words };
    appendFileSync(opts.log, JSON.stringify(line) + "\n");
  }
  if (opts.json) process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  else {
    const lines = [res.ok ? "PASS" : "FAIL", ...res.violations.map((v) => `- ${v.rule}: ${v.detail}`)];
    if (res.hint) lines.push("", res.hint);
    process.stdout.write(lines.join("\n") + "\n");
  }
  return res.ok ? 0 : 1;
}

function runTopics(args: string[]): number {
  const { opts, pos } = parseArgs(args, ["dir", "days"], []);
  if (typeof opts.dir === "string") {
    const days = opts.days === undefined ? 7 : Number(opts.days);
    if (!(days >= 0)) throw new Usage("--days must be a number");
    for (const p of listOpenPlans(opts.dir, days)) process.stdout.write(`${p.title} (${p.open.length} open): ${p.file}\n`);
    return 0;
  }
  if (pos.length !== 1) throw new Usage("topics needs FILE or --dir DIR");
  const plan = parsePlan(readFileSync(pos[0], "utf8"), basename(pos[0]).replace(/\.md$/, ""));
  openTopics(plan).forEach((t, i) => process.stdout.write(`${i === 0 ? "> " : "  "}${t.title}\n`));
  return 0;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === "lint") return runLint(rest);
    if (cmd === "topics") return runTopics(rest);
    if (cmd === "rules" || cmd === "nudge") {
      const { opts } = parseArgs(rest, Object.keys(LIMIT_FLAGS), []);
      const limits = readLimits(opts);
      process.stdout.write((cmd === "rules" ? rulesText(limits) : nudgeText(limits)) + "\n");
      return 0;
    }
    throw new Usage("usage: human-chat lint|rules|nudge|topics");
  } catch (e) {
    if (e instanceof Usage) { process.stderr.write(`${e.message}\n`); return 2; }
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
