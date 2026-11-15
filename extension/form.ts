/**
 * Builds the HTML `<form>` for one `doc_ask` question and reads the submitted data back.
 * Pure: no omp imports, so it is testable outside omp.
 *
 * Layout: the question as one choice group (`answer`; omp adds a free-text "Other" to it) or a
 * textarea when there are no choices, then an `action` radio group defaulting to "answer" with
 * ELI5 / you decide / skip / stop. ELI5 re-shows the same form with the prepared explanation.
 */
import type { Lang } from "./state";

export interface Choice {
	value: string;
	label: string;
}

export interface Question {
	question: string;
	context?: string;
	eli5: string;
	choices: Choice[];
	recommended: string[];
	multi?: boolean;
}

export interface FormView {
	lang: Lang;
	/** Heading line, e.g. "Veri (5/11)". */
	heading: string;
	showEli5: boolean;
	/** Shown above the question after an empty submit. */
	warning?: string;
}

export type FormData = Record<string, string | number | string[]>;

export type Outcome =
	| { kind: "answer"; answer: string }
	| { kind: "empty" }
	| { kind: "eli5" }
	| { kind: "decide" }
	| { kind: "skip" }
	| { kind: "stop" };

/** UI texts per language; also used by the Claude Code plugin's form (`claude/elicit.ts`). */
export const LABELS = {
	tr: {
		eli5Title: "ELI5 (çok basit anlatım)",
		yourAnswer: "Cevabın",
		proposal: "Önerim",
		actions: "Ne yapmak istersin?",
		answer: "Cevabım yukarıda",
		eli5: "ELI5: bu soruyu çok basit anlat",
		decide: "Bilmiyorum, sen karar ver",
		skip: "Şimdilik atla (açık sorulara eklenir)",
		stop: "Burada dur (kaydet, sonra kaldığım yerden devam)",
		otherChoice: "Diğer (aşağıya yazacağım)",
		otherText: "Diğer / not (seçime eklenir)",
	},
	en: {
		eli5Title: "ELI5 (explained simply)",
		yourAnswer: "Your answer",
		proposal: "My proposal",
		actions: "What do you want to do?",
		answer: "My answer is above",
		eli5: "ELI5: explain this question simply",
		decide: "I don't know, you decide",
		skip: "Skip for now (goes to open questions)",
		stop: "Stop here (save, resume later)",
		otherChoice: "Other (I'll write it below)",
		otherText: "Other / note (added to the choice)",
	},
} as const;

const escapeHtml = (text: string): string =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Paragraphs from plain text: blank lines split paragraphs, single newlines become <br>. */
const paragraphs = (text: string): string[] =>
	text
		.trim()
		.split(/\n\s*\n/)
		.filter(Boolean)
		.map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`);

export function buildForm(q: Question, view: FormView): string {
	const l = LABELS[view.lang];
	const out = ["<form>", `<p><b>${escapeHtml(view.heading)}</b></p>`];
	if (view.warning) out.push(`<p><b>${escapeHtml(view.warning)}</b></p>`);
	if (q.context) out.push(...paragraphs(q.context));
	if (view.showEli5) out.push(`<p><b>${escapeHtml(l.eli5Title)}</b></p>`, ...paragraphs(q.eli5));

	if (q.choices.length > 0) {
		const type = q.multi ? "checkbox" : "radio";
		const preselected = q.multi ? q.recommended : q.recommended.slice(0, 1);
		out.push("<fieldset>", `<legend>${escapeHtml(q.question)}</legend>`);
		for (const c of q.choices) {
			const checked = preselected.includes(c.value) ? " checked" : "";
			out.push(
				`<label><input type="${type}" name="answer" value="${escapeHtml(c.value)}"${checked}> ${escapeHtml(c.label)}</label>`,
			);
		}
		out.push("</fieldset>");
	} else {
		out.push(`<p><b>${escapeHtml(q.question)}</b></p>`);
		if (q.recommended.length > 0) out.push(`<p>${escapeHtml(l.proposal)}: ${escapeHtml(q.recommended.join("; "))}</p>`);
		out.push(`<label>${escapeHtml(l.yourAnswer)} <textarea name="answer"></textarea></label>`);
	}

	const actions: [string, string][] = [["answer", l.answer]];
	if (!view.showEli5) actions.push(["eli5", l.eli5]);
	actions.push(["decide", l.decide], ["skip", l.skip], ["stop", l.stop]);
	out.push("<fieldset>", `<legend>${escapeHtml(l.actions)}</legend>`);
	for (const [value, label] of actions) {
		const checked = value === "answer" ? " checked" : "";
		out.push(`<label><input type="radio" name="action" value="${value}"${checked}> ${escapeHtml(label)}</label>`);
	}
	out.push("</fieldset>", "</form>");
	return out.join("\n");
}

/** Maps submitted values to their choice labels; free "Other" text stays as written. */
function answerText(q: Question, raw: FormData[string] | undefined): string {
	const values = (Array.isArray(raw) ? raw : raw === undefined ? [] : [String(raw)]).map(v => v.trim()).filter(Boolean);
	return values.map(v => q.choices.find(c => c.value === v)?.label ?? v).join("; ");
}

export function readAnswer(q: Question, data: FormData): Outcome {
	const action = typeof data.action === "string" ? data.action.trim() : "answer";
	switch (action) {
		case "eli5":
			return { kind: "eli5" };
		case "decide":
			return { kind: "decide" };
		case "skip":
			return { kind: "skip" };
		case "stop":
			return { kind: "stop" };
	}
	// Text typed into the action group's "Other" joins the answer, e.g. a caveat to the chosen option.
	const answer = [answerText(q, data.answer), action === "answer" ? "" : action].filter(Boolean).join(" — ");
	return answer ? { kind: "answer", answer } : { kind: "empty" };
}

/** The recommendation as readable text, for recording an agent decision. */
export function recommendationText(q: Question): string {
	return q.recommended.map(v => q.choices.find(c => c.value === v)?.label ?? v).join("; ");
}
