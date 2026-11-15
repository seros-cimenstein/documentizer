---
description: Map this project and interview the user topic by topic, one question at a time, into docs/PROJECT.md + docs/PROJECT.space (documentizer). Starts, resumes or updates the interview.
argument-hint: "[--lang tr|en]"
disable-model-invocation: true
allowed-tools: Bash(bun ${CLAUDE_PLUGIN_ROOT}/claude/start.ts *) mcp__plugin_documentizer_documentizer__doc_ask mcp__plugin_documentizer_documentizer__doc_topic
---

!`bun ${CLAUDE_PLUGIN_ROOT}/claude/start.ts "${CLAUDE_PROJECT_DIR}" $ARGUMENTS`

In this session `doc_ask` and `doc_topic` are the documentizer MCP server's tools (`mcp__plugin_documentizer_documentizer__doc_ask`, `mcp__plugin_documentizer_documentizer__doc_topic`). Each `doc_ask` opens a dialog; never use `AskUserQuestion` for the interview. These instructions hold for the whole interview, across turns.
