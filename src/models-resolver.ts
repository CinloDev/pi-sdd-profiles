import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { REASONING_EFFORTS, type ReasoningEffort } from "./types.js";

export interface DiscoveredModel {
  provider: string;
  id: string;
  fullName: string;
  label?: string;
}

export interface ModelMetadata {
  id: string;
  provider: string;
  name?: string;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  reasoningEfforts?: string[];
}

export const COMMON_STANDARD_MODELS = [
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5",
  "anthropic/claude-opus-4-6",
  "openai/o3-mini",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
];

export const STANDARD_MODELS_METADATA: Record<string, ModelMetadata> = {
  "openai/o3-mini": {
    id: "openai/o3-mini",
    provider: "openai",
    name: "o3-mini",
    reasoning: true,
    reasoningEfforts: ["low", "medium", "high"],
  },
  "openai/gpt-4o": {
    id: "openai/gpt-4o",
    provider: "openai",
    name: "GPT-4o",
    reasoning: false,
  },
  "openai/gpt-4o-mini": {
    id: "openai/gpt-4o-mini",
    provider: "openai",
    name: "GPT-4o mini",
    reasoning: false,
  },
  "google/gemini-2.5-flash": {
    id: "google/gemini-2.5-flash",
    provider: "google",
    name: "Gemini 2.5 Flash",
    reasoning: true,
    reasoningEfforts: ["low", "medium", "high"],
  },
  "google/gemini-2.5-pro": {
    id: "google/gemini-2.5-pro",
    provider: "google",
    name: "Gemini 2.5 Pro",
    reasoning: true,
    reasoningEfforts: ["low", "medium", "high"],
  },
  "anthropic/claude-sonnet-4-5": {
    id: "anthropic/claude-sonnet-4-5",
    provider: "anthropic",
    name: "Claude 3.7 Sonnet / 4.5",
    reasoning: true,
    reasoningEfforts: ["low", "medium", "high", "max"],
  },
  "anthropic/claude-haiku-4-5": {
    id: "anthropic/claude-haiku-4-5",
    provider: "anthropic",
    name: "Claude Haiku 4.5",
    reasoning: true,
    reasoningEfforts: ["low", "medium", "high"],
  },
  "anthropic/claude-opus-4-6": {
    id: "anthropic/claude-opus-4-6",
    provider: "anthropic",
    name: "Claude Opus 4.6",
    reasoning: true,
    reasoningEfforts: ["low", "medium", "high", "max"],
  },
};

export const DEFAULT_EFFORT_OPTIONS: Array<ReasoningEffort | "default"> = [
  "default",
  ...REASONING_EFFORTS,
];

/**
 * Discovers available models and their metadata from Pi runtime context, models.json, and models-store.json.
 */
export async function resolveModelsMetadata(ctx?: any): Promise<Record<string, ModelMetadata>> {
  const metadataMap: Record<string, ModelMetadata> = { ...STANDARD_MODELS_METADATA };

  // 1. Try Pi runtime modelRegistry if available
  try {
    const registryModels = await ctx?.modelRegistry?.getAvailable?.();
    if (Array.isArray(registryModels)) {
      for (const m of registryModels) {
        const provider = m.provider ?? m.providerId;
        const id = m.id ?? m.model;
        if (provider && id) {
          const fullName = `${provider}/${id}`;
          const itemMeta: ModelMetadata = {
            id: fullName,
            provider,
            name: m.name,
            reasoning: typeof m.reasoning === "boolean" ? m.reasoning : undefined,
            thinkingLevelMap:
              m.thinkingLevelMap && typeof m.thinkingLevelMap === "object" ? m.thinkingLevelMap : undefined,
            reasoningEfforts: Array.isArray(m.reasoningEfforts) ? m.reasoningEfforts : undefined,
          };
          metadataMap[fullName] = itemMeta;
          metadataMap[id] = itemMeta;
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
                const fullName = `${provider}/${m.id}`;
                const itemMeta: ModelMetadata = {
                  id: fullName,
                  provider,
                  name: m.name,
                  reasoning: typeof m.reasoning === "boolean" ? m.reasoning : undefined,
                  thinkingLevelMap:
                    m.thinkingLevelMap && typeof m.thinkingLevelMap === "object" ? m.thinkingLevelMap : undefined,
                  reasoningEfforts: Array.isArray(m.reasoningEfforts) ? m.reasoningEfforts : undefined,
                };
                metadataMap[fullName] = itemMeta;
                metadataMap[m.id] = itemMeta;
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
                const fullName = `${provider}/${m.id}`;
                const itemMeta: ModelMetadata = {
                  id: fullName,
                  provider,
                  name: m.name,
                  reasoning: typeof m.reasoning === "boolean" ? m.reasoning : undefined,
                  thinkingLevelMap:
                    m.thinkingLevelMap && typeof m.thinkingLevelMap === "object" ? m.thinkingLevelMap : undefined,
                  reasoningEfforts: Array.isArray(m.reasoningEfforts) ? m.reasoningEfforts : undefined,
                };
                metadataMap[fullName] = itemMeta;
                metadataMap[m.id] = itemMeta;
              }
            }
          }
        }
      }
    } catch {}
  }

  return metadataMap;
}

