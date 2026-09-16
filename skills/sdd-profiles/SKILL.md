---
name: sdd-profiles
description: "Manage, create, version, and switch SDD and subagent model profiles in Pi without losing session context."
license: MIT
metadata:
  author: cinlodev
  version: "1.0"
---

# SDD Profiles Skill

This skill guides the agent and user in managing named model profiles for Spec-Driven Development (SDD), Judgment Day, and general subagents.

## Registry Contract

```json
{
  "category": "workflow",
  "domains": [
    "sdd-profiles",
    "model-profiles",
    "subagent-models",
    "profile-switching",
    "sdd-configuration"
  ],
  "triggers": {
    "paths": [
      ".pi/profiles/**/*.json",
      "~/.pi/agent/profiles/**/*.json",
      ".pi/subagents.json",
      "~/.pi/agent/subagents.json"
    ],
    "keywords": [
      "sdd profile",
      "sdd profiles",
      "perfil sdd",
      "perfiles sdd",
      "cambiar perfil",
      "switch profile",
      "model profile",
      "crear perfil",
      "subagent profile"
    ]
  }
}
```

## Overview

`pi-sdd-profiles` allows switching and configuring model profiles for subagents in hot runtime. Switching profiles never loses the main chat context or restarts the agent session. It updates `subagents.json` atomically and immediately affects newly dispatched subagent tasks.

## Storage and Scope Hierarchy

Profiles are loaded with hierarchical precedence:
1. **Project Scope (`.pi/profiles/<name>.json`)**: Overrides matching global and builtin profiles for the current repository.
2. **Global User Scope (`~/.pi/agent/profiles/<name>.json`)**: User's custom profiles accessible across all repositories.
3. **Built-in Templates (`profiles/<name>.json`)**: Default standard profiles bundled with the package (`balanced-default`, `deep-reasoning`, `speed-economy`).

## Available Commands

| Command | Description |
|---|---|
| `/sdd-profile` | Opens interactive UI selector (or use shortcut `alt+m` / `ctrl+shift+m`). |
| `/sdd-profile list` | Lists available profiles and shows which is currently active. |
| `/sdd-profile apply <name> [--project]` | Activates a profile by name (globally or locally for current project). |
| `/sdd-profile shortcut [disable-alt\|enable-alt\|set\|reset]` | Inspects or customizes shortcut keybindings to avoid collisions with other extensions. |
| `/sdd-profile unset [--global]` | Clears project-level active profile override (or global if flagged), reverting to default. |
| `/sdd-profile clear-local` | Alias for unset, clears project-level active profile override. |
| `/sdd-profile create <name> [model] [effort] [--project]` | Creates a new profile. If arguments are omitted, launches the interactive wizard. |
| `/sdd-profile save <name> [desc] [--project]` | Takes a snapshot of current `subagents.json` settings and saves it as a profile. |
| `/sdd-profile show <name>` | Shows detailed model and reasoning effort assignments by phase. |
| `/sdd-profile set <profile> <agent> <model> [effort]` | Assigns a specific model to an agent in a profile. |
| `/sdd-profile rename <name> <new-name>` | Renames an existing profile and updates active state if needed. |
| `/sdd-profile delete <name>` | Deletes any profile (including builtins/templates). |

## Programmatic Tools for Orchestrators

When operating as an autonomous orchestrator, you can inspect, switch, or manage profiles programmatically:

- `sdd_profile_list`: Returns the active profile and list of all available profiles with metadata.
- `sdd_profile_switch(profile_name, scope?)`: Activates a profile in `global` (default) or `project` configuration.
- `sdd_profile_rename(old_name, new_name)`: Renames a custom profile safely.
- `sdd_profile_delete(profile_name)`: Deletes a custom profile and cleans active state if needed.

## Strategic Model Allocation Guidelines

- **Exploration & Scouting (`sdd-explore`, `gentle-ai-explore`)**:
  - Prefer fast, high-context, low-cost models (e.g. `claude-haiku-4-5`, `gemini-flash`).
  - Low reasoning effort (`effort: "low"`).
- **Proposals & Architecture (`sdd-propose`, `sdd-spec`, `sdd-design`)**:
  - Prefer strong reasoning frontier models (e.g. `claude-sonnet-4-5`, `o3-mini`).
  - High or max reasoning effort (`effort: "high"` or `"max"`).
- **Implementation & Triangulation (`sdd-apply`, `gentle-ai-worker`)**:
  - Balanced or frontier coding models with moderate to high effort.
- **Verification & Testing (`sdd-verify`, `gentle-ai-verify`)**:
  - Fast models capable of tool execution and log interpretation.
- **Judgment Day (`jd-judge-a`, `jd-judge-b`, `jd-fix-agent`)**:
  - Independent, cross-model arbitration (different providers/accounts for Judge A and Judge B).
  - High reasoning effort for unbiased evaluations.
