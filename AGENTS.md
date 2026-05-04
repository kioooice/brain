# AGENTS.md - Workspace Guide

This workspace is `brain`, an Electron desktop app for collecting and organizing inspirations locally.
This file is the project-level guide. When it conflicts with broader/global instructions, prefer this file for work inside this repository.

## Default Style

- Keep replies short, direct, and product-focused.
- Do not turn routine development into a process report.
- Do not repeat packaging, installer, runtime, or skipped-test disclaimers unless they are directly relevant to the task.
- Do not ask for permission to continue normal feature development; keep moving until there is a real decision or risk.
- Give the user something concrete to try after meaningful UI or workflow changes.

## Context

- Read `SOUL.md`, `USER.md`, `MEMORY.md`, and `HEARTBEAT.md` when starting a new session, resuming old work, or when context is unclear.
- For small localized edits, read only the files needed for the task.
- Use `MEMORY.md` for durable facts and preferences, but do not echo memory notes in every response.
- Update memory files only when the change adds stable project context.

## Development

- Desktop work lives under `desktop/`.
- Desktop dev runs from `desktop/` with `npm start`.
- The old Flask web app has been removed; do not add new capture work there.
- Keep the vibe fast, visual, and practical.
- Prefer shipping small improvements over building abstract systems.
- Preserve the existing app shape unless there is a clear reason to change it.
- When touching UI, keep it simple and polished.
- When touching behavior, verify the path from input to storage to rendering.

## Verification

- For behavior changes, run the focused test first, then `npm run lint` and `npm test` when practical.
- For pure documentation or instruction edits, no app test is required.
- Mention only verification that was actually run.

## Reporting

- Final replies should usually be 3-8 short lines.
- Lead with what changed and what the user can now do.
- Include changed files only when useful.
- Give next-step options only when there is a real choice.
- If the next step is obvious, state the recommended next step in one sentence.
