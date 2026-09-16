export const REASONING_EFFORTS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

const RESET_EFFORT_TOKENS = new Set([
  "default",
  "predeterminado",
  "heredar",
  "none",
  "-",
  "unset",
]);

/**
 * Normalizes reasoning effort string into a valid ReasoningEffort or undefined (default).
 * Values like "default", "predeterminado", "heredar", "none", "-", "unset" return undefined.
 */
export function parseReasoningEffort(
  value: unknown,
  strict = true
): ReasoningEffort | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    if (strict) {
      throw new Error(`Nivel de esfuerzo inválido: esperado string o undefined, recibido ${typeof value}`);
    }
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "" || RESET_EFFORT_TOKENS.has(normalized)) {
    return undefined;
  }

  if ((REASONING_EFFORTS as readonly string[]).includes(normalized)) {
    return normalized as ReasoningEffort;
  }

  if (strict) {
    throw new Error(
      `Nivel de esfuerzo inválido: "${value}". Valores permitidos: ${REASONING_EFFORTS.join(", ")}, default`
    );
  }

  return undefined;
}

export interface ModelProfileEntry {
  model: string;
  effort?: ReasoningEffort;
}

export interface Profile {
  name: string;
  description?: string;
  default_model?: string;
  default_effort?: ReasoningEffort;
  model_profiles: Record<string, ModelProfileEntry>;
  created_at?: string;
  updated_at?: string;
}

export type ProfileScope = "builtin" | "global" | "project";

export interface ProfileSummary {
  name: string;
  description?: string;
  default_model?: string;
  agent_count: number;
  scope: ProfileScope;
  is_active: boolean;
  active_scope?: "project" | "global";
  path?: string;
}

export interface SubagentsConfigFile {
  default_model?: string;
  default_effort?: string;
  active_profile?: string;
  model_profiles?: Record<string, { model: string; effort?: string }>;
  [key: string]: unknown;
}
