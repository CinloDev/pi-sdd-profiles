# ODD Tasks: Dynamic Custom Agents Discovery

**Feature**: Discover custom agents dynamically from project/global `subagents.json` and existing profile configurations, rendering them in an accordion category `Custom Agents` alongside the default SDD categories, making the extension 100% universal for any Pi user.
**Branch**: `feat/dynamic-custom-agents`
**Status**: Ready for Verification

## Tasks

- [x] Task 1: Research and design agent discovery helper (inspecting `.pi/subagents.json`, `~/.pi/agent/subagents.json`, and profile `model_profiles`).
- [x] Task 2: Implement dynamic discovery in `src/manager.ts` / `src/catalog.ts` returning known + discovered custom agents.
- [x] Task 3: Render `Custom Agents` accordion section in `src/modal.ts` Column 2 tree for non-SDD agents.
- [x] Task 4: Support assignment, batch assignment, and effort configuration for custom agents without regressions.
- [x] Task 4b: Support scanning `.pi/agents/` and `~/.pi/agent/agents/` directories (`.md`, `.json`, `.yaml`) for custom subagent discovery.
- [x] Task 5: Unit and integration tests covering directory scanning and subagents.json (115/115 passing).
- [ ] Task 6: Human verification gate, work-unit commits, and PR to `develop`.
