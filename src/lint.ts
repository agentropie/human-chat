import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REASON_TYPES = ["user_asked", "comparison", "several_points_one_topic", "steps", "reference"] as const;
export type ReasonType = (typeof REASON_TYPES)[number];
export type ReplyMode = { mode: "short" } | { mode: "long"; type: ReasonType; note: string };

export interface Violation { rule: string; detail: string }
export interface LintResult {
  ok: boolean;
  mode: ReplyMode;
  violations: Violation[];
  hint: string;
  stats: { sentences: number; questions: number; words: number; footer: boolean };
}

const rulesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "rules");
export const RULES_TEXT: string = readFileSync(join(rulesDir, "chat-replies.md"), "utf8").trimEnd();
export const NUDGE_TEXT: string = readFileSync(join(rulesDir, "nudge.txt"), "utf8").trimEnd();

// Marker: <!-- reply-mode: long | type: comparison | note: some words -->
// Syntax only. The type and note are validated by lint(), so an unknown type
// comes back as is and lint() reports `bad_reason_type`.
export function extractMarker(text: string): { mode: ReplyMode | null; body: string; error?: string } {
  const start = text.match(/^\s*<!--\s*reply-mode\b/i);
  if (!start) return { mode: null, body: text };
  const end = text.indexOf("-->", start[0].length);
  if (end < 0) return { mode: null, body: text, error: "marker is not closed with -->" };
  const inner = text.slice(start[0].length, end);
  const body = text.slice(end + 3).replace(/^\s+/, "");
  if (/^\s*:\s*short\s*$/i.test(inner)) return { mode: { mode: "short" }, body };
  const m = inner.match(/^\s*:\s*long\s*\|\s*type\s*:\s*([^|]*?)\s*\|\s*note\s*:\s*([\s\S]*?)\s*$/i);
  if (!m) return { mode: null, body, error: "expected: reply-mode: long | type: <type> | note: <text>" };
  return { mode: { mode: "long", type: m[1] as ReasonType, note: m[2] }, body };
}

const ABBREV = new Set(["e.g.", "i.e.", "etc.", "vs.", "mr.", "mrs.", "ms.", "dr.", "prof.", "st."]);
const FOOTER = /^I (saved|updated|changed|created|wrote|added|noted|stored)\b/i;
export const MAX_SENTENCE_WORDS = 30;
const LIST_ITEM = /^\s*([-*+•]|\d+[.)])\s+/;

