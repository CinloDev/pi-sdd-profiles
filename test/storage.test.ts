import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProfileStorage } from "../src/storage.js";
import type { Profile } from "../src/types.js";

describe("storage module", () => {
  let tmpRoot: string;
  let globalDir: string;
  let projectDir: string;
  let builtinsDir: string;
  let storage: ProfileStorage;

  const sampleBuiltin: Profile = {
    name: "balanced",
    description: "Balanced baseline profile",
    default_model: "anthropic/claude-sonnet-4-5",
    default_effort: "medium",
    model_profiles: {
      "sdd-explore": { model: "anthropic/claude-haiku-4-5", effort: "low" },
    },
  };

  const sampleGlobal: Profile = {
    name: "cinlo-flash",
    description: "Gemini flash setup",
    default_model: "cpamc/cinlo/gemini-3.8-flash-high",
    default_effort: "high",
    model_profiles: {
      "sdd-explore": { model: "cpamc/cinlo/gemini-3.8-flash-high", effort: "low" },
    },
  };

  const sampleProject: Profile = {
    name: "project-special",
    description: "Project specific overrides",
    default_model: "custom/special-model",
    default_effort: "max",
    model_profiles: {
      "sdd-apply": { model: "custom/special-model", effort: "max" },
    },
  };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sdd-storage-test-"));
    globalDir = path.join(tmpRoot, "global-profiles");
    projectDir = path.join(tmpRoot, "project", ".pi", "profiles");
    builtinsDir = path.join(tmpRoot, "builtins");

    fs.mkdirSync(globalDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(builtinsDir, { recursive: true });

    fs.writeFileSync(path.join(builtinsDir, "balanced.json"), JSON.stringify(sampleBuiltin, null, 2));
    fs.writeFileSync(path.join(globalDir, "cinlo-flash.json"), JSON.stringify(sampleGlobal, null, 2));
    fs.writeFileSync(path.join(projectDir, "project-special.json"), JSON.stringify(sampleProject, null, 2));

    storage = new ProfileStorage({
      globalDir,
      projectDir,
      builtinsDir,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("should list all profiles across builtins, global, and project scopes", () => {
    const list = storage.listProfiles();
    expect(list.length).toBe(3);

    const names = list.map((p) => p.name);
    expect(names).toContain("balanced");
    expect(names).toContain("cinlo-flash");
    expect(names).toContain("project-special");

    const builtinItem = list.find((p) => p.name === "balanced");
    expect(builtinItem?.scope).toBe("builtin");

    const globalItem = list.find((p) => p.name === "cinlo-flash");
    expect(globalItem?.scope).toBe("global");

    const projectItem = list.find((p) => p.name === "project-special");
    expect(projectItem?.scope).toBe("project");
  });

  it("should prioritize project profile over global when names match", () => {
    // Override 'cinlo-flash' in projectDir
    const overridden: Profile = {
      ...sampleGlobal,
      description: "Project override for cinlo-flash",
      default_effort: "minimal",
    };
    fs.writeFileSync(path.join(projectDir, "cinlo-flash.json"), JSON.stringify(overridden, null, 2));

    const loaded = storage.loadProfile("cinlo-flash");
    expect(loaded?.description).toBe("Project override for cinlo-flash");
    expect(loaded?.default_effort).toBe("minimal");

    const list = storage.listProfiles();
    const item = list.find((p) => p.name === "cinlo-flash");
    expect(item?.scope).toBe("project");
  });

  it("should save a new profile to the designated scope (global by default)", () => {
    const newProfile: Profile = {
      name: "custom-deep",
      description: "Deep thinking",
      model_profiles: {
        "sdd-design": { model: "openai/o3-mini", effort: "high" },
      },
    };

    const savedPath = storage.saveProfile(newProfile, "global");
    expect(fs.existsSync(savedPath)).toBe(true);
    expect(path.dirname(savedPath)).toBe(globalDir);

    const loaded = storage.loadProfile("custom-deep");
    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe("custom-deep");
  });

  it("should save a profile to project scope when requested", () => {
    const newProfile: Profile = {
      name: "local-only",
      model_profiles: {},
    };

    const savedPath = storage.saveProfile(newProfile, "project");
    expect(path.dirname(savedPath)).toBe(projectDir);
  });

  it("should delete custom profiles and disallow deleting builtin profiles", () => {
    expect(storage.deleteProfile("cinlo-flash")).toBe(true);
    expect(storage.loadProfile("cinlo-flash")).toBeNull();

    // Builtin should reject deletion
    expect(storage.deleteProfile("balanced")).toBe(false);
    expect(storage.loadProfile("balanced")).toBeDefined();
  });

  it("should track and persist active profile name", () => {
    expect(storage.getActiveProfileName()).toBeNull();

    storage.setActiveProfileName("cinlo-flash");
    expect(storage.getActiveProfileName()).toBe("cinlo-flash");

    const list = storage.listProfiles();
    const activeItem = list.find((p) => p.is_active);
    expect(activeItem?.name).toBe("cinlo-flash");
  });
});
