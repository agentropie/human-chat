import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import humanChat from "../pi/extension.ts";
import { NUDGE_TEXT, RULES_TEXT } from "../dist/index.js";

const HUMAN = "\u2063human-chat:human\u2063";
const REWRITE = "\u2063human-chat:rewrite\u2063";

/** Minimal in-memory ExtensionAPI: tools, handlers, and the active tool set. */
function fakePi() {
	const tools: { name: string; defaultActive?: boolean }[] = [];
	const handlers: Record<string, (event: any, ctx: any) => any> = {};
	let active = new Set(["read", "bash"]);
	const pi = {
		registerTool(tool: { name: string; defaultActive?: boolean }) {
			tools.push(tool);
			if (tool.defaultActive !== false) active.add(tool.name);
		},
		on(name: string, handler: (event: any, ctx: any) => any) {
			handlers[name] = handler;
		},
		getActiveTools: () => [...active],
		setActiveTools(names: string[]) {
			active = new Set(names);
		},
	};
	humanChat(pi as never);
	return {
		tools,
		active: () => active,
		input: (text: string, ctx: any = { mode: "rpc" }, source = "rpc") => handlers.input?.({ type: "input", text, source }, ctx),
		start: (event: any, ctx: any = { mode: "rpc" }) => handlers.before_agent_start?.({ systemPrompt: "BASE", ...event }, ctx),
	};
}

const savedEnv = { ...process.env };
beforeEach(() => {
	process.env.HUMAN_CHAT = "1";
	delete process.env.PI_SUBAGENT_CHILD;
});
afterEach(() => {
	process.env = { ...savedEnv };
});

test("human turn: marker stripped, rules, nudge, and reply_mode", () => {
	const pi = fakePi();
	assert.deepEqual(pi.input(`${HUMAN}hello`), { action: "transform", text: "hello" });
	const r = pi.start({ messageType: "user", prompt: "hello" });
	assert.equal(r.systemPrompt, `BASE\n\n${RULES_TEXT}`);
	assert.equal(r.message.content, NUDGE_TEXT);
	assert.ok(pi.active().has("reply_mode"));
});

test("unmarked prompt (agent sender, scheduler, no source): no rules, nudge, or tool", () => {
	const pi = fakePi();
	pi.input("from another agent");
	assert.equal(pi.start({ messageType: "user", prompt: "from another agent" }), undefined);
	assert.ok(!pi.active().has("reply_mode"));
});

test("rewrite turn: rules and tool, no nudge", () => {
	const pi = fakePi();
	assert.deepEqual(pi.input(`${REWRITE}[human-chat] shorten`), { action: "transform", text: "[human-chat] shorten" });
	const r = pi.start({ messageType: "user", prompt: "[human-chat] shorten" });
	assert.equal(r.systemPrompt, `BASE\n\n${RULES_TEXT}`);
	assert.equal(r.message, undefined);
	assert.ok(pi.active().has("reply_mode"));
});

test("custom autonomous run gets nothing, even after a marked input", () => {
	const pi = fakePi();
	pi.input(`${HUMAN}hello`);
	assert.equal(pi.start({ messageType: "custom", message: {} }), undefined);
	assert.ok(!pi.active().has("reply_mode"));
});

test("tool and rules follow each run, not the session", () => {
	const pi = fakePi();
	pi.input(`${HUMAN}one`);
	assert.ok(pi.start({ messageType: "user", prompt: "one" }));
	assert.ok(pi.active().has("reply_mode"));
	pi.input("two");
	assert.equal(pi.start({ messageType: "user", prompt: "two" }), undefined);
	assert.ok(!pi.active().has("reply_mode"));
	pi.input(`${HUMAN}three`);
	assert.ok(pi.start({ messageType: "user", prompt: "three" }));
	assert.ok(pi.active().has("reply_mode"));
});

test("print mode: the tool is registered but never active, no rules", () => {
	const pi = fakePi();
	const print = { mode: "print" };
	assert.ok(!pi.active().has("reply_mode"));
	pi.input(`${HUMAN}hello`, print);
	assert.equal(pi.start({ messageType: "user", prompt: `${HUMAN}hello` }, print), undefined);
	assert.ok(!pi.active().has("reply_mode"));
});

test("marker from a non-rpc source is ignored", () => {
	const pi = fakePi();
	assert.deepEqual(pi.input(`${HUMAN}hello`, { mode: "rpc" }, "interactive"), { action: "continue" });
	assert.equal(pi.start({ messageType: "user", prompt: "x" }), undefined);
});

test("off without HUMAN_CHAT=1 and in sub-agent children", () => {
	delete process.env.HUMAN_CHAT;
	assert.equal(fakePi().tools.length, 0);
	process.env.HUMAN_CHAT = "1";
	process.env.PI_SUBAGENT_CHILD = "1";
	assert.equal(fakePi().tools.length, 0);
});
