/**
 * chat-shape Pi extension: rules, nudge, and the `reply_mode` tool.
 * It never lints. The adapter (DAR) holds, lints, and asks for rewrites.
 * Acts only when CHAT_SHAPE=1; skips sub-agent children and print mode.
 *
 * Per run: the adapter marks each interactive human prompt (and its rewrite
 * hint) with an invisible prefix. This extension strips the prefix in the
 * `input` hook and shapes only that run. Any other run (agent sender,
 * scheduler, custom or background run, no marker) gets no rules, no nudge,
 * and no `reply_mode` tool.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { NUDGE_TEXT, REASON_TYPES, RULES_TEXT } from "../dist/index.js";

const HUMAN_MARKER = "\u2063chat-shape:human\u2063";
const REWRITE_MARKER = "\u2063chat-shape:rewrite\u2063";
const TOOL = "reply_mode";

export default function chatShape(pi: ExtensionAPI) {
	if (process.env.CHAT_SHAPE !== "1" || process.env.PI_SUBAGENT_CHILD === "1") return;
	const active = (ctx: { mode?: string }) => ctx.mode !== "print";
	/** Kind of the next run, set by `input`, consumed by `before_agent_start`. */
	let next: "human" | "rewrite" | undefined;
	const setTool = (on: boolean) => {
		const now = pi.getActiveTools();
		if (now.includes(TOOL) === on) return;
		pi.setActiveTools(on ? [...now, TOOL] : now.filter((name) => name !== TOOL));
	};

	pi.registerTool({
		name: TOOL,
		defaultActive: false,
		label: "Reply mode",
		description:
			"Declare long mode for the current reply only, when it needs more than 1-5 sentences or structure. " +
			`Types: ${REASON_TYPES.join(", ")}. Give a short note (3+ words) saying why.`,
		parameters: {
			type: "object",
			properties: {
				mode: { type: "string", enum: ["long"] },
				type: { type: "string", enum: [...REASON_TYPES] },
				note: { type: "string", description: "Short reason, at least 3 words" },
			},
			required: ["mode", "type", "note"],
		} as never,
		async execute(_id: string, params: { mode?: string; type?: string; note?: string }, _signal: unknown, _update: unknown, ctx: { mode?: string }) {
			const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: params });
			if (!active(ctx)) return text("reply_mode is off here.");
			const valid = (REASON_TYPES as readonly string[]).includes(params.type ?? "");
			const words = (params.note ?? "").trim().split(/\s+/).filter(Boolean).length;
			if (params.mode !== "long" || !valid || words < 3) {
				throw new Error(`Bad reply_mode. mode must be "long", type one of: ${REASON_TYPES.join(", ")}, note at least 3 words.`);
			}
			return text("Long mode on for this reply.");
		},
	} as never);

	pi.on("input", (event, ctx) => {
		next = undefined;
		if (!active(ctx) || event.source !== "rpc") return { action: "continue" };
		for (const [marker, kind] of [[HUMAN_MARKER, "human"], [REWRITE_MARKER, "rewrite"]] as const) {
			if (event.text.startsWith(marker)) {
				next = kind;
				return { action: "transform", text: event.text.slice(marker.length) };
			}
		}
		return { action: "continue" };
	});

	pi.on("before_agent_start", (event, ctx) => {
		const kind = event.messageType === "user" && active(ctx) ? next : undefined;
		next = undefined;
		setTool(kind !== undefined);
		if (!kind) return;
		const systemPrompt = `${event.systemPrompt}\n\n${RULES_TEXT}`;
		if (kind === "rewrite") return { systemPrompt };
		return { systemPrompt, message: { customType: "chat-shape-nudge", content: NUDGE_TEXT, display: false } };
	});
}
