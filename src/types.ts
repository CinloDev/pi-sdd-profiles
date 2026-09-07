export type ReasoningEffort =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

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
  path?: string;
}

export interface SubagentsConfigFile {
  default_model?: string;
  default_effort?: string;
  active_profile?: string;
  model_profiles?: Record<string, { model: string; effort?: string }>;
  [key: string]: unknown;
}
