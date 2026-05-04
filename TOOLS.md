# TOOLS.md - Workspace Notes

Use this file for environment-specific notes that are unique to this setup.

## What Belongs Here

- Local services and ports
- Preferred commands
- File locations worth remembering
- Any workspace-specific conventions

## Current Setup

- Desktop app: `desktop/`
- Dev server: `cd desktop && npm start`
- Lint: `cd desktop && npm run lint`
- Tests: `cd desktop && npm test`
- Package: `cd desktop && npm run make`
- Windows installer: `npm run make` packages with Forge, then uses electron-builder NSIS to create a selectable-directory `.exe`; close `npm start` first.
