# ODD Tasks: Collapsible Category Accordion in Agent Column

**Feature**: Reorganize the agents column into a collapsible category tree/accordion (VS Code explorer style).
**Branch**: `feat/collapsible-category-accordion`
**Status**: Completed / Ready for Verification

## Tasks

- [x] Task 1: Design hierarchical item model (`TreeItem`) and category expansion state (`expandedCategories: Set<string>`).
- [x] Task 2: Implement dynamic visible list computation and tree rendering in Column 2 with folder indicators (`▼ / ►`), category counts, and indented children.
- [x] Task 3: Implement keyboard interactions (`Space` or `Left/Right` to toggle expand/collapse, `Enter`/`m` on category to assign model in bulk, `Enter` on child to assign individual model, `c` to jump to categories).
- [x] Task 4: Connect Column 3 (Effort) reactively for both category headers and individual agent items.
- [x] Task 5: Adapt mouse click and double-click handling for category headers (click to toggle collapse/expand, double-click to assign model).
- [x] Task 6: Update and expand unit tests in `test/modal.test.ts` to verify tree navigation, category folding, and bulk assignment (85/85 tests passing).
