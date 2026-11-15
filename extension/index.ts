/**
 * documentizer for omp: maps a project's structure and interviews the user, one question at a
 * time, until every topic of its scope is written down in docs/PROJECT.md (+ docs/PROJECT.space map).
 *
 * - `/documentize [--lang tr|en]` starts, resumes or updates the interview in the current directory
 *   by sending the agent the prompt in `prompts/documentize.md`.
 * - `doc_ask` shows one question as an omp form (also answerable from the phone via DevDeck+). Each
 *   question carries a prepared ELI5 text, so "ELI5" re-shows the form at once, without a model turn.
 *   Answers are recorded in `docs/.documentizer/state.json`.
 * - `doc_topic` marks a topic done; the last one completes the interview.
 * - `/strictly-docs` (commands/strictly-docs.md) implements from these documents.
 *
 * The logic lives in `interview.ts`, shared with the Claude Code plugin (`../claude/`).
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { buildForm, type FormData, readAnswer } from "./form";
import { ask, finishTopic, parseArgs, startInterview, TOOL_DOCS } from "./interview";
import { type Lang, TOPIC_IDS } from "./state";

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

export default function documentizerExtension(pi: ExtensionAPI): void {
	const z = pi.zod;
	const askDocs = TOOL_DOCS.ask.params;

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
			const { mode, state, moved, prompt } = startInterview(ctx.cwd, lang);
			if (moved.length > 0) ctx.ui.notify(`documentize: moved ${moved.join(", ")} into docs/`, "info");
			ctx.ui.notify(`documentize: ${mode} in ${ctx.cwd} (${state.lang})`, "info");
			pi.sendUserMessage(prompt, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
		},
	});

	pi.registerTool({
		name: "doc_ask",
		label: "Documentizer Ask",
		description: TOOL_DOCS.ask.description,
		parameters: z.object({
			topic: z.enum(TOPIC_IDS).describe(askDocs.topic),
			question: z.string().describe(askDocs.question),
			context: z.string().optional().describe(askDocs.context),
			eli5: z.string().describe(askDocs.eli5),
			choices: z.array(z.object({ value: z.string(), label: z.string() })).describe(askDocs.choices),
			recommended: z.array(z.string()).min(1).describe(askDocs.recommended),
			multi: z.boolean().optional().describe(askDocs.multi),
		}),
		approval: "read",
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!ctx.ui.formDialog) throw new Error("doc_ask needs an interactive UI with form support");
			const message = await ask(ctx.cwd, params, async view => {
				if (signal?.aborted) throw new Error("Question cancelled");
				const result = await ctx.ui.formDialog!(buildForm(params, view), { signal });
				if (!result) return { kind: "cancel" };
				if (result.timedOut) return { kind: "timeout" };
				return readAnswer(params, result.data as FormData);
			});
			return text(message);
		},
	});

	pi.registerTool({
		name: "doc_topic",
		label: "Documentizer Topic Done",
		description: TOOL_DOCS.topic.description,
		parameters: z.object({ topic: z.enum(TOPIC_IDS).describe(TOOL_DOCS.topic.params.topic) }),
		approval: "read",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return text(finishTopic(ctx.cwd, params.topic));
		},
	});
}
