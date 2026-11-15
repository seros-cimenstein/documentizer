/**
 * documentizer: maps a project's structure and interviews the user, one question at a time, until
 * every topic of its scope is written down in docs/PROJECT.md (+ docs/PROJECT.space map).
 *
 * - `/documentize [--lang tr|en]` starts, resumes or updates the interview in the current directory
 *   by sending the agent the prompt in `prompts/documentize.md`.
 * - `doc_ask` shows one question as an omp form (also answerable from the phone via DevDeck+). Each
 *   question carries a prepared ELI5 text, so "ELI5" re-shows the form at once, without a model turn.
 *   Answers are recorded in `docs/.documentizer/state.json`.
 * - `doc_topic` marks a topic done; the last one completes the interview.
 * - `/strictly-docs` (commands/strictly-docs.md) implements from these documents.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { buildForm, type FormData, type Question, readAnswer, recommendationText } from "./form";
import {
	type DocState,
	docsDir,
	type Lang,
	loadState,
	migrateRootLayout,
	newState,
	remainingTopics,
	saveState,
	stateFile,
	TOPIC_IDS,
	TOPICS,
	type TopicId,
	topicTitle,
} from "./state";

const PROMPT_FILE = path.join(import.meta.dir, "prompts", "documentize.md");

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

function parseArgs(args: string): { lang?: Lang } {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const result: { lang?: Lang } = {};
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const inline = token.startsWith("--lang=") ? token.slice("--lang=".length) : undefined;
		if (token !== "--lang" && inline === undefined) throw new Error(`unknown argument: ${token}`);
		const value = inline ?? tokens[++i];
		if (value !== "tr" && value !== "en") throw new Error("--lang takes tr or en");
		result.lang = value;
	}
	return result;
}

function gitHead(root: string): string | undefined {
	const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe", stderr: "ignore" });
	return result.exitCode === 0 ? result.stdout.toString().trim() : undefined;
}

function renderPrompt(root: string, state: DocState, mode: "new" | "resume" | "update", since: string | undefined): string {
	const topics = TOPICS.map(t => `- [${state.topicsDone.includes(t.id) ? "x" : " "}] \`${t.id}\`: ${t[state.lang]}`).join("\n");
	const vars: Record<string, string> = {
		ROOT: root,
		DOCS: docsDir(root),
		LANG: state.lang === "tr" ? "Turkish" : "English",
		MODE: mode,
		TOPICS: topics,
		STATE_FILE: stateFile(root),
		SINCE: since ?? "unknown (no commit was recorded; compare PROJECT.md against the code)",
	};
	return fs.readFileSync(PROMPT_FILE, "utf8").replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

export default function documentizerExtension(pi: ExtensionAPI): void {
	const z = pi.zod;
	// One form at a time even if the agent calls doc_ask in parallel.
	let askQueue: Promise<unknown> = Promise.resolve();

	pi.registerCommand("documentize", {
		description: "Map this project and interview you topic by topic into docs/PROJECT.md + docs/PROJECT.space (--lang tr|en)",
		getArgumentCompletions: prefix =>
			["--lang tr", "--lang en"].filter(arg => arg.startsWith(prefix.trim())).map(arg => ({ value: arg, label: arg })),
		handler: async (args, ctx) => {
			let lang: Lang | undefined;
			try {
				({ lang } = parseArgs(args));
			} catch (error) {
				ctx.ui.notify(`documentize: ${error instanceof Error ? error.message : error}`, "error");
				return;
			}
			const root = ctx.cwd;
			const moved = migrateRootLayout(root);
			if (moved.length > 0) ctx.ui.notify(`documentize: moved ${moved.join(", ")} into docs/`, "info");
			const previous = loadState(root);
			let state: DocState;
			let mode: "new" | "resume" | "update";
			let since: string | undefined;
			if (!previous) {
				state = newState(lang ?? "tr");
				mode = "new";
			} else if (previous.phase === "complete") {
				since = previous.completedCommit;
				state = { ...previous, lang: lang ?? previous.lang, phase: "interview", topicsDone: [] };
				delete state.completedAt;
				delete state.completedCommit;
				mode = "update";
			} else {
				state = { ...previous, lang: lang ?? previous.lang, phase: "interview" };
				mode = "resume";
			}
			saveState(root, state);
			const prompt = renderPrompt(root, state, mode, since);
			ctx.ui.notify(`documentize: ${mode} in ${root} (${state.lang})`, "info");
			pi.sendUserMessage(prompt, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
		},
	});

	pi.registerTool({
		name: "doc_ask",
		label: "Documentizer Ask",
		description:
			"Ask the user ONE documentizer interview question as a form and record the answer in docs/.documentizer/state.json. " +
			"Only during /documentize. The form always offers ELI5 (shows your eli5 text instantly), 'you decide' " +
			"(records your recommendation as an agent decision), skip (open question) and stop (pause the interview).",
		parameters: z.object({
			topic: z.enum(TOPIC_IDS).describe("Topic this question belongs to"),
			question: z.string().describe("One question, in the interview language"),
			context: z
				.string()
				.optional()
				.describe("What you found in the code or earlier answers that makes this question necessary; short"),
			eli5: z
				.string()
				.describe("The same question explained to a five-year-old: an everyday analogy, no jargon, what each choice means"),
			choices: z
				.array(z.object({ value: z.string(), label: z.string() }))
				.describe("2-5 answer options; empty for an open question (free text). The UI adds a free-text 'Other'"),
			recommended: z
				.array(z.string())
				.min(1)
				.describe("Your recommendation: choice value(s) (preselected), or the proposed answer text for an open question"),
			multi: z.boolean().optional().describe("Allow several choices (checkboxes)"),
		}),
		approval: "read",
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const run = askQueue.then(async () => {
				const root = ctx.cwd;
				const state = loadState(root);
				if (!state || state.phase !== "interview") throw new Error("No documentizer interview is running here; the user starts one with /documentize");
				if (!ctx.ui.formDialog) throw new Error("doc_ask needs an interactive UI with form support");
				const q: Question = params;
				const index = TOPIC_IDS.indexOf(params.topic as TopicId) + 1;
				const heading = `${topicTitle(params.topic as TopicId, state.lang)} (${index}/${TOPIC_IDS.length})`;
				let showEli5 = false;
				let warning: string | undefined;
				const record = (answer: string, source: "user" | "agent" | "skipped"): void => {
					state.entries.push({ topic: params.topic as TopicId, question: params.question, answer, source, at: new Date().toISOString() });
					saveState(root, state);
				};
				for (;;) {
					if (signal?.aborted) throw new Error("Question cancelled");
					const result = await ctx.ui.formDialog(buildForm(q, { lang: state.lang, heading, showEli5, warning }), { signal });
					if (!result) {
						state.phase = "paused";
						saveState(root, state);
						return text(
							"The user cancelled the form; the interview is paused. Update PROJECT.md with what you have (unanswered items under open questions), then end your turn without asking more. /documentize resumes.",
						);
					}
					if (result.timedOut) {
						record("(no answer: form timed out)", "skipped");
						return text("The form timed out without an answer; recorded as an open question. Continue with the next question.");
					}
					const outcome = readAnswer(q, result.data as FormData);
					switch (outcome.kind) {
						case "eli5":
							showEli5 = true;
							warning = undefined;
							continue;
						case "empty":
							warning = state.lang === "tr" ? "Cevap boş; bir cevap yaz ya da başka bir seçenek seç." : "The answer is empty; write one or pick another action.";
							continue;
						case "answer":
							record(outcome.answer, "user");
							return text(`User answered: ${outcome.answer}`);
						case "decide": {
							const decision = recommendationText(q);
							record(decision, "agent");
							return text(
								`The user left this to you. Recorded your recommendation as an agent decision: ${decision}. Mark it as an agent decision in PROJECT.md.`,
							);
						}
						case "skip":
							record("(skipped)", "skipped");
							return text("Skipped; list it under open questions in PROJECT.md and move on.");
						case "stop":
							state.phase = "paused";
							saveState(root, state);
							return text(
								"The user stopped the interview; it is paused. Update PROJECT.md with what you have (unanswered items under open questions), then end your turn without asking more. /documentize resumes.",
							);
					}
				}
			});
			askQueue = run.catch(() => {});
			return run;
		},
	});

	pi.registerTool({
		name: "doc_topic",
		label: "Documentizer Topic Done",
		description:
			"Mark a documentizer topic done after its PROJECT.md section is written and no gap remains in it. " +
			"Returns the remaining topics; completing the last one completes the interview.",
		parameters: z.object({ topic: z.enum(TOPIC_IDS).describe("Finished topic") }),
		approval: "read",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const root = ctx.cwd;
			const state = loadState(root);
			if (!state || state.phase !== "interview") throw new Error("No documentizer interview is running here; the user starts one with /documentize");
			const topic = params.topic as TopicId;
			if (!state.topicsDone.includes(topic)) state.topicsDone.push(topic);
			const remaining = remainingTopics(state);
			if (remaining.length === 0) {
				state.phase = "complete";
				state.completedAt = new Date().toISOString();
				state.completedCommit = gitHead(root);
			}
			saveState(root, state);
			return text(
				remaining.length === 0
					? "All topics done; the interview is complete. Finish PROJECT.md (map section, open questions, decisions) and summarise for the user."
					: `Remaining topics: ${remaining.join(", ")}. Next: ${remaining[0]}.`,
			);
		},
	});
}
