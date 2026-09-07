import * as fs from "node:fs";
import * as path from "node:path";
import type { Profile, SubagentsConfigFile } from "./types.js";

/**
 * Pure function: applies profile models and defaults onto a SubagentsConfigFile object,
 * preserving all custom or existing properties (timeouts, shortcuts, tools, etc.).
 */
export function applyProfileToConfig(
  currentConfig: SubagentsConfigFile,
  profile: Profile
): SubagentsConfigFile {
  const nextConfig: SubagentsConfigFile = { ...currentConfig };

  if (profile.default_model) {
    nextConfig.default_model = profile.default_model;
  }
  if (profile.default_effort) {
    nextConfig.default_effort = profile.default_effort;
  }

  nextConfig.active_profile = profile.name;
  nextConfig.model_profiles = { ...profile.model_profiles };

  return nextConfig;
}

/**
 * Pure function: extracts a Profile definition from a SubagentsConfigFile object.
 */
export function extractProfileFromConfig(
  config: SubagentsConfigFile,
  name: string,
  description?: string
): Profile {
  const now = new Date().toISOString();
  return {
    name,
    description: description ?? `Saved from subagents config at ${now}`,
    default_model: typeof config.default_model === "string" ? config.default_model : undefined,
    default_effort: typeof config.default_effort === "string" ? (config.default_effort as any) : undefined,
    model_profiles: (config.model_profiles as any) ?? {},
    created_at: now,
    updated_at: now,
  };
}

/**
 * Atomically applies a profile to a subagents.json file on disk.
 * Uses a temp file + atomic rename to prevent partial writes.
 */
export function applyProfileToFile(
  filePath: string,
  profile: Profile
): SubagentsConfigFile {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let currentConfig: SubagentsConfigFile = {};
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      currentConfig = JSON.parse(raw);
    } catch {
      currentConfig = {};
    }
  }

  const updatedConfig = applyProfileToConfig(currentConfig, profile);
  const formattedJson = JSON.stringify(updatedConfig, null, 2) + "\n";

  // Write atomically via tmp file
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmpPath, formattedJson, "utf-8");
  fs.renameSync(tmpPath, filePath);

  return updatedConfig;
}
