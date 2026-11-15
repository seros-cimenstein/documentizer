---
description: Build this project strictly from docs/PROJECT.md (documentizer); gaps filled on your own go to docs/MISSING.md and the map
argument-hint: "[topic id | section | feature; empty = everything]"
---

Implement this project strictly from its documentation. Target: `$ARGUMENTS`

## The rules
- `docs/PROJECT.md` (written by `/documentize`) is the only specification. Build what it says, the way it says: names, structure, data formats, flows, dependencies, setup and tests. Add nothing it does not ask for; never build what its Scope section puts out of scope.
- `docs/PROJECT.md` is read-only here. Do not change one character of it; only `/documentize` does. You write code, `docs/MISSING.md` and the status marks and MISSING cards on `docs/PROJECT.space`, nothing else under `docs/`.
- Never ask me anything. Where the documents do not say how to build something you need, choose the most conservative solution that fits the rest of the documents, build it, and record it as a gap (step 5).
- Language: the `lang` in `docs/.documentizer/state.json` (`tr` = Turkish, `en` = English) for everything you write in prose: MISSING.md (header included), the MISSING cards, your progress messages and the final report. Code and identifiers stay as the documents name them.

## Steps
1. **Check.** No `docs/PROJECT.md` → tell me to run `/documentize` first and stop. Read `docs/.documentizer/state.json`: if `phase` is not `complete`, go on, but name the unfinished topics in the report.
2. **Read the spec.** All of `docs/PROJECT.md`, `docs/MISSING.md` if it exists (earlier gaps: keep their solutions unless PROJECT.md now says otherwise), and `loren show docs/PROJECT.space`. Run `loren guide` once before changing the map.
3. **Target.**
   - Empty: everything in PROJECT.md.
   - A topic id (`purpose`, `scope`, `structure`, `flows`, `data`, `deps`, `run`, `test`, `risks`, `roadmap`, `glossary`) or a section title: that section, plus what it needs from the others.
   - Anything else: the feature or item it names. Matching more than one place → take the section it fits best and say which in the report.
4. **Compare, then build.** For the target, list each requirement as done / partial / todo against the code (fan out read-only scouts for a large project). Build the partial and todo ones. Code that contradicts the documents is brought in line with them; existing code the documents do not mention stays as it is.
5. **Gaps → `docs/MISSING.md`.** Every decision you made because the documents were silent, under the PROJECT.md section heading it belongs to (same heading text, same order as PROJECT.md). Create the file with this header if it does not exist:
   ```markdown
   # MISSING

   Gaps /strictly-docs filled without the documents saying how. /documentize asks about each one and moves the answer into PROJECT.md.

   ## <PROJECT.md section heading>
   - **<short title>** (<YYYY-MM-DD>)
     - Missing: what the documents did not say
     - Built: the solution you chose and why it is the conservative one
     - Where: `path/to/file:line`, ...
     - Alternatives: other reasonable choices
   ```
   A gap already listed: update its entry instead of adding a second one.
6. **Map.** On `docs/PROJECT.space` (`loren apply`, small steps):
   - set the `status` field of every node your work touched to `done`, `partial` or `todo` (loren warns that `status` is not declared on the kind; that is expected, leave the kinds alone);
   - for each new gap, add a `note` card titled `MISSING: <short title>` whose body is its Missing / Built lines, linked to the node it concerns (the closest one when none fits exactly); update the card of a gap already listed.
   - Never add, rename or remove other nodes or links: the map's structure belongs to `/documentize`.
7. **Verify.** Run the checks the "Test" section of PROJECT.md prescribes (else the project's own tests and build) for what you changed. Fix failures within the documents' rules.
8. **Report**, short: what was built per section; the gaps you filled (MISSING.md entries); contradictions you fixed; checks run and their result; unfinished interview topics. End with: run `/documentize` to settle the MISSING items into PROJECT.md.
