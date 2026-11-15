/**
 * documentizer's MCP server for the Claude Code plugin: the `doc_ask` and `doc_topic` tools over
 * stdio (newline-delimited JSON-RPC). `doc_ask` shows its question through MCP elicitation, so
 * ELI5 re-shows the dialog without a model turn, as in omp.
 *
 * The project is `DOCUMENTIZER_ROOT` (`${CLAUDE_PROJECT_DIR}` in `.mcp.json`), else the cwd.
 * Dependency-free on purpose: plugins have no install step.
 */
import * as readline from "node:readline";
import type { Choice } from "../extension/form";
import { type AskParams, ask, finishTopic, TOOL_DOCS } from "../extension/interview";
import { TOPIC_IDS, type TopicId } from "../extension/state";
import { buildElicitation, readElicited } from "./elicit";

const root = process.env.DOCUMENTIZER_ROOT || process.cwd();

type Id = string | number;
type Obj = Record<string, unknown>;
interface Message {
	id?: Id | null;
	method?: string;
	params?: Obj;
	result?: unknown;
	error?: { code: number; message: string };
}

const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);

function send(message: Message): void {
	process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

// Requests this server sends to the client (elicitations), by id.
const pending = new Map<Id, PromiseWithResolvers<unknown>>();
let nextId = 0;
function request(method: string, params: Obj): Promise<unknown> {
	const id = `documentizer-${++nextId}`;
	const waiter = Promise.withResolvers<unknown>();
	pending.set(id, waiter);
	send({ id, method, params });
	return waiter.promise;
}

let canElicit = false;

const askDocs = TOOL_DOCS.ask.params;
const TOOLS = [
	{
		name: "doc_ask",
		description: TOOL_DOCS.ask.description,
		inputSchema: {
			type: "object",
			properties: {
				topic: { type: "string", enum: TOPIC_IDS, description: askDocs.topic },
				question: { type: "string", description: askDocs.question },
				context: { type: "string", description: askDocs.context },
				eli5: { type: "string", description: askDocs.eli5 },
				choices: {
					type: "array",
					items: {
						type: "object",
						properties: { value: { type: "string" }, label: { type: "string" } },
						required: ["value", "label"],
					},
					description: askDocs.choices,
				},
				recommended: { type: "array", items: { type: "string" }, minItems: 1, description: askDocs.recommended },
				multi: { type: "boolean", description: askDocs.multi },
			},
			required: ["topic", "question", "eli5", "choices", "recommended"],
		},
	},
	{
		name: "doc_topic",
		description: TOOL_DOCS.topic.description,
		inputSchema: {
			type: "object",
			properties: { topic: { type: "string", enum: TOPIC_IDS, description: TOOL_DOCS.topic.params.topic } },
			required: ["topic"],
		},
	},
];

function topicArg(value: unknown): TopicId {
	if (!TOPIC_IDS.includes(value as TopicId)) throw new Error(`topic must be one of ${TOPIC_IDS.join(", ")}`);
	return value as TopicId;
}

function stringArg(args: Obj, key: string): string {
	const value = args[key];
	if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string`);
	return value;
}

function askArgs(args: Obj): AskParams {
	const choices = args.choices ?? [];
	if (!Array.isArray(choices) || !choices.every(c => isObj(c) && typeof c.value === "string" && typeof c.label === "string"))
		throw new Error("choices must be a list of { value, label }");
	const recommended = args.recommended;
	if (!Array.isArray(recommended) || recommended.length === 0 || !recommended.every(r => typeof r === "string"))
		throw new Error("recommended must list at least one string");
	return {
		topic: topicArg(args.topic),
		question: stringArg(args, "question"),
		context: typeof args.context === "string" ? args.context : undefined,
		eli5: stringArg(args, "eli5"),
		choices: choices as Choice[],
		recommended: recommended as string[],
		multi: args.multi === true,
	};
}

async function callTool(name: unknown, args: Obj): Promise<string> {
	switch (name) {
		case "doc_ask": {
			if (!canElicit) throw new Error("doc_ask needs an interactive Claude Code session (MCP elicitation)");
			const params = askArgs(args);
			return ask(root, params, async view => {
				const result = await request("elicitation/create", { ...buildElicitation(params, view) });
				// decline and cancel (Esc) pause the interview, like closing the omp form.
				if (!isObj(result) || result.action !== "accept") return { kind: "cancel" };
				return readElicited(params, view, isObj(result.content) ? result.content : {});
			});
		}
		case "doc_topic":
			return finishTopic(root, topicArg(args.topic));
		default:
			throw new Error(`unknown tool: ${name}`);
	}
}

async function handle(message: Message): Promise<void> {
	const { id, method, params = {} } = message;
	if (method === undefined) {
		// A response to one of our requests.
		const waiter = id == null ? undefined : pending.get(id);
		if (!waiter) return;
		pending.delete(id!);
		if (message.error) waiter.reject(new Error(message.error.message));
		else waiter.resolve(message.result);
		return;
	}
	if (id == null) return; // notifications: nothing to do
	let result: unknown;
	switch (method) {
		case "initialize": {
			const capabilities = isObj(params.capabilities) ? params.capabilities : {};
			canElicit = capabilities.elicitation !== undefined;
			result = {
				protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-06-18",
				capabilities: { tools: {} },
				serverInfo: { name: "documentizer", version: "1.0.0" },
			};
			break;
		}
		case "ping":
			result = {};
			break;
		case "tools/list":
			result = { tools: TOOLS };
			break;
		case "tools/call":
			try {
				const text = await callTool(params.name, isObj(params.arguments) ? params.arguments : {});
				result = { content: [{ type: "text", text }] };
			} catch (error) {
				result = { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
			}
			break;
		default:
			send({ id, error: { code: -32601, message: `method not found: ${method}` } });
			return;
	}
	send({ id, result });
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", line => {
	if (!line.trim()) return;
	let message: unknown;
	try {
		message = JSON.parse(line);
	} catch {
		send({ id: null, error: { code: -32700, message: "parse error" } });
		return;
	}
	// Not awaited: a tool call waits on an elicitation whose answer arrives on this same stream.
	if (isObj(message)) void handle(message as Message);
});
lines.on("close", () => {
	for (const waiter of pending.values()) waiter.reject(new Error("client disconnected"));
	process.exit(0);
});
