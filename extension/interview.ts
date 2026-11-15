/**
 * Host-neutral core of documentizer, shared by the omp extension (`index.ts`) and the Claude Code
 * plugin (`../claude/`): starting an interview, the question loop behind `doc_ask` and topic
 * completion behind `doc_topic`. Hosts only supply the UI that shows one question.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { type FormView, type Outcome, type Question, recommendationText } from "./form";
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

export type Mode = "new" | "resume" | "update";

/** Tool texts both hosts register, so the agent sees the same contract everywhere. */
export const TOOL_DOCS = {
	ask: {
		description:
			"Ask the user ONE documentizer interview question as a form and record the answer in docs/.documentizer/state.json. " +
			"Only during /documentize. The form always offers ELI5 (shows your eli5 text instantly), 'you decide' " +
			"(records your recommendation as an agent decision), skip (open question) and stop (pause the interview).",
		params: {
			topic: "Topic this question belongs to",
			question: "One question, in the interview language",
			context: "What you found in the code or earlier answers that makes this question necessary; short",
			eli5: "The same question explained to a five-year-old: an everyday analogy, no jargon, what each choice means",
			choices: "2-5 answer options; empty for an open question (free text). The UI adds a free-text 'Other'",
			recommended: "Your recommendation: choice value(s) (preselected), or the proposed answer text for an open question",
			multi: "Allow several choices (checkboxes)",
		},
	},
	topic: {
		description:
			"Mark a documentizer topic done after its PROJECT.md section is written and no gap remains in it. " +
			"Returns the remaining topics; completing the last one completes the interview.",
		params: { topic: "Finished topic" },
	},
} as const;

export function parseArgs(args: string): { lang?: Lang } {
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

function renderPrompt(root: string, state: DocState, mode: Mode, since: string | undefined): string {
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

/**
 * Starts, resumes or reopens the interview in `root` and returns the agent prompt. Moves a
 * root-layout interview into docs/ first (`moved` names what moved).
 */
export function startInterview(root: string, lang: Lang | undefined): { mode: Mode; state: DocState; moved: string[]; prompt: string } {
	const moved = migrateRootLayout(root);
	const previous = loadState(root);
	let state: DocState;
	let mode: Mode;
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
	return { mode, state, moved, prompt: renderPrompt(root, state, mode, since) };
}

function runningState(root: string): DocState {
	const state = loadState(root);
	if (!state || state.phase !== "interview") throw new Error("No documentizer interview is running here; the user starts one with /documentize");
	return state;
}

export interface AskParams extends Question {
	topic: TopicId;
}

/** What the host's UI returned for one showing of the question. */
export type Shown = Outcome | { kind: "cancel" } | { kind: "timeout" };

const PAUSED =
	"Update PROJECT.md with what you have (unanswered items under open questions), then end your turn without asking more. /documentize resumes.";

// One question at a time even if the agent asks in parallel.
let askQueue: Promise<unknown> = Promise.resolve();

/**
 * Shows the question with `show` until it settles (ELI5 and empty answers re-show it), records the
 * result in the state file and returns the message for the agent.
 */
export function ask(root: string, params: AskParams, show: (view: FormView) => Promise<Shown>): Promise<string> {
	const run = askQueue.then(async () => {
		const state = runningState(root);
		const index = TOPIC_IDS.indexOf(params.topic) + 1;
		const view: FormView = { lang: state.lang, heading: `${topicTitle(params.topic, state.lang)} (${index}/${TOPIC_IDS.length})`, showEli5: false };
		const record = (answer: string, source: "user" | "agent" | "skipped"): void => {
			state.entries.push({ topic: params.topic, question: params.question, answer, source, at: new Date().toISOString() });
			saveState(root, state);
		};
		const pause = (): void => {
			state.phase = "paused";
			saveState(root, state);
		};
		for (;;) {
			const outcome = await show({ ...view });
			switch (outcome.kind) {
				case "eli5":
					view.showEli5 = true;
					view.warning = undefined;
					continue;
				case "empty":
					view.warning = state.lang === "tr" ? "Cevap boş; bir cevap yaz ya da başka bir seçenek seç." : "The answer is empty; write one or pick another action.";
					continue;
				case "answer":
					record(outcome.answer, "user");
					return `User answered: ${outcome.answer}`;
				case "decide": {
					const decision = recommendationText(params);
					record(decision, "agent");
					return `The user left this to you. Recorded your recommendation as an agent decision: ${decision}. Mark it as an agent decision in PROJECT.md.`;
				}
				case "skip":
					record("(skipped)", "skipped");
					return "Skipped; list it under open questions in PROJECT.md and move on.";
				case "timeout":
					record("(no answer: form timed out)", "skipped");
					return "The form timed out without an answer; recorded as an open question. Continue with the next question.";
				case "stop":
					pause();
					return `The user stopped the interview; it is paused. ${PAUSED}`;
				case "cancel":
					pause();
					return `The user cancelled the form; the interview is paused. ${PAUSED}`;
			}
		}
	});
	askQueue = run.catch(() => {});
	return run;
}

/** Marks `topic` done; the last one completes the interview. Returns the message for the agent. */
export function finishTopic(root: string, topic: TopicId): string {
	const state = runningState(root);
	if (!state.topicsDone.includes(topic)) state.topicsDone.push(topic);
	const remaining = remainingTopics(state);
	if (remaining.length === 0) {
		state.phase = "complete";
		state.completedAt = new Date().toISOString();
		state.completedCommit = gitHead(root);
	}
	saveState(root, state);
	return remaining.length === 0
		? "All topics done; the interview is complete. Finish PROJECT.md (map section, open questions, decisions) and summarise for the user."
		: `Remaining topics: ${remaining.join(", ")}. Next: ${remaining[0]}.`;
}
