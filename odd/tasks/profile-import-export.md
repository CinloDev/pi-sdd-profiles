# ODD Tasks: Profile Export and Import in Dashboard Modal

**Feature**: Allow exporting and importing SDD profiles directly from the 3-column modal dashboard with universal TUI file browser and conflict resolution.
**Branch**: `feat/profile-import-export`
**Status**: Completed and Verified

## Tasks

- [x] Task 1: Add core `exportProfile` and `importProfile` methods with validation and scope control in `src/storage.ts` and `src/manager.ts`.
- [x] Task 2: Implement unit tests for storage and manager export/import functionality in `test/storage.test.ts` and `test/manager.test.ts`.
- [x] Task 3: Implement interactive modal sub-views (`export-profile` and `import-profile`) with destination/source path inputs, validation feedback, and scope selector.
- [x] Task 4: Bind keyboard shortcuts (`[x]` for export, `[i]` for import on Column 1) and update footer shortcut bar.
- [x] Task 5: Add comprehensive unit tests in `test/modal.test.ts` for export and import interactive flows (101/101 passing).
- [x] Task 7: Universal cross-platform TUI file browser for import (`📁 [Carpeta]` / `📄 [Perfil JSON]`, `.. (Subir de nivel)`, keyboard navigation with `↑/↓/Enter`, and `[m]` fallback for manual path).
- [x] Task 8: Import Conflict Resolution view: detects name collisions, offers `[1 / o] Sobreescribir`, `[2 / r] Renombrar` (suggesting filename as new name), or `[Esc] Cancelar`.
- [x] Task 6: Human verification gate and Git Flow compliance.
