import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface DiscoveredModel {
  provider: string;
  id: string;
  fullName: string;
  label?: string;
}

const COMMON_STANDARD_MODELS = [
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5",
  "anthropic/claude-opus-4-6",
  "openai/o3-mini",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
];

/**
 * Discovers available models from Pi runtime context, models.json, and models-store.json.
 */
export async function resolveAvailableModels(ctx?: any): Promise<string[]> {
  const modelSet = new Set<string>();

  // 1. Try Pi runtime modelRegistry if available
  try {
    const registryModels = await ctx?.modelRegistry?.getAvailable?.();
    if (Array.isArray(registryModels)) {
      for (const m of registryModels) {
        const provider = m.provider ?? m.providerId;
        const id = m.id ?? m.model;
        if (provider && id) {
          modelSet.add(`${provider}/${id}`);
        }
      }
    }
  } catch {}

  const home = os.homedir();

  // 2. Read ~/.pi/agent/models.json (custom user providers like cpamc, opencode-go)
  const modelsJsonPath = path.join(home, ".pi", "agent", "models.json");
  if (fs.existsSync(modelsJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
      if (data?.providers && typeof data.providers === "object") {
        for (const [provider, pData] of Object.entries<any>(data.providers)) {
          if (Array.isArray(pData?.models)) {
            for (const m of pData.models) {
              if (m?.id) {
                modelSet.add(`${provider}/${m.id}`);
              }
            }
          }
        }
      }
    } catch {}
  }

  // 3. Read ~/.pi/agent/models-store.json if present
  const storeJsonPath = path.join(home, ".pi", "agent", "models-store.json");
  if (fs.existsSync(storeJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(storeJsonPath, "utf-8"));
      if (typeof data === "object") {
        for (const [provider, pData] of Object.entries<any>(data)) {
          if (Array.isArray(pData?.models)) {
            for (const m of pData.models) {
              if (m?.id) {
                modelSet.add(`${provider}/${m.id}`);
              }
            }
          }
        }
      }
    } catch {}
  }

  // 4. Always add standard models as fallback if set is small
  for (const std of COMMON_STANDARD_MODELS) {
    modelSet.add(std);
  }

  return Array.from(modelSet).sort((a, b) => a.localeCompare(b));
}
