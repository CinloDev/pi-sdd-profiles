import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SubagentsConfigWatcher } from "../src/watcher.js";
import { SddProfileManager } from "../src/manager.js";
import type { Profile, SubagentsConfigFile } from "../src/types.js";

describe("SubagentsConfigWatcher", () => {
  let tmpRoot: string;
  let globalDir: string;
  let globalSubagentsPath: string;
  let projectSubagentsPath: string;
  let manager: SddProfileManager;
  let watcher: SubagentsConfigWatcher | null = null;

  const sampleProfile: Profile = {
    name: "deep-reasoning",
    description: "Deep reasoning profile",
    default_model: "provider/deep-model",
    default_effort: "high",
    model_profiles: {
      "sdd-apply": { model: "provider/deep-model", effort: "high" },
      "worker": { model: "provider/deep-model", effort: "high" },
    },
  };

  const initialConfig: SubagentsConfigFile = {
    active_profile: "deep-reasoning",
    default_model: "provider/deep-model",
    default_effort: "high",
    model_profiles: {
      "sdd-apply": { model: "provider/deep-model", effort: "high" },
      "worker": { model: "provider/deep-model", effort: "high" },
    },
  };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sdd-watcher-test-"));
    globalDir = path.join(tmpRoot, "global-profiles");
    globalSubagentsPath = path.join(tmpRoot, "agent", "subagents.json");
    projectSubagentsPath = path.join(tmpRoot, "project", ".pi", "subagents.json");

    fs.mkdirSync(globalDir, { recursive: true });
    fs.mkdirSync(path.dirname(globalSubagentsPath), { recursive: true });
    fs.mkdirSync(path.dirname(projectSubagentsPath), { recursive: true });

    // Save profile into manager
    fs.writeFileSync(
      path.join(globalDir, "deep-reasoning.json"),
      JSON.stringify(sampleProfile, null, 2),
      "utf-8"
    );

    // Initial subagents files
    fs.writeFileSync(globalSubagentsPath, JSON.stringify(initialConfig, null, 2), "utf-8");

    manager = new SddProfileManager({
      globalDir,
      projectDir: path.join(tmpRoot, "project", ".pi", "profiles"),
      globalSubagentsPath,
      projectSubagentsPath,
      activeStatePath: path.join(globalDir, ".active"),
    });

    manager.storage.setActiveProfileName("deep-reasoning");
  });

  afterEach(() => {
    if (watcher) {
      watcher.stop();
      watcher = null;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("should not reconcile if file already matches active profile", () => {
    const onReconciled = vi.fn();
    watcher = new SubagentsConfigWatcher({
      manager,
      onReconciled,
    });

    const updated = watcher.reconcile(globalSubagentsPath, "global");
    expect(updated).toBe(false);
    expect(onReconciled).not.toHaveBeenCalled();
  });

  it("should reconcile and trigger onReconciled when assignments are overwritten", () => {
    const onReconciled = vi.fn();
    watcher = new SubagentsConfigWatcher({
      manager,
      onReconciled,
    });

    // Simulate gentle-pi writing over model_profiles
    const overwritten = {
      ...initialConfig,
      model_profiles: {
        "sdd-apply": { model: "gentle-pi/canon-model", effort: "low" },
        "worker": { model: "gentle-pi/canon-model", effort: "low" },
      },
    };
    fs.writeFileSync(globalSubagentsPath, JSON.stringify(overwritten, null, 2), "utf-8");

    const updated = watcher.reconcile(globalSubagentsPath, "global");
    expect(updated).toBe(true);
    expect(onReconciled).toHaveBeenCalledTimes(1);
    expect(onReconciled).toHaveBeenCalledWith({
      filePath: globalSubagentsPath,
      profile: sampleProfile,
      scope: "global",
    });

    // Check disk content was restored
    const restored = JSON.parse(fs.readFileSync(globalSubagentsPath, "utf-8"));
    expect(restored.model_profiles["sdd-apply"]).toEqual({
      model: "provider/deep-model",
      effort: "high",
    });
  });

  it("should automatically detect disk write and reconcile after debounce", async () => {
    const onReconciled = vi.fn();
    watcher = new SubagentsConfigWatcher({
      manager,
      debounceMs: 50, // fast debounce for test
      onReconciled,
    });
    watcher.start();

    // Overwrite subagents.json externally
    const overwritten = {
      ...initialConfig,
      model_profiles: {
        "sdd-apply": { model: "overwritten-by-external-tool" },
      },
    };
    fs.writeFileSync(globalSubagentsPath, JSON.stringify(overwritten, null, 2), "utf-8");

    // Wait for fs.watch event + debounce
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(onReconciled).toHaveBeenCalled();
    const diskContent = JSON.parse(fs.readFileSync(globalSubagentsPath, "utf-8"));
    expect(diskContent.model_profiles["sdd-apply"].model).toBe("provider/deep-model");
  });

  it("should stop cleanly and not reconcile after stopped", async () => {
    const onReconciled = vi.fn();
    watcher = new SubagentsConfigWatcher({
      manager,
      debounceMs: 50,
      onReconciled,
    });
    watcher.start();
    watcher.stop();

    const overwritten = {
      ...initialConfig,
      model_profiles: {
        "sdd-apply": { model: "overwritten-after-stop" },
      },
    };
    fs.writeFileSync(globalSubagentsPath, JSON.stringify(overwritten, null, 2), "utf-8");

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(onReconciled).not.toHaveBeenCalled();
  });

  it("should reconcile project subagents with project active profile and not touch project if no project profile active", () => {
    const onReconciled = vi.fn();
    watcher = new SubagentsConfigWatcher({
      manager,
      onReconciled,
    });

    // 1. Project has NO active profile set yet
    fs.writeFileSync(
      projectSubagentsPath,
      JSON.stringify({ model_profiles: { worker: { model: "local-custom" } } }, null, 2),
      "utf-8"
    );

    // Reconciling project when project has no active profile should return false and not overwrite
    const pUpdated = watcher.reconcile(projectSubagentsPath, "project");
    expect(pUpdated).toBe(false);
    expect(onReconciled).not.toHaveBeenCalled();

    // 2. Now set a project-specific active profile
    const projectProfilesDir = path.join(tmpRoot, "project", ".pi", "profiles");
    fs.mkdirSync(projectProfilesDir, { recursive: true });
    const projectProfile: Profile = {
      name: "project-profile",
      model_profiles: {
        worker: { model: "provider/project-model", effort: "high" },
      },
    };
    fs.writeFileSync(
      path.join(projectProfilesDir, "project-profile.json"),
      JSON.stringify(projectProfile, null, 2),
      "utf-8"
    );
    manager.activateProfile("project-profile", "project");

    // Reconcile project with external tamper
    fs.writeFileSync(
      projectSubagentsPath,
      JSON.stringify({ model_profiles: { worker: { model: "tampered" } } }, null, 2),
      "utf-8"
    );

    const projectReconciled = watcher.reconcile(projectSubagentsPath, "project");
    expect(projectReconciled).toBe(true);
    expect(onReconciled).toHaveBeenCalledWith({
      filePath: projectSubagentsPath,
      profile: projectProfile,
      scope: "project",
    });

    const restoredProject = JSON.parse(fs.readFileSync(projectSubagentsPath, "utf-8"));
    expect(restoredProject.model_profiles.worker.model).toBe("provider/project-model");
  });
});