/**
 * Discovers available models from Pi runtime context, models.json, and models-store.json.
 */
export async function resolveAvailableModels(ctx?: any): Promise<string[]> {
  const metadataMap = await resolveModelsMetadata(ctx);
  const modelSet = new Set<string>();

  for (const key of Object.keys(metadataMap)) {
    if (key.includes("/")) {
      modelSet.add(key);
    }
  }

  for (const std of COMMON_STANDARD_MODELS) {
    modelSet.add(std);
  }

  return Array.from(modelSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Computes supported reasoning efforts for a given model based on its metadata.
 */
export function getSupportedEffortsForModel(
  modelId?: string,
  metadataMap: Record<string, ModelMetadata> = STANDARD_MODELS_METADATA
): Array<ReasoningEffort | "default"> {
  if (!modelId) {
    return [...DEFAULT_EFFORT_OPTIONS];
  }

  const cleanId = modelId.trim();
  const lowerId = cleanId.toLowerCase();

  // Find metadata
  let meta: ModelMetadata | undefined = metadataMap?.[cleanId] ?? metadataMap?.[lowerId];

  if (!meta && metadataMap) {
    const slashIdx = cleanId.indexOf("/");
    const idWithoutProvider = (slashIdx >= 0 ? cleanId.slice(slashIdx + 1) : cleanId).toLowerCase();

    for (const [k, v] of Object.entries(metadataMap)) {
      const kSlash = k.indexOf("/");
      const kIdWithoutProvider = (kSlash >= 0 ? k.slice(kSlash + 1) : k).toLowerCase();
      if (k.toLowerCase() === lowerId || kIdWithoutProvider === idWithoutProvider) {
        meta = v;
        break;
      }
    }
  }

  if (meta) {
    // 1. Explicitly non-reasoning
    if (meta.reasoning === false) {
      return ["default"];
    }

    // 2. Strict thinkingLevelMap (Pi official standard)
    if (meta.thinkingLevelMap && typeof meta.thinkingLevelMap === "object") {
      const result: Array<ReasoningEffort | "default"> = ["default"];
      for (const eff of REASONING_EFFORTS) {
        const val = meta.thinkingLevelMap[eff];
        if (eff === "xhigh" || eff === "max") {
          if (val !== null && val !== undefined) {
            result.push(eff);
          }
        } else {
          if (val !== null) {
            result.push(eff);
          }
        }
      }
      return result;
    }

    // 3. Explicit reasoningEfforts list
    if (Array.isArray(meta.reasoningEfforts) && meta.reasoningEfforts.length > 0) {
      const supportedSet = new Set(meta.reasoningEfforts.map((e) => e.toLowerCase()));
      const result: Array<ReasoningEffort | "default"> = ["default"];
      for (const eff of REASONING_EFFORTS) {
        if (supportedSet.has(eff)) {
          result.push(eff);
        }
      }
      return result;
    }

    // 4. Reasoning is true, but no map or list
    if (meta.reasoning === true) {
      return ["default", "low", "medium", "high"];
    }
  }

  // Heuristics fallback
  if (
    lowerId.includes("gpt-4o") ||
    lowerId.includes("gpt-3.5") ||
    lowerId.includes("claude-3-5-sonnet") ||
    lowerId.includes("claude-3-5-haiku") ||
    lowerId.includes("claude-3-haiku") ||
    lowerId.includes("claude-3-opus") ||
    lowerId.includes("llama")
  ) {
    return ["default"];
  }

  if (
    lowerId.includes("o1") ||
    lowerId.includes("o3") ||
    lowerId.includes("thinking") ||
    lowerId.includes("gemini-2.5") ||
    lowerId.includes("claude-3-7") ||
    lowerId.includes("sonnet-4-5") ||
    lowerId.includes("opus-4-6") ||
    lowerId.includes("deepseek-r1") ||
    lowerId.includes("reasoner")
  ) {
    return ["default", "low", "medium", "high"];
  }

  return [...DEFAULT_EFFORT_OPTIONS];
}
