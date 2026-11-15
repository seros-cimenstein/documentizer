# documentizer

omp add-on that maps a project's structure and interviews you, one question at a time, until every topic of its scope is written down.

## Install

```bash
./install.sh   # links extension/ to ~/.omp/agent/extensions/documentizer
```

Restart omp. The map needs `loren` (Loren Space) on PATH.

## Use

| | |
|---|---|
| `/documentize` | Start, resume or update the interview for the current directory (Turkish) |
| `/documentize --lang en` | Same in English; the language is remembered for later runs |

What happens:

1. **Structure first.** With code present, the agent maps it (README, manifests, entry points, how parts call each other) into a first `PROJECT.md` draft and a `PROJECT.space` map. Without code it starts from the purpose.
2. **Interview.** Topics in order: purpose and users, scope, structure, flows, data, external dependencies, setup/run/deploy, testing, risks, roadmap, glossary. One question per form; facts the code answers are only confirmed, not asked. A topic ends when nothing in it is unknown.
3. **Every question** offers the agent's choices (its recommendation preselected), free-text "Other", and:
   - **ELI5**: re-shows the question with a plain-language explanation the agent prepared up front, instantly, no model turn
   - **You decide**: the recommendation is recorded as an agent decision
   - **Skip**: goes to open questions
   - **Stop**: pauses; run `/documentize` later to continue where you left off
4. **Re-runs.** A paused interview resumes. A finished one is updated: the agent diffs the code since the commit recorded at completion and asks only about what changed or is still open.

Forms are omp's `ui.formDialog`, so DevDeck+ can answer them from the phone.

## Files it writes (project root)

- `PROJECT.md`: one section per topic, Map (mermaid from `loren mermaid`), Decisions, Open questions
- `PROJECT.space`: Loren Space map, grows live during the interview
- `.documentizer/state.json`: language, phase, finished topics, every answer with its source (`user` / `agent` / `skipped`)

## Repo

- `extension/index.ts`: `/documentize`, `doc_ask` (one question form + recording), `doc_topic` (topic done, completion)
- `extension/form.ts`: form HTML and answer parsing
- `extension/state.ts`: topics and `.documentizer/state.json`
- `extension/prompts/documentize.md`: the agent's instructions (structure scan, interview rules, outputs)
- `tests/`: `bun test`
