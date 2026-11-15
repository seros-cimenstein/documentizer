/**
 * Interview state, kept in `<project>/docs/.documentizer/state.json` next to the documents it
 * produces (`docs/PROJECT.md`, `docs/PROJECT.space`), so `/documentize` can resume a paused
 * interview or, after a finished one, re-check only what changed since then.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type Lang = "tr" | "en";

/** Interview topics in the order they are covered; each becomes a PROJECT.md section. */
export const TOPICS = [
	{ id: "purpose", tr: "Amaç ve kullanıcılar", en: "Purpose and users" },
	{ id: "scope", tr: "Kapsam: içinde / dışında", en: "Scope: in / out" },
	{ id: "structure", tr: "Yapı: modüller ve bağlar", en: "Structure: modules and links" },
	{ id: "flows", tr: "Akışlar", en: "Flows" },
	{ id: "data", tr: "Veri", en: "Data" },
	{ id: "deps", tr: "Dış bağımlılıklar ve servisler", en: "External dependencies and services" },
	{ id: "run", tr: "Kurulum, çalıştırma, dağıtım", en: "Setup, running, deployment" },
	{ id: "test", tr: "Test ve doğrulama", en: "Testing and verification" },
	{ id: "risks", tr: "Riskler, güvenlik, kısıtlar", en: "Risks, security, constraints" },
	{ id: "roadmap", tr: "Yol haritası", en: "Roadmap" },
	{ id: "glossary", tr: "Sözlük", en: "Glossary" },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];
export const TOPIC_IDS = TOPICS.map(t => t.id) as [TopicId, ...TopicId[]];

export function topicTitle(id: TopicId, lang: Lang): string {
	const topic = TOPICS.find(t => t.id === id);
	return topic ? topic[lang] : id;
}

/** `user`: the user's answer; `agent`: the user said "you decide"; `skipped`: left as an open question. */
export type Source = "user" | "agent" | "skipped";

export interface Entry {
	topic: TopicId;
	question: string;
	answer: string;
	source: Source;
	at: string;
}

export interface DocState {
	version: 1;
	lang: Lang;
	/** `paused`: the user stopped; `complete`: every topic done. */
	phase: "interview" | "paused" | "complete";
	topicsDone: TopicId[];
	/** Every answer ever given, across runs; update runs append. */
	entries: Entry[];
	completedAt?: string;
	/** `git rev-parse HEAD` when the interview completed; update runs diff against it. */
	completedCommit?: string;
	/** Written on every save for outside readers (DevDeck+): all topics in order, titled in `lang`. */
	topics?: { id: TopicId; title: string }[];
}

/** Where documentizer's documents live. */
export const docsDir = (root: string): string => path.join(root, "docs");
export const stateDir = (root: string): string => path.join(docsDir(root), ".documentizer");
export const stateFile = (root: string): string => path.join(stateDir(root), "state.json");

/** Files of the first layout, which kept everything in the project root. */
const ROOT_LAYOUT = [".documentizer", "PROJECT.md", "PROJECT.space", "PROJECT.space.layout", "PROJECT.space.assets"];

/**
 * Moves an interview made with the root layout into `docs/`; returns the names moved. Only when
 * `docs/` has no interview yet, and never over an existing file there.
 */
export function migrateRootLayout(root: string): string[] {
	if (!fs.existsSync(path.join(root, ".documentizer", "state.json")) || fs.existsSync(stateFile(root))) return [];
	fs.mkdirSync(docsDir(root), { recursive: true });
	const moved: string[] = [];
	for (const name of ROOT_LAYOUT) {
		const from = path.join(root, name);
		const to = path.join(docsDir(root), name);
		if (!fs.existsSync(from) || fs.existsSync(to)) continue;
		fs.renameSync(from, to);
		moved.push(name);
	}
	return moved;
}

export function newState(lang: Lang): DocState {
	return { version: 1, lang, phase: "interview", topicsDone: [], entries: [] };
}

export function loadState(root: string): DocState | undefined {
	let text: string;
	try {
		text = fs.readFileSync(stateFile(root), "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	const state = JSON.parse(text) as DocState;
	if (state.version !== 1) throw new Error(`${stateFile(root)}: unsupported state version ${state.version}`);
	return state;
}

export function saveState(root: string, state: DocState): void {
	fs.mkdirSync(stateDir(root), { recursive: true });
	const file = stateFile(root);
	const tmp = `${file}.${process.pid}.tmp`;
	const topics = TOPICS.map(t => ({ id: t.id, title: t[state.lang] }));
	fs.writeFileSync(tmp, `${JSON.stringify({ ...state, topics }, null, "\t")}\n`);
	fs.renameSync(tmp, file);
}

export function remainingTopics(state: DocState): TopicId[] {
	return TOPIC_IDS.filter(id => !state.topicsDone.includes(id));
}
