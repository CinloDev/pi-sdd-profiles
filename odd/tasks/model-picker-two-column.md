# ODD Tasks: Two-Column Master-Detail Model Picker

**Feature**: Redesign model picker modal into a full-width two-column layout divided by a vertical line: Providers/Accounts on the left, and Models for the focused provider on the right.
**Branch**: `feat/model-picker-two-column`
**Status**: Completed and Verified

## Tasks

- [x] Task 1: Group available models by provider/namespace prefix (`cpamc/cinlo`, `cpamc/cin82`, `anthropic`, `google`, etc.).
- [x] Task 2: Implement two-column master-detail TUI layout in `renderModelPicker` (left: Providers with count, vertical divider `│`, right: clean model names).
- [x] Task 3: Support seamless navigation between panels (`Tab`, `←`/`→`, `↑`/`↓`, and mouse click/selection).
- [x] Task 4: Keep real-time text filter working across both providers and models.
- [x] Task 5: Add comprehensive unit tests in `test/modal.test.ts` (105/105 passing).
- [x] Task 6: Smooth in-place model selection (eliminating disruptive full-screen jumps).
- [x] Task 7: Show currently assigned model in model picker header (`Actual: <model>`) and visual badge `● (actual)` on matching model.
- [x] Task 8: Deduplicate CPAM models and display clean account names (`cin82`, `cinlo`, etc.) without redundant `cpamc/` prefix.
- [x] Task 9: Standardize category names to English in `src/catalog.ts` (`SDD Core`, `Judgment Day`, `Reviewers & Auditors`, `General Harness`) and isolate category assignment so it never overwrites the orchestrator.
- [ ] Task 10: Human verification gate, commit, and PR to `develop`.
