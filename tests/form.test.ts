import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildForm, type Question, readAnswer, recommendationText } from "../extension/form";
import { loadState, newState, remainingTopics, saveState } from "../extension/state";

const q: Question = {
	question: "Veri nerede <saklanır>?",
	eli5: "Oyuncakların nerede durur?",
	choices: [
		{ value: "sqlite", label: "SQLite dosyası" },
		{ value: "pg", label: "Postgres" },
	],
	recommended: ["sqlite"],
};
const view = { lang: "tr" as const, heading: "Veri (5/11)", showEli5: false };

describe("buildForm", () => {
	test("preselects the recommendation and the answer action, escapes text", () => {
		const html = buildForm(q, view);
		expect(html).toContain('value="sqlite" checked');
		expect(html).not.toContain('value="pg" checked');
		expect(html).toContain('name="action" value="answer" checked');
		expect(html).toContain("&lt;saklanır&gt;");
		expect(html).not.toContain("Oyuncakların");
	});

	test("ELI5 view shows the explanation and drops the ELI5 action", () => {
		const html = buildForm(q, { ...view, showEli5: true });
		expect(html).toContain("Oyuncakların nerede durur?");
		expect(html).not.toContain('value="eli5"');
	});

	test("open question gets a textarea and shows the proposal", () => {
		const html = buildForm({ ...q, choices: [], recommended: ["Yerel disk"] }, view);
		expect(html).toContain('<textarea name="answer">');
		expect(html).toContain("Önerim: Yerel disk");
	});
});

describe("readAnswer", () => {
	test("maps choice values to labels and keeps Other text", () => {
		expect(readAnswer(q, { answer: "pg", action: "answer" })).toEqual({ kind: "answer", answer: "Postgres" });
		expect(readAnswer(q, { answer: "Redis", action: "answer" })).toEqual({ kind: "answer", answer: "Redis" });
		expect(readAnswer({ ...q, multi: true }, { answer: ["sqlite", "pg"], action: "answer" })).toEqual({
			kind: "answer",
			answer: "SQLite dosyası; Postgres",
		});
	});

	test("text typed in the action group's Other joins the answer", () => {
		expect(readAnswer(q, { answer: "pg", action: "only in production" })).toEqual({
			kind: "answer",
			answer: "Postgres — only in production",
		});
	});

	test("action wins over a preselected answer; empty answer is reported", () => {
		for (const kind of ["eli5", "decide", "skip", "stop"] as const) {
			expect(readAnswer(q, { answer: "sqlite", action: kind })).toEqual({ kind });
		}
		expect(readAnswer(q, { answer: "  ", action: "answer" })).toEqual({ kind: "empty" });
	});

	test("recommendation text uses labels", () => {
		expect(recommendationText(q)).toBe("SQLite dosyası");
	});
});

describe("state", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "documentizer-"));
	afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

	test("round-trips and tracks remaining topics", () => {
		expect(loadState(root)).toBeUndefined();
		const state = newState("en");
		state.topicsDone.push("purpose");
		saveState(root, state);
		const loaded = loadState(root);
		expect(loaded).toEqual(state);
		expect(remainingTopics(loaded!)[0]).toBe("scope");
	});
});
