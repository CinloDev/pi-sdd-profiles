import * as fs from "node:fs";
import * as path from "node:path";
import { parseReasoningEffort, type Profile, type ReasoningEffort, type SubagentsConfigFile } from "./types.js";

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
  } else {
    delete nextConfig.default_effort;
  }

  nextConfig.active_profile = profile.name;

  const cleanedModelProfiles: Record<string, { model: string; effort?: string }> = {};
  for (const [agentKey, entry] of Object.entries(profile.model_profiles ?? {})) {
    if (entry && entry.effort) {
      cleanedModelProfiles[agentKey] = {
        model: entry.model,
        effort: entry.effort,
      };
    } else if (entry) {
      cleanedModelProfiles[agentKey] = {
        model: entry.model,
      };
    }
  }
  nextConfig.model_profiles = cleanedModelProfiles;

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
  const parsedDefaultEffort = parseReasoningEffort(config.default_effort, false);
  const parsedModelProfiles: Record<string, { model: string; effort?: ReasoningEffort }> = {};

  if (config.model_profiles && typeof config.model_profiles === "object") {
    for (const [agent, entry] of Object.entries(config.model_profiles)) {
      if (entry && typeof entry === "object" && "model" in entry) {
        const effort = parseReasoningEffort(entry.effort, false);
        parsedModelProfiles[agent] = {
          model: String(entry.model),
          ...(effort ? { effort } : {}),
        };
      }
    }
  }

  return {
    name,
    description: description ?? `Saved from subagents config at ${now}`,
    default_model: typeof config.default_model === "string" ? config.default_model : undefined,
    default_effort: parsedDefaultEffort,
    model_profiles: parsedModelProfiles,
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
