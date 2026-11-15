import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildElicitation, readElicited } from "../claude/elicit";
import type { FormView, Question } from "../extension/form";
import { ask, type Shown, startInterview } from "../extension/interview";
import { loadState } from "../extension/state";

const q: Question = {
	question: "Where is data stored?",
	context: "src/db.ts opens a file.",
	eli5: "Where do your toys live?",
	choices: [
		{ value: "sqlite", label: "SQLite file" },
		{ value: "pg", label: "Postgres" },
	],
	recommended: ["sqlite"],
};
const view: FormView = { lang: "en", heading: "Data (5/11)", showEli5: false };

describe("buildElicitation", () => {
	test("single choice: labels as enum, recommendation and answer action preselected", () => {
		const { message, requestedSchema } = buildElicitation(q, view);
		const { answer, action } = requestedSchema.properties;
		expect(answer).toMatchObject({ enum: ["SQLite file", "Postgres", "Other (I'll write it below)"], default: "SQLite file" });
		expect(action).toMatchObject({ default: "My answer is above" });
		expect(action.enum).toContain("ELI5: explain this question simply");
		expect(message).toContain("src/db.ts opens a file.");
		expect(message).not.toContain("toys");
	});

	test("ELI5 view shows the explanation and drops the ELI5 action", () => {
		const { message, requestedSchema } = buildElicitation(q, { ...view, showEli5: true });
		expect(message).toContain("Where do your toys live?");
		expect(requestedSchema.properties.action.enum).not.toContain("ELI5: explain this question simply");
	});

	test("duplicate labels stay distinguishable", () => {
		const dup = { ...q, choices: [{ value: "a", label: "Same" }, { value: "b", label: "Same" }] };
		const { requestedSchema } = buildElicitation(dup, view);
		expect(requestedSchema.properties.answer.enum).toEqual(["Same (a)", "Same (b)", "Other (I'll write it below)"]);
		expect(readElicited(dup, view, { answer: "Same (b)", action: "My answer is above" })).toEqual({ kind: "answer", answer: "Same" });
	});
});

describe("readElicited", () => {
	const answerAction = "My answer is above";

	test("choice, Other text, and both", () => {
		expect(readElicited(q, view, { answer: "Postgres", action: answerAction })).toEqual({ kind: "answer", answer: "Postgres" });
		expect(readElicited(q, view, { answer: "Other (I'll write it below)", other: "Redis", action: answerAction })).toEqual({
			kind: "answer",
			answer: "Redis",
		});
		expect(readElicited(q, view, { answer: "Postgres", other: "only in prod", action: answerAction })).toEqual({
			kind: "answer",
			answer: "Postgres — only in prod",
		});
	});

	test("multi: checked booleans in choice order", () => {
		const multi = { ...q, multi: true, recommended: ["sqlite", "pg"] };
		const { requestedSchema } = buildElicitation(multi, view);
		expect(requestedSchema.properties.choice1).toMatchObject({ type: "boolean", default: true });
		expect(readElicited(multi, view, { choice0: true, choice1: true, action: answerAction })).toEqual({
			kind: "answer",
			answer: "SQLite file; Postgres",
		});
	});

	test("actions win; empty answers are reported", () => {
		expect(readElicited(q, view, { answer: "Postgres", action: "I don't know, you decide" })).toEqual({ kind: "decide" });
		expect(readElicited(q, view, { answer: "Postgres", action: "Stop here (save, resume later)" })).toEqual({ kind: "stop" });
		expect(readElicited(q, view, { answer: "Other (I'll write it below)", action: answerAction })).toEqual({ kind: "empty" });
		const open = { ...q, choices: [], recommended: ["Local disk"] };
		expect(readElicited(open, view, { answer: "  ", action: answerAction })).toEqual({ kind: "empty" });
	});
});

describe("ask loop", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "documentizer-"));
	afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

	test("ELI5 re-shows with the explanation, the answer is recorded; cancel pauses", async () => {
		startInterview(root, "en");
		const shown: FormView[] = [];
		const replies: Shown[] = [{ kind: "eli5" }, { kind: "answer", answer: "Postgres" }];
		const message = await ask(root, { ...q, topic: "data" }, async v => {
			shown.push(v);
			return replies.shift()!;
		});
		expect(message).toBe("User answered: Postgres");
		expect(shown.map(v => v.showEli5)).toEqual([false, true]);
		expect(loadState(root)!.entries).toMatchObject([{ topic: "data", answer: "Postgres", source: "user" }]);

		expect(await ask(root, { ...q, topic: "data" }, async () => ({ kind: "cancel" }))).toContain("paused");
		expect(loadState(root)!.phase).toBe("paused");
		expect(startInterview(root, undefined).mode).toBe("resume");
	});
});
