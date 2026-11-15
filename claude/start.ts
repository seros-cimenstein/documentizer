/**
 * `bun claude/start.ts <project dir> [--lang tr|en]`: the `/documentizer:documentize` skill runs this
 * through dynamic context injection. It starts, resumes or reopens the interview (same as omp's
 * `/documentize`) and prints the agent prompt, which becomes the skill's content.
 */
import { parseArgs, startInterview } from "../extension/interview";

const [root, ...rest] = process.argv.slice(2);
try {
	if (!root) throw new Error("usage: start.ts <project dir> [--lang tr|en]");
	const { mode, state, moved, prompt } = startInterview(root, parseArgs(rest.join(" ")).lang);
	if (moved.length > 0) console.log(`(documentizer moved ${moved.join(", ")} into docs/)\n`);
	console.log(`(documentizer: ${mode} in ${root}, ${state.lang})\n`);
	console.log(prompt);
} catch (error) {
	console.error(`documentize: ${error instanceof Error ? error.message : error}`);
	process.exit(1);
}
