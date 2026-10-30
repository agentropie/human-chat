/**
 * chat-shape Pi extension: rules, nudge, and the `reply_mode` tool.
 * It never lints. The adapter (DAR) holds, lints, and asks for rewrites.
 * Acts only when CHAT_SHAPE=1; skips sub-agent children and print mode.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { NUDGE_TEXT, REASON_TYPES, RULES_TEXT } from "../dist/index.js";

const REWRITE_PREFIX = "[chat-shape] ";

export default function chatShape(pi: ExtensionAPI) {
	if (process.env.CHAT_SHAPE !== "1" || process.env.PI_SUBAGENT_CHILD === "1") return;
	const active = (ctx: { mode?: string }) => ctx.mode !== "print";

	pi.registerTool({
		name: "reply_mode",
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

	pi.on("before_agent_start", (event, ctx) => {
		if (!active(ctx)) return;
		const systemPrompt = `${event.systemPrompt}\n\n${RULES_TEXT}`;
		if (event.messageType !== "user" || event.prompt.startsWith(REWRITE_PREFIX)) return { systemPrompt };
		return { systemPrompt, message: { customType: "chat-shape-nudge", content: NUDGE_TEXT, display: false } };
	});
}
