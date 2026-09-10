import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SddProfileManager } from "../src/manager.js";
import type { Profile, SubagentsConfigFile } from "../src/types.js";

describe("manager module", () => {
  let tmpRoot: string;
  let globalDir: string;
  let projectDir: string;
  let builtinsDir: string;
  let globalSubagentsPath: string;
  let projectSubagentsPath: string;
  let manager: SddProfileManager;

  const sampleProfile: Profile = {
    name: "cinlo-flash",
    description: "Gemini 3.8 Flash High",
    default_model: "cpamc/cinlo/gemini-3.8-flash-high",
    default_effort: "high",
    model_profiles: {
      "sdd-explore": { model: "cpamc/cinlo/gemini-3.8-flash-high", effort: "low" },
      "sdd-apply": { model: "cpamc/cinlo/gemini-3.8-flash-high", effort: "high" },
    },
  };

  const initialConfig: SubagentsConfigFile = {
    timeout_ms: 1200000,
    stall_timeout_ms: 240000,
    default_model: "old-model",
    model_profiles: {
      "sdd-explore": { model: "old-model" },
    },
  };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sdd-manager-test-"));
    globalDir = path.join(tmpRoot, "global-profiles");
    projectDir = path.join(tmpRoot, "project", ".pi", "profiles");
    builtinsDir = path.join(tmpRoot, "builtins");
    globalSubagentsPath = path.join(tmpRoot, "subagents.json");
    projectSubagentsPath = path.join(tmpRoot, "project", ".pi", "subagents.json");

    fs.mkdirSync(globalDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(builtinsDir, { recursive: true });
    fs.mkdirSync(path.dirname(projectSubagentsPath), { recursive: true });

    fs.writeFileSync(globalSubagentsPath, JSON.stringify(initialConfig, null, 2));
    fs.writeFileSync(path.join(builtinsDir, "cinlo-flash.json"), JSON.stringify(sampleProfile, null, 2));

    manager = new SddProfileManager({
      globalDir,
      projectDir,
      builtinsDir,
      globalSubagentsPath,
      projectSubagentsPath,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("should list profiles and load details", () => {
    const list = manager.listProfiles();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("cinlo-flash");

    const p = manager.getProfile("cinlo-flash");
    expect(p).not.toBeNull();
    expect(p?.default_model).toBe("cpamc/cinlo/gemini-3.8-flash-high");
  });

  it("should activate a profile and update global subagents.json", () => {
    const res = manager.activateProfile("cinlo-flash", "global");
    expect(res.success).toBe(true);

    const updatedGlobal = JSON.parse(fs.readFileSync(globalSubagentsPath, "utf-8"));
    expect(updatedGlobal.active_profile).toBe("cinlo-flash");
    expect(updatedGlobal.default_model).toBe("cpamc/cinlo/gemini-3.8-flash-high");
    expect(updatedGlobal.timeout_ms).toBe(1200000); // Preserved!

    expect(manager.getActiveProfileName()).toBe("cinlo-flash");
  });

  it("should activate a profile to project subagents.json when requested", () => {
    const res = manager.activateProfile("cinlo-flash", "project");
    expect(res.success).toBe(true);

    const updatedProject = JSON.parse(fs.readFileSync(projectSubagentsPath, "utf-8"));
    expect(updatedProject.active_profile).toBe("cinlo-flash");
  });

  it("should save current subagents config as a new profile", () => {
    // First activate cinlo-flash so subagents has models
    manager.activateProfile("cinlo-flash", "global");

    const saveRes = manager.saveCurrentAsProfile("saved-backup", "My snapshot", "global");
    expect(saveRes.success).toBe(true);

    const reloaded = manager.getProfile("saved-backup");
    expect(reloaded).not.toBeNull();
    expect(reloaded?.name).toBe("saved-backup");
    expect(reloaded?.model_profiles["sdd-apply"].model).toBe("cpamc/cinlo/gemini-3.8-flash-high");
  });

  it("should explicitly create a new profile from scratch", () => {
    const res = manager.createProfile({
      name: "custom-brand-new",
      description: "Custom user created profile",
      default_model: "anthropic/claude-sonnet-4-5",
      default_effort: "high",
      scope: "global",
    });

    expect(res.success).toBe(true);
    const loaded = manager.getProfile("custom-brand-new");
    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe("custom-brand-new");
    expect(loaded?.default_model).toBe("anthropic/claude-sonnet-4-5");
    expect(loaded?.default_effort).toBe("high");
  });

  it("should update a specific agent model within a profile", () => {
    manager.createProfile({
      name: "for-editing",
      default_model: "default/model",
    });

    const res = manager.setAgentInProfile({
      profileName: "for-editing",
      agentName: "sdd-design",
      model: "special/design-model",
      effort: "max",
    });

    expect(res.success).toBe(true);
    const updated = manager.getProfile("for-editing");
    expect(updated?.model_profiles["sdd-design"]).toEqual({
      model: "special/design-model",
      effort: "max",
    });
  });

  it("should rename an existing profile via manager", () => {
    manager.createProfile({
      name: "custom-to-rename",
      default_model: "custom/model",
    });

    const renameRes = manager.renameProfile("custom-to-rename", "custom-renamed");
    expect(renameRes.success).toBe(true);
    expect(renameRes.profile?.name).toBe("custom-renamed");
    expect(manager.getProfile("custom-to-rename")).toBeNull();
    expect(manager.getProfile("custom-renamed")).toBeDefined();
  });

  it("should delete profile via manager and report status", () => {
    manager.createProfile({
      name: "custom-to-delete",
      default_model: "custom/model",
    });

    expect(manager.deleteProfile("custom-to-delete")).toBe(true);
    expect(manager.getProfile("custom-to-delete")).toBeNull();
    // cinlo-flash is builtin in this test and should also be deletable
    expect(manager.deleteProfile("cinlo-flash")).toBe(true);
    expect(manager.getProfile("cinlo-flash")).toBeNull();
  });

  it("should reaffirm active profile assignments when overwritten externally", () => {
    // 1. Activate profile
    manager.activateProfile("cinlo-flash", "global");
    let diskConfig = JSON.parse(fs.readFileSync(globalSubagentsPath, "utf-8"));
    expect(diskConfig.model_profiles["sdd-apply"].model).toBe("cpamc/cinlo/gemini-3.8-flash-high");

    // 2. External overwrite (e.g. gentle-pi session_start writes its own routing)
    diskConfig.model_profiles["sdd-apply"] = { model: "gentle-pi-overwritten", effort: "low" };
    fs.writeFileSync(globalSubagentsPath, JSON.stringify(diskConfig, null, 2), "utf-8");

    // 3. Reaffirm restores the assignments
    const reaffirmRes = manager.reaffirmActiveProfile("global");
    expect(reaffirmRes.globalUpdated).toBe(true);

    const restoredConfig = JSON.parse(fs.readFileSync(globalSubagentsPath, "utf-8"));
    expect(restoredConfig.model_profiles["sdd-apply"].model).toBe("cpamc/cinlo/gemini-3.8-flash-high");

    // 4. Second reaffirm is a no-op because it is already synchronized
    const secondReaffirm = manager.reaffirmActiveProfile("global");
    expect(secondReaffirm.globalUpdated).toBe(false);
  });
});
