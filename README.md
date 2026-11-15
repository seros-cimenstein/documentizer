# documentizer

Add-on for omp and Claude Code that maps a project's structure and interviews you, one question at a time, until every topic of its scope is written down in `docs/`; then `/strictly-docs` builds the project from those documents.

Both need `bun` and, for the map, `loren` (Loren Space) on PATH. A project's `docs/` is shared: start the interview in one, continue or build in the other.

## Install

### omp

```bash
./install.sh   # links extension/ to ~/.omp/agent/extensions/documentizer
               # and commands/strictly-docs.md to ~/.omp/agent/commands/
```

Restart omp.

### Claude Code

The repo is a plugin and its own marketplace:

```bash
claude plugin marketplace add ~/projects/seref_omp_tools/documentizer
claude plugin install documentizer@documentizer
```

Or for one session: `claude --plugin-dir ~/projects/seref_omp_tools/documentizer`. The commands are namespaced: `/documentizer:documentize [--lang tr|en]` and `/documentizer:strictly-docs [target]`, otherwise as below. Questions open as Claude Code dialogs (MCP elicitation): pick a choice, add free text in "Other / note", and choose the action (answer, ELI5, you decide, skip, stop); Esc or decline pauses the interview like Stop. DevDeck+ is omp-only.

## Use

| | |
|---|---|
| `/documentize` | Start, resume or update the interview for the current directory (Turkish) |
| `/documentize --lang en` | Same in English; the language is remembered for later runs |
| `/strictly-docs` | Build everything `docs/PROJECT.md` describes |
| `/strictly-docs data` | Build one topic (`purpose`, `scope`, `structure`, `flows`, `data`, `deps`, `run`, `test`, `risks`, `roadmap`, `glossary`), a section, or a named feature |

### `/documentize`

1. **Structure first.** With code present, the agent maps it (README, manifests, entry points, how parts call each other) into a first `docs/PROJECT.md` draft and a `docs/PROJECT.space` map. Without code it starts from the purpose.
2. **Interview.** Topics in order: purpose and users, scope, structure, flows, data, external dependencies, setup/run/deploy, testing, risks, roadmap, glossary. One question per form; facts the code answers are only confirmed, not asked. A topic ends when nothing in it is unknown.
3. **Every question** offers the agent's choices (its recommendation preselected), free-text "Other", and:
   - **ELI5**: re-shows the question with a plain-language explanation the agent prepared up front, instantly, no model turn
   - **You decide**: the recommendation is recorded as an agent decision
   - **Skip**: goes to open questions
   - **Stop**: pauses; run `/documentize` later to continue where you left off
4. **Re-runs.** A paused interview resumes. A finished one is updated: the agent diffs the code since the commit recorded at completion and asks only about what changed or is still open.
5. **MISSING items.** Each entry `/strictly-docs` left in `docs/MISSING.md` is asked about in its topic ("keep this solution" recommended); the answer goes into PROJECT.md and the entry and its map card are removed.

### `/strictly-docs`

The agent builds from `docs/PROJECT.md` as the only specification, without asking anything:
- it builds what the documents say, the way they say it, and nothing out of scope; code contradicting them is brought in line;
- `docs/PROJECT.md` is read-only for it;
- where the documents are silent it picks the most conservative fitting solution, builds it and records it in `docs/MISSING.md` under the PROJECT.md section it belongs to (missing, built, where, alternatives);
- on `docs/PROJECT.space` it sets the `status` field (`done` / `partial` / `todo`) of the nodes it worked on and adds a `MISSING: …` note card per gap, linked to its node;
- it runs the checks the Test section prescribes and reports in the interview language.

`/documentize` then settles the MISSING items into PROJECT.md.

## On the phone (DevDeck+)

With DevDeck+ (`~/projects/quality_of_life_setups/devdeck-plus`), questions open in its question sheet with the interview's progress (topics done, current topic) on top; ELI5 swaps the explanation in without closing the sheet. A banner on the terminal shows the interview's state with Continue/Update. Session menu → Documentizer... starts or continues `/documentize`, runs `/strictly-docs`, and opens `docs/PROJECT.md`, `docs/MISSING.md` and the map. DevDeck+ reads `docs/.documentizer/state.json`, so keep its `phase`, `lang`, `topicsDone` and `topics` fields stable.

## Files (in `docs/`)

- `PROJECT.md`: one section per topic, Map (mermaid from `loren mermaid`), Decisions, Open questions
- `PROJECT.space`: Loren Space map, grows live during the interview; `/strictly-docs` marks status and MISSING cards on it
- `MISSING.md`: gaps `/strictly-docs` filled on its own, by PROJECT.md section, until `/documentize` settles them
- `.documentizer/state.json`: language, phase, finished topics, every answer with its source (`user` / `agent` / `skipped`), and the topic list titled in the interview language (for DevDeck+)

An interview made before these lived in `docs/` (files in the project root) is moved into `docs/` by the next `/documentize`; nothing in `docs/` is overwritten.

## Repo

- `extension/interview.ts`: the shared core: starting/resuming/updating, the `doc_ask` question loop and recording, `doc_topic` completion, tool texts
- `extension/index.ts`: omp adapter: `/documentize`, `doc_ask` (omp form), `doc_topic`
- `extension/form.ts`: omp form HTML, answer parsing, UI labels
- `extension/state.ts`: topics, `docs/.documentizer/state.json`, the move from the root layout
- `extension/prompts/documentize.md`: the agent's instructions (structure scan, interview rules, outputs, MISSING items)
- `commands/strictly-docs.md`: the `/strictly-docs` command (omp and Claude Code)
- `.claude-plugin/`: Claude Code plugin manifest (declares the MCP server) and marketplace
- `skills/documentize/SKILL.md`: Claude Code `/documentizer:documentize`; runs `claude/start.ts` to render the prompt
- `claude/server.ts`: dependency-free stdio MCP server with `doc_ask` / `doc_topic`; `claude/elicit.ts`: the question as an elicitation form
- `tests/`: `bun test`
