# ODD Tasks: Local Profile Activation

**Feature**: Support project-local active profile selection, isolated .active state, and decoupled reconciliation.
**Branch**: `feat/local-profile-activation`
**Status**: In Progress

## Tasks

- [x] Task 1: Update ProfileStorage (`src/storage.ts`) to manage isolated `.active` for project vs global scopes and hierarchical resolution.
- [x] Task 2: Update SddProfileManager (`src/manager.ts`) to support target-scoped activation, isolated state getters, and targeted reaffirmation.
- [x] Task 3: Update SubagentsConfigWatcher (`src/watcher.ts`) to reconcile global and project files against their respective active profiles without cross-contamination.
- [x] Task 4: Update Modal UI (`src/modal.ts` & `src/modal-formatting.ts`) to prompt for scope selection upon Enter (`[1] Solo en este proyecto` vs `[2] Global para toda la máquina`) and show scope status.
- [x] Task 5: Update CLI commands (`index.ts`) and list formatting (`src/ui.ts`) to display and manage project vs global active profiles cleanly.
- [x] Task 6: Add and update unit tests for storage, manager, watcher, and modal scope selection.
- [x] Task 7: Full verification with Vitest suite.
