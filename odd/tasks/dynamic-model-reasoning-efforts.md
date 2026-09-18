# ODD Tasks: Dynamic Model Reasoning Efforts

**Feature**: Filter and adapt reasoning effort options based on each model's actual capabilities (`reasoning`, `thinkingLevelMap`, `reasoningEfforts`).
**Branch**: `feat/dynamic-model-reasoning-efforts`
**Status**: Ready for Verification

## Tasks

- [x] Task 1: Extend `models-resolver.ts` to extract model metadata (`ModelMetadata` with `reasoning`, `thinkingLevelMap`, `reasoningEfforts`) from `ctx.modelRegistry`, `models.json`, and fallback configs.
- [x] Task 2: Implement `getSupportedEffortsForModel` utility and add unit tests in `test/models-resolver.test.ts`.
- [x] Task 3: Pass `modelsMetadata` to `createSddProfilesModal` and dynamically filter Column 3 (Effort / Thinking) based on the target's assigned model.
- [x] Task 4: Dynamically filter `renderEffortPicker` based on the staged model when assigning models or selecting effort.
- [x] Task 5: Add comprehensive unit tests in `test/modal.test.ts` verifying dynamic effort filtering for reasoning, non-reasoning, and custom level-mapped models.
- [x] Task 6: Human verification gate and Git Flow compliance.