// Split one paragraph into sentences. A trailing fragment without end punctuation counts too.
function splitSentences(par: string): string[] {
  const out: string[] = [];
  const re = /[.!?…]+["'”’)\]]*(?=\s|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(par))) {
    const end = m.index + m[0].length;
    const word = par.slice(last, end).split(/\s+/).pop()!.replace(/^[("'“‘]+/, "").toLowerCase();
    if (m[0].startsWith(".") && ABBREV.has(word.replace(/["'”’)\]]+$/, ""))) continue;
    out.push(par.slice(last, end).trim());
    last = end;
  }
  const rest = par.slice(last).trim();
  if (rest) out.push(rest);
  return out;
}

// Remove fenced blocks. A fence closes only on the same char, at least as long as the opener.
function stripFences(text: string): string {
  const out: string[] = [];
  let open: { ch: string; len: number } | null = null;
  for (const line of text.split("\n")) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!open) {
      if (m) open = { ch: m[1][0], len: m[1].length };
      else out.push(line);
    } else if (m && m[1][0] === open.ch && m[1].length >= open.len && !m[2].trim()) open = null;
  }
  return out.join("\n");
}

export function lint(text: string, opts?: { mode?: ReplyMode }): LintResult {
  const marker = extractMarker(text);
  const body = marker.body;
  const mode: ReplyMode = opts?.mode ?? marker.mode ?? { mode: "short" };
  const violations: Violation[] = [];
  if (!opts?.mode && marker.error) violations.push({ rule: "bad_marker", detail: marker.error });

  const noCode = stripFences(body).replace(/(?<!`)(`+)(?!`)[^\n]*?(?<!`)\1(?!`)/g, "X");
  const paragraphs = noCode.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  let structure = { heading: "", table: "", list: "", bold: "" };
  const prose: string[] = [];
  for (const par of paragraphs) {
    const lines = par.split("\n");
    if (/^\*\*[^*\n]+[.:]\*\*/.test(par)) structure.bold ||= lines[0].slice(0, 40);
    const keep: string[] = [];
    for (const [i, line] of lines.entries()) {
      const next = lines[i + 1] ?? "";
      if (/^\s{0,3}#{1,6}\s/.test(line) || (i + 1 < lines.length && /^ {0,3}(=+|-{2,})\s*$/.test(next) && line.trim() && !LIST_ITEM.test(line))) structure.heading ||= line.trim();
      else if (/^\s*\|/.test(line) || (line.includes("|") && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(next))) structure.table ||= line.trim().slice(0, 40);
      else if (LIST_ITEM.test(line)) structure.list ||= line.trim().slice(0, 40);
      else keep.push(line.trim());
    }
    if (keep.length) prose.push(keep.join(" "));
  }

  let footer = false;
  const lastPar = prose[prose.length - 1];
  if (lastPar && FOOTER.test(lastPar) && splitSentences(lastPar).length === 1) {
    footer = true;
    prose.pop();
  }
  const sentences = prose.flatMap(splitSentences);
  const questions = sentences.filter((s) => /\?[?!]*["'”’)\]]*$/.test(s)).length;
  const words = prose.join(" ").split(/\s+/).filter(Boolean).length;

  if (mode.mode === "short") {
    if (sentences.length === 0) violations.push({ rule: "too_many_sentences", detail: "0 sentences, min 1" });
    if (sentences.length > 5) violations.push({ rule: "too_many_sentences", detail: `${sentences.length} sentences, max 5` });
    const longest = sentences.reduce((a, s) => (s.split(/\s+/).length > a.split(/\s+/).length ? s : a), "");
    const longWords = longest ? longest.split(/\s+/).filter(Boolean).length : 0;
    if (longWords > MAX_SENTENCE_WORDS) {
      violations.push({ rule: "sentence_too_long", detail: `${longWords} words, max ${MAX_SENTENCE_WORDS}: "${longest.slice(0, 40)}"` });
    }
    if (questions > 1) violations.push({ rule: "too_many_questions", detail: `${questions} questions, max 1` });
    if (questions >= 1 && !/\?[?!]*["'”’)\]]*$/.test(sentences[sentences.length - 1])) {
      violations.push({ rule: "question_not_last", detail: "the question is not the last sentence" });
    }
    if (structure.heading) violations.push({ rule: "structure_heading", detail: structure.heading });
    if (structure.table) violations.push({ rule: "structure_table", detail: structure.table });
    if (structure.list) violations.push({ rule: "structure_list", detail: structure.list });
    if (structure.bold) violations.push({ rule: "structure_bold_label", detail: structure.bold });
  } else {
    if (!(REASON_TYPES as readonly string[]).includes(mode.type)) {
      violations.push({ rule: "bad_reason_type", detail: `"${mode.type}" is not one of: ${REASON_TYPES.join(", ")}` });
    }
    if (mode.note.trim().split(/\s+/).filter(Boolean).length < 3) {
      violations.push({ rule: "empty_note", detail: "note needs at least 3 words" });
    }
  }

  const ok = violations.length === 0;
  const hint = ok
    ? ""
    : `Your reply breaks the short reply rules: ${violations.map((v) => `${v.rule} (${v.detail})`).join("; ")}. ` +
      "Keep one topic in 1-5 short sentences with at most one question, at the end. Keep the rest in the topic plan. " +
      `If this reply really needs more room, declare long mode with a type from: ${REASON_TYPES.join(", ")}, and a short note.`;
  return { ok, mode, violations, hint, stats: { sentences: sentences.length, questions, words, footer } };
}
