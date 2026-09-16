# ODD Tasks: Configurable Shortcuts

**Feature**: Configurable keyboard shortcuts to avoid collision with pi-intercom and other extensions.
**Branch**: `feat/configurable-shortcuts`
**Status**: In Progress

## Tasks

- [x] Task 1: Create `src/shortcuts.ts` implementing `resolveShortcutsConfig()` and `updateShortcutsSettings()` reading from `.pi/settings.json` and `~/.pi/agent/settings.json`.
- [x] Task 2: Update `index.ts` to register shortcuts dynamically and avoid hardcoded duplicate collisions.
- [x] Task 3: Implement `/sdd-profile shortcut` CLI subcommand with `disable-alt`, `enable-alt`, `set`, and `reset` actions.
- [x] Task 4: Author unit tests in `test/shortcuts.test.ts` and ensure existing tests pass.
- [x] Task 5: Update `README.md` and `skills/sdd-profiles/SKILL.md` documenting shortcut customization and collision avoidance.
- [x] Task 6: Full verification with Vitest suite.
