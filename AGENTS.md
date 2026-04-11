# AGENTS.md - Workspace Guide

This workspace is `brain`, a local Flask app for collecting and organizing inspirations.
It inherits the global default workflow from `C:\Users\Administrator\.codex\AGENTS.md` and then adds project-specific guidance below.

## Every Session

Before making changes:

1. Read `SOUL.md`.
2. Read `USER.md`.
3. Read `MEMORY.md`.
4. Read `HEARTBEAT.md`.
5. Check `README.md`, `app.py`, and the relevant templates or tests.

## Working Style

- Keep the vibe fast, visual, and practical.
- Prefer shipping small improvements over building abstract systems.
- Preserve the existing app shape unless there is a clear reason to change it.
- When touching UI, keep it simple and polished.
- When touching behavior, verify the path from input to storage to rendering.

## Project Notes

- Local dev runs on `http://localhost:5001`.
- Use `dev.bat` for source-mode iteration.
- Use `python app.py` when you just need a direct local run.

## Memory

Use `MEMORY.md` for durable context, preferences, and project notes.
Use `HEARTBEAT.md` for periodic review and cleanup reminders.
