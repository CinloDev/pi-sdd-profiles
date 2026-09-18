# ODD Tasks: Expand Modal Visible Height to 15 Rows

**Feature**: Expand visible rows in 3-column dashboard, model picker, and file browser from 10 to 15 (adaptive based on terminal height).
**Branch**: `feat/expand-modal-visible-rows`
**Status**: Ready for Verification

## Tasks

- [x] Task 1: Compute dynamic `maxVisible` (default 15, adaptively clamped based on terminal height) in `src/modal.ts`.
- [x] Task 2: Apply adaptive 15 visible rows across 3-column dashboard, model-picker, and import file browser.
- [x] Task 3: Update existing tests and add unit tests verifying 15-row display and small-terminal bounds (103/103 passing).
- [ ] Task 4: Human verification gate, commit, PR to `develop`, and merge.
