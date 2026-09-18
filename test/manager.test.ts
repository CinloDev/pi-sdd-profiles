import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SddProfileManager } from "../src/manager.js";
import {
  ALL_KNOWN_AGENTS,
  CUSTOM_CATEGORY_ID,
  SDD_AGENT_CATEGORIES,
  buildCustomCategory,
  isSyntheticAgentKey,
  resolveCategories,
} from "../src/catalog.js";
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
    expect(manager.getActiveProfileName("project")).toBe("cinlo-flash");
    expect(manager.getActiveProfileName("global")).toBeNull();
    expect(manager.getActiveScope()).toBe("project");

    manager.clearActiveProfile("project");
    expect(manager.getActiveProfileName("project")).toBeNull();
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

  it("should isolate global vs project reaffirmation without cross-contamination", () => {
    // Create a second profile for project
    manager.createProfile({
      name: "project-deep",
      default_model: "provider/o3-mini",
      model_profiles: {
        "sdd-apply": { model: "provider/o3-mini", effort: "high" },
      },
      scope: "project",
    });

    // 1. Activate cinlo-flash globally, and project-deep locally
    manager.activateProfile("cinlo-flash", "global");
    manager.activateProfile("project-deep", "project");

    expect(manager.getActiveProfileName("global")).toBe("cinlo-flash");
    expect(manager.getActiveProfileName("project")).toBe("project-deep");
    expect(manager.getActiveProfileName("effective")).toBe("project-deep");
    expect(manager.getActiveScope()).toBe("project");

    // 2. Modify both subagents files externally
    let gConfig = JSON.parse(fs.readFileSync(globalSubagentsPath, "utf-8"));
    gConfig.model_profiles["sdd-apply"] = { model: "tampered-global" };
    fs.writeFileSync(globalSubagentsPath, JSON.stringify(gConfig, null, 2), "utf-8");

    let pConfig = JSON.parse(fs.readFileSync(projectSubagentsPath, "utf-8"));
    pConfig.model_profiles["sdd-apply"] = { model: "tampered-project" };
    fs.writeFileSync(projectSubagentsPath, JSON.stringify(pConfig, null, 2), "utf-8");

    // 3. Reaffirm both
    const res = manager.reaffirmActiveProfile("both");
    expect(res.globalUpdated).toBe(true);
    expect(res.projectUpdated).toBe(true);

    // 4. Verify each file was reconciled to its OWN active profile
    const restoredGlobal = JSON.parse(fs.readFileSync(globalSubagentsPath, "utf-8"));
    expect(restoredGlobal.model_profiles["sdd-apply"].model).toBe("cpamc/cinlo/gemini-3.8-flash-high");

    const restoredProject = JSON.parse(fs.readFileSync(projectSubagentsPath, "utf-8"));
    expect(restoredProject.model_profiles["sdd-apply"].model).toBe("provider/o3-mini");
  });

  it("should export and import profiles via manager", () => {
    const exportFile = path.join(tmpRoot, "exported-manager.json");
    const exportRes = manager.exportProfile("cinlo-flash", exportFile);
    expect(exportRes.success).toBe(true);
    expect(fs.existsSync(exportFile)).toBe(true);

    const importRes = manager.importProfile({
      sourceFilePath: exportFile,
      scope: "project",
      overrideName: "imported-manager",
    });
    expect(importRes.success).toBe(true);
    expect(importRes.profile?.name).toBe("imported-manager");
    expect(manager.getProfile("imported-manager")).toBeDefined();

    // Test export failure on invalid name
    const failExport = manager.exportProfile("non-existent-xyz", exportFile);
    expect(failExport.success).toBe(false);

    // Test import failure on invalid path
    const failImport = manager.importProfile({ sourceFilePath: "does-not-exist.json" });
    expect(failImport.success).toBe(false);
  });

  describe("dynamic agent discovery and catalog helpers", () => {
    it("should identify synthetic agent keys correctly", () => {
      expect(isSyntheticAgentKey("⚡ [Asignar un mismo modelo a TODOS...]")).toBe(true);
      expect(isSyntheticAgentKey("🧠 [Asignar esfuerzo...]")).toBe(true);
      expect(isSyntheticAgentKey("📦 [Asignar modelo por Categoría...]")).toBe(true);
      expect(isSyntheticAgentKey("👑 Orchestrator")).toBe(true);
      expect(isSyntheticAgentKey("[Asignar modelo]")).toBe(true);
      expect(isSyntheticAgentKey("agent with spaces")).toBe(true);
      expect(isSyntheticAgentKey("")).toBe(true);
      expect(isSyntheticAgentKey(null as any)).toBe(true);
      expect(isSyntheticAgentKey(undefined as any)).toBe(true);

      expect(isSyntheticAgentKey("sdd-explore")).toBe(false);
      expect(isSyntheticAgentKey("my-custom-subagent")).toBe(false);
      expect(isSyntheticAgentKey("agent_backend_1")).toBe(false);
    });

    it("should build custom category and resolve categories correctly", () => {
      expect(buildCustomCategory([])).toBeNull();

      const customCat = buildCustomCategory(["beta-agent", "alpha-agent"]);
      expect(customCat).not.toBeNull();
      expect(customCat?.id).toBe(CUSTOM_CATEGORY_ID);
      expect(customCat?.id).toBe("custom");
      expect(customCat?.name).toBe("Custom Agents");
      expect(customCat?.description).toBe("Custom subagents discovered from configuration and profiles");
      expect(customCat?.agents).toEqual(["alpha-agent", "beta-agent"]);

      const defaultResolved = resolveCategories([]);
      expect(defaultResolved.length).toBe(SDD_AGENT_CATEGORIES.length);
      expect(defaultResolved.map((c) => c.id)).not.toContain("custom");

      const withCustom = resolveCategories(["custom-1"]);
      expect(withCustom.length).toBe(SDD_AGENT_CATEGORIES.length + 1);
      expect(withCustom[withCustom.length - 1].id).toBe("custom");
      expect(withCustom[withCustom.length - 1].agents).toEqual(["custom-1"]);
    });

    it("should discover custom agents from agents definition directories (.pi/agents and ~/.pi/agent/agents)", () => {
      const projectAgentsDir = path.join(path.dirname(projectSubagentsPath), "agents");
      const globalAgentsDir = path.join(path.dirname(globalSubagentsPath), "agents");

      fs.mkdirSync(projectAgentsDir, { recursive: true });
      fs.mkdirSync(globalAgentsDir, { recursive: true });

      // Add valid agent definition files
      fs.writeFileSync(path.join(projectAgentsDir, "my-custom-doc.md"), "# Custom Agent");
      fs.writeFileSync(path.join(projectAgentsDir, "reviewer-agent.yaml"), "name: reviewer");
      fs.writeFileSync(path.join(projectAgentsDir, "formatter-agent.yml"), "name: formatter");
      fs.writeFileSync(path.join(globalAgentsDir, "global-coder.json"), '{"name": "coder"}');

      // Add files that should be ignored / filtered
      fs.writeFileSync(path.join(projectAgentsDir, ".hidden-agent.md"), "hidden");
      fs.writeFileSync(path.join(projectAgentsDir, "ignore-me.txt"), "not matching ext");
      fs.writeFileSync(path.join(globalAgentsDir, "sdd-explore.md"), "known SDD agent");
      fs.writeFileSync(path.join(globalAgentsDir, "invalid agent key.yaml"), "synthetic key with spaces");

      const discovered = manager.discoverCustomAgents();
      expect(discovered).toContain("my-custom-doc");
      expect(discovered).toContain("reviewer-agent");
      expect(discovered).toContain("formatter-agent");
      expect(discovered).toContain("global-coder");

      expect(discovered).not.toContain(".hidden-agent");
      expect(discovered).not.toContain("ignore-me");
      expect(discovered).not.toContain("sdd-explore");
      expect(discovered).not.toContain("invalid agent key");
    });

    it("should discover custom agents from project and global subagents.json", () => {

      // Configure project subagents.json with custom agents in model_profiles and agents object
      const projectConfig = {
        model_profiles: {
          "sdd-explore": { model: "base-model" }, // Known SDD agent -> should be filtered
          "custom-proj-model": { model: "custom-model" },
          "⚡ [Asignar un mismo modelo...]": { model: "ignore-me" }, // Synthetic -> should be filtered
        },
        agents: {
          "custom-proj-agent-key": { model: "m1" },
          "alias-key": "custom-proj-agent-val",
        },
      };
      fs.writeFileSync(projectSubagentsPath, JSON.stringify(projectConfig, null, 2), "utf-8");

      // Configure global subagents.json with custom agents in agents array
      const globalConfig = {
        agents: [
          "custom-global-agent",
          { name: "custom-global-obj-agent" },
          "sdd-apply", // Known SDD agent -> should be filtered
          "agent with space", // Synthetic -> should be filtered
        ],
      };
      fs.writeFileSync(globalSubagentsPath, JSON.stringify(globalConfig, null, 2), "utf-8");

      const discovered = manager.discoverCustomAgents();
      expect(discovered).toEqual([
        "alias-key",
        "custom-global-agent",
        "custom-global-obj-agent",
        "custom-proj-agent-key",
        "custom-proj-agent-val",
        "custom-proj-model",
      ]);
    });

    it("should discover custom agents from stored profiles and currentProfile", () => {
      // Create a profile in storage with a custom agent
      manager.createProfile({
        name: "profile-with-custom",
        model_profiles: {
          "sdd-explore": { model: "m1" },
          "custom-stored-agent": { model: "m2" },
          "📦 Category Assignment": { model: "m3" }, // Synthetic
        },
      });

      // Pass an active/current profile with another custom agent
      const currentProfile: Profile = {
        name: "transient-profile",
        model_profiles: {
          "sdd-tasks": { model: "m4" },
          "custom-current-agent": { model: "m5" },
        },
      };

      const discovered = manager.discoverCustomAgents(currentProfile);
      expect(discovered).toContain("custom-stored-agent");
      expect(discovered).toContain("custom-current-agent");
      expect(discovered).not.toContain("sdd-explore");
      expect(discovered).not.toContain("sdd-tasks");
      expect(discovered).not.toContain("📦 Category Assignment");
    });

    it("should return Custom Agents category in getCategories and include them in getAllAgents", () => {
      // When no custom agents exist
      const initialCategories = manager.getCategories();
      expect(initialCategories.length).toBe(SDD_AGENT_CATEGORIES.length);
      expect(manager.getAllAgents()).toEqual(ALL_KNOWN_AGENTS);

      // Now introduce a custom agent via currentProfile
      const profileWithCustom: Profile = {
        name: "custom-holder",
        model_profiles: {
          "my-special-agent": { model: "vendor/fast" },
        },
      };

      const categories = manager.getCategories(profileWithCustom);
      expect(categories.length).toBe(SDD_AGENT_CATEGORIES.length + 1);

      const customCat = categories[categories.length - 1];
      expect(customCat.id).toBe("custom");
      expect(customCat.name).toBe("Custom Agents");
      expect(customCat.agents).toEqual(["my-special-agent"]);

      const allAgents = manager.getAllAgents(profileWithCustom);
      expect(allAgents).toEqual([...ALL_KNOWN_AGENTS, "my-special-agent"]);
    });
  });
});
