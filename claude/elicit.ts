/**
 * One `doc_ask` question as an MCP elicitation form (what Claude Code shows as a dialog) and the
 * submitted content read back. Pure, so it is testable without Claude Code.
 *
 * Layout mirrors the omp form: the question (`answer`: one select, a checkbox per choice when
 * `multi`, or a text field for an open question), an `other` text field added to the choice, then
 * `action` defaulting to "answer" with ELI5 / you decide / skip / stop. Enum values are the
 * visible labels, so clients that ignore enum titles still show readable options.
 */
import { type FormView, LABELS, type Outcome, type Question } from "../extension/form";

export interface Elicitation {
	message: string;
	requestedSchema: { type: "object"; properties: Record<string, Record<string, unknown>>; required: string[] };
}

const ACTIONS = ["answer", "eli5", "decide", "skip", "stop"] as const;

/** Choice labels as shown; a label used twice gets its value appended so each option stays unique. */
function choiceTitles(q: Question): string[] {
	return q.choices.map(c => (q.choices.filter(o => o.label === c.label).length > 1 ? `${c.label} (${c.value})` : c.label));
}

function actionTitles(view: FormView): [string, (typeof ACTIONS)[number]][] {
	const l = LABELS[view.lang];
	return ACTIONS.filter(a => !(a === "eli5" && view.showEli5)).map(a => [l[a], a]);
}

export function buildElicitation(q: Question, view: FormView): Elicitation {
	const l = LABELS[view.lang];
	const lines = [view.heading];
	if (view.warning) lines.push(`⚠ ${view.warning}`);
	if (q.context) lines.push(q.context.trim());
	if (view.showEli5) lines.push(`${l.eli5Title}:\n${q.eli5.trim()}`);
	lines.push(q.question);
	if (q.choices.length === 0 && q.recommended.length > 0) lines.push(`${l.proposal}: ${q.recommended.join("; ")}`);

	const properties: Elicitation["requestedSchema"]["properties"] = {};
	const titles = choiceTitles(q);
	if (q.choices.length === 0) {
		properties.answer = { type: "string", title: l.yourAnswer };
	} else if (q.multi) {
		q.choices.forEach((c, i) => {
			properties[`choice${i}`] = { type: "boolean", title: titles[i], default: q.recommended.includes(c.value) };
		});
	} else {
		const recommended = q.choices.findIndex(c => c.value === q.recommended[0]);
		properties.answer = {
			type: "string",
			title: q.question,
			enum: [...titles, l.otherChoice],
			...(recommended >= 0 ? { default: titles[recommended] } : {}),
		};
	}
	if (q.choices.length > 0) properties.other = { type: "string", title: l.otherText };
	properties.action = { type: "string", title: l.actions, enum: actionTitles(view).map(([title]) => title), default: l.answer };
	return { message: lines.join("\n\n"), requestedSchema: { type: "object", properties, required: ["action"] } };
}

export function readElicited(q: Question, view: FormView, content: Record<string, unknown>): Outcome {
	const actionTitle = typeof content.action === "string" ? content.action : undefined;
	const action = actionTitles(view).find(([title]) => title === actionTitle)?.[1] ?? "answer";
	if (action !== "answer") return { kind: action };

	const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
	const titles = choiceTitles(q);
	let chosen: string[];
	if (q.choices.length === 0) chosen = [str(content.answer)];
	else if (q.multi) chosen = q.choices.filter((_, i) => content[`choice${i}`] === true).map(c => c.label);
	else chosen = q.choices.filter((_, i) => titles[i] === content.answer).map(c => c.label);
	const answer = [chosen.filter(Boolean).join("; "), str(content.other)].filter(Boolean).join(" — ");
	return answer ? { kind: "answer", answer } : { kind: "empty" };
}
