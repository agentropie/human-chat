import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface Topic { status: "open" | "resolved" | "parked"; title: string; body: string }
export interface Plan { title: string; session: string; updated: string; topics: Topic[] }

const STATUS = { " ": "open", x: "resolved", "-": "parked" } as const;

// `fallbackTitle` is used when the frontmatter has no title (callers pass the file name).
export function parsePlan(markdown: string, fallbackTitle = ""): Plan {
  const plan: Plan = { title: fallbackTitle, session: "", updated: "", topics: [] };
  let text = markdown.replace(/\r\n/g, "\n");
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    text = text.slice(fm[0].length);
    for (const line of fm[1].split("\n")) {
      const kv = line.match(/^(title|session|updated):\s*(.*)$/);
      if (kv) plan[kv[1] as "title" | "session" | "updated"] = kv[2].trim();
    }
  }
  let cur: Topic | null = null;
  const body: string[] = [];
  const flush = () => { if (cur) { cur.body = body.join("\n").trim(); plan.topics.push(cur); } body.length = 0; };
  for (const line of text.split("\n")) {
    const h = line.match(/^## \[( |x|-)\]\s*(.*)$/);
    if (h) {
      flush();
      cur = { status: STATUS[h[1] as keyof typeof STATUS], title: h[2].trim(), body: "" };
    } else if (cur) body.push(line);
  }
  flush();
  return plan;
}

export function openTopics(plan: Plan): Topic[] {
  return plan.topics.filter((t) => t.status === "open");
}

export function listOpenPlans(dir: string, days: number): { file: string; title: string; open: string[] }[] {
  const cutoff = Date.now() - days * 86400000;
  const found: { file: string; title: string; open: string[]; time: number }[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    const file = join(dir, name);
    const plan = parsePlan(readFileSync(file, "utf8"), name.replace(/\.md$/, ""));
    const open = openTopics(plan).map((t) => t.title);
    const parsed = Date.parse(plan.updated);
    const time = Number.isNaN(parsed) ? statSync(file).mtimeMs : parsed;
    if (open.length && time >= cutoff) found.push({ file, title: plan.title, open, time });
  }
  return found.sort((a, b) => b.time - a.time).map(({ time, ...rest }) => rest);
}
