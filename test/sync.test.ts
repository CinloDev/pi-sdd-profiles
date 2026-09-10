import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  applyProfileToConfig,
  extractProfileFromConfig,
  applyProfileToFile,
  profileDivergesFromConfig,
  reconcileProfileWithFile,
} from "../src/sync.js";
import type { Profile, SubagentsConfigFile } from "../src/types.js";

describe("sync module", () => {
  const sampleConfig: SubagentsConfigFile = {
    timeout_ms: 1200000,
    stall_timeout_ms: 240000,
    max_concurrency: 5,
    debug: false,
    default_tools: ["read", "bash", "grep"],
    default_model: "old-provider/old-model",
    default_effort: "low",
    model_profiles: {
      "sdd-explore": { model: "old-provider/old-model", effort: "low" },
      "sdd-apply": { model: "old-provider/old-model", effort: "high" },
    },
  };

  const sampleProfile: Profile = {
    name: "cinlo-flash",
    description: "Gemini 3.8 Flash High across the board",
    default_model: "cpamc/cinlo/gemini-3.8-flash-high",
    default_effort: "high",
    model_profiles: {
      "sdd-explore": { model: "cpamc/cinlo/gemini-3.8-flash-high", effort: "low" },
      "sdd-apply": { model: "cpamc/cinlo/gemini-3.8-flash-high", effort: "high" },
      "jd-judge-a": { model: "cpamc/cinlo/gemini-3.8-flash-high", effort: "high" },
      "jd-judge-b": { model: "cpamc/cin82/gemini-3.8-flash-high", effort: "high" },
    },
  };

  it("should apply profile to config in-memory without losing non-profile settings", () => {
    const updated = applyProfileToConfig(sampleConfig, sampleProfile);

    // Non-profile fields preserved
    expect(updated.timeout_ms).toBe(1200000);
    expect(updated.stall_timeout_ms).toBe(240000);
    expect(updated.max_concurrency).toBe(5);
    expect(updated.default_tools).toEqual(["read", "bash", "grep"]);

    // Profile fields updated
    expect(updated.default_model).toBe("cpamc/cinlo/gemini-3.8-flash-high");
    expect(updated.default_effort).toBe("high");
    expect(updated.active_profile).toBe("cinlo-flash");
    expect(updated.model_profiles).toEqual(sampleProfile.model_profiles);
  });

  it("should delete default_effort when profile.default_effort is undefined", () => {
    const profileWithoutEffort: Profile = {
      name: "unconstrained-profile",
      default_model: "test/unconstrained",
      default_effort: undefined,
      model_profiles: {
        "sdd-explore": { model: "test/unconstrained" },
      },
    };

    const updated = applyProfileToConfig(sampleConfig, profileWithoutEffort);
    expect(updated.default_effort).toBeUndefined();
    expect("default_effort" in updated).toBe(false);
    expect(updated.model_profiles?.["sdd-explore"]).toEqual({ model: "test/unconstrained" });
    expect("effort" in (updated.model_profiles?.["sdd-explore"] as any)).toBe(false);
  });

  it("should extract a valid profile from an existing config", () => {
    const extracted = extractProfileFromConfig(sampleConfig, "my-saved-profile", "Extracted from current config");

    expect(extracted.name).toBe("my-saved-profile");
    expect(extracted.description).toBe("Extracted from current config");
    expect(extracted.default_model).toBe("old-provider/old-model");
    expect(extracted.default_effort).toBe("low");
    expect(extracted.model_profiles).toEqual(sampleConfig.model_profiles);
  });

  describe("file operations", () => {
    let tmpDir: string;
    let configPath: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sdd-profiles-test-"));
      configPath = path.join(tmpDir, "subagents.json");
      fs.writeFileSync(configPath, JSON.stringify(sampleConfig, null, 2), "utf-8");
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should write updated config atomically to disk", () => {
      applyProfileToFile(configPath, sampleProfile);

      const content = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(content.active_profile).toBe("cinlo-flash");
      expect(content.default_model).toBe("cpamc/cinlo/gemini-3.8-flash-high");
      expect(content.model_profiles["jd-judge-a"]).toEqual({
        model: "cpamc/cinlo/gemini-3.8-flash-high",
        effort: "high",
      });
      // formatting preserved with 2 spaces
      const raw = fs.readFileSync(configPath, "utf-8");
      expect(raw.endsWith("\n")).toBe(true);
    });

    it("should create config file if it does not exist yet", () => {
      const nonExistentPath = path.join(tmpDir, "nested", "subagents.json");
      applyProfileToFile(nonExistentPath, sampleProfile);

      expect(fs.existsSync(nonExistentPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(nonExistentPath, "utf-8"));
      expect(content.active_profile).toBe("cinlo-flash");
    });

    it("should detect divergence when external write (e.g. gentle-pi) overwrites model_profiles", () => {
      // 1. Initial state: profile is applied
      applyProfileToFile(configPath, sampleProfile);
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(profileDivergesFromConfig(raw, sampleProfile)).toBe(false);

      // 2. External actor overwrites model_profiles while keeping active_profile
      raw.model_profiles["sdd-apply"] = { model: "gentle-pi-overwritten-model", effort: "low" };
      fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), "utf-8");
      expect(profileDivergesFromConfig(raw, sampleProfile)).toBe(true);

      // 3. Reconcile restores profile assignments
      const result = reconcileProfileWithFile(configPath, sampleProfile);
      expect(result.updated).toBe(true);
      expect(result.config.model_profiles?.["sdd-apply"]).toEqual({
        model: "cpamc/cinlo/gemini-3.8-flash-high",
        effort: "high",
      });

      // 4. Checking again shows no divergence and reconcile is a no-op
      const diskContent = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(profileDivergesFromConfig(diskContent, sampleProfile)).toBe(false);
      const secondResult = reconcileProfileWithFile(configPath, sampleProfile);
      expect(secondResult.updated).toBe(false);
    });

    it("should detect divergence when default_model, default_effort, or active_profile differs", () => {
      applyProfileToFile(configPath, sampleProfile);
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      // 1. active_profile differs
      raw.active_profile = "different-profile";
      expect(profileDivergesFromConfig(raw, sampleProfile)).toBe(true);
      raw.active_profile = sampleProfile.name;

      // 2. default_model differs
      raw.default_model = "other/model";
      expect(profileDivergesFromConfig(raw, sampleProfile)).toBe(true);
      raw.default_model = sampleProfile.default_model;

      // 3. default_effort differs
      raw.default_effort = "low"; // sampleProfile has "high"
      expect(profileDivergesFromConfig(raw, sampleProfile)).toBe(true);
      raw.default_effort = sampleProfile.default_effort;

      // 4. agent effort differs
      raw.model_profiles["sdd-apply"].effort = "low"; // sampleProfile has "high"
      expect(profileDivergesFromConfig(raw, sampleProfile)).toBe(true);
    });

    it("should recover and reconcile when target file is corrupt or empty", () => {
      fs.writeFileSync(configPath, "{ invalid json", "utf-8");
      const result = reconcileProfileWithFile(configPath, sampleProfile);
      expect(result.updated).toBe(true);
      expect(result.config.active_profile).toBe(sampleProfile.name);
    });
  });
});
