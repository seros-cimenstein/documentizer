[documentizer] Document the project at `{{ROOT}}` by mapping its structure and interviewing me.

Mode: **{{MODE}}**. Interview language: **{{LANG}}**: every question, choice, ELI5 text and all of PROJECT.md in {{LANG}} (code identifiers stay as they are).
State file (managed by the tools, do not edit): `{{STATE_FILE}}`.

Topics (each becomes a PROJECT.md section, covered in this order):
{{TOPICS}}

## Outputs, in `{{DOCS}}`
- `PROJECT.md`: title + one-line summary, then one section per topic, then **Map** (the output of `loren mermaid {{DOCS}}/PROJECT.space`), **Decisions** (answers I left to you, marked as agent decisions), **Open questions** (skipped or unanswered items). It is the specification `/strictly-docs` implements from, so write what must be built, concretely enough to build it.
- `PROJECT.space`: the visual map. Run `loren guide` once first. Create it with `loren new {{DOCS}}/PROJECT.space --title "<project>" --root {{ROOT}} --pack software` if missing; grow it with `loren apply` in small steps (1-6 ops per call) as you learn, following the Loren Space skill. Keep it at 8-25 nodes.
- `MISSING.md` is written by `/strictly-docs`, not by you: what it had to build without the documents saying how, under the PROJECT.md section it belongs to. See step 1.

## 1. Lay down the structure (before asking anything)
- **new**: If the folder has code, map it: README, manifests, entry points, top-level folders, how parts call each other (fan out read-only scouts for a large repo). Write a first PROJECT.md draft with what the code proves, each claim with its file path, and build the first PROJECT.space. If there is no code, write a skeleton PROJECT.md with the topic headings and start the interview from purpose.
- **resume**: Read PROJECT.md and the state file's `entries`; continue at the first unchecked topic. Never re-ask an answered question.
- **update**: The interview finished before. Read PROJECT.md and the state file. Find what changed since commit `{{SINCE}}` (`git diff --stat {{SINCE}}..HEAD`, `git log`, plus uncommitted work), update the draft and the map from the code, and in each topic ask only about what changed, went stale, or is still open. A topic with nothing to ask is confirmed with one question, then marked done.
- **Any mode**, when `{{DOCS}}/MISSING.md` exists: each entry is a gap `/strictly-docs` filled with its own solution. In the topic of its section, ask me about it (context: what was missing, what was built, where), with "keep this solution" as the recommended choice. Write the answer into PROJECT.md, then delete the entry from MISSING.md and its MISSING card from PROJECT.space (`loren apply`); delete MISSING.md when it is empty.

## 2. Interview, topic by topic
- Ask with `doc_ask` only, exactly ONE question per call, never several tools at once, never the generic `ask` tool. Wait for each answer before choosing the next question.
- Never ask what the code already answers. Instead confirm it: "From `src/x.ts` I see ...; correct?" with choices like correct / partly / wrong.
- Every question: 2-5 concrete choices when possible, your recommendation in `recommended`, a short `context` saying why you ask (what you found), and an `eli5` that explains the question with an everyday analogy, defines every technical word, and says what each choice would mean in practice.
- Go to the full extent of the scope: stay on a topic until nothing in it is unknown, contradictory or unverified. Follow up on vague answers ("fast" → how fast? for whom?).
- After each answer, update PROJECT.md (and PROJECT.space when structure, flows, data or dependencies changed) right away, so a stop loses nothing.
- When a topic has no gaps left: make sure its PROJECT.md section is final, then call `doc_topic`. Then go on to the next topic it names.
- Results: "you decide" → note it as an agent decision; skip → add to open questions; stop/cancel → update PROJECT.md and end your turn without asking more.

## 3. Finish
When `doc_topic` reports the interview complete: run `loren tidy {{DOCS}}/PROJECT.space` only if I never arranged it by hand, embed `loren mermaid {{DOCS}}/PROJECT.space` under Map, make sure Decisions and Open questions are complete, then give me a short summary in {{LANG}}: what was documented, what is still open, and that `/strictly-docs` can now build from it.
