# ODD Tasks: Dynamic Custom Agents Discovery

**Feature**: Discover custom agents dynamically from project/global `subagents.json` and existing profile configurations, rendering them in an accordion category `Custom Agents` alongside the default SDD categories, making the extension 100% universal for any Pi user.
**Branch**: `feat/dynamic-custom-agents`
**Status**: In Progress

## Tasks

- [ ] Task 1: Research and design agent discovery helper (inspecting `.pi/subagents.json`, `~/.pi/agent/subagents.json`, and profile `model_profiles`).
- [ ] Task 2: Implement dynamic discovery in `src/manager.ts` / `src/catalog.ts` returning known + discovered custom agents.
- [ ] Task 3: Render `Custom Agents` accordion section in `src/modal.ts` Column 2 tree for non-SDD agents.
- [ ] Task 4: Support assignment, batch assignment, and effort configuration for custom agents without regressions.
- [ ] Task 5: Unit and integration tests covering dynamic discovery and custom agent management (Vitest).
- [ ] Task 6: Human verification gate, work-unit commits, and PR to `develop`.
