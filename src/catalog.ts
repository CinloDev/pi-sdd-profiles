export interface AgentCategory {
  id: string;
  name: string;
  description: string;
  agents: string[];
}

export const SDD_AGENT_CATEGORIES: AgentCategory[] = [
  {
    id: "sdd-core",
    name: "SDD Core",
    description: "Spec-Driven Development phase executor agents",
    agents: [
      "sdd-explore",
      "sdd-propose",
      "sdd-spec",
      "sdd-design",
      "sdd-tasks",
      "sdd-apply",
      "sdd-verify",
      "sdd-archive",
    ],
  },
  {
    id: "judgment-day",
    name: "Judgment Day",
    description: "Blind dual review judges and fix agent",
    agents: ["jd-judge-a", "jd-judge-b", "jd-fix-agent"],
  },
  {
    id: "reviewers",
    name: "Reviewers & Auditors",
    description: "Quality, security, and architectural review lenses",
    agents: [
      "security-auditor",
      "review-readability",
      "review-reliability",
      "review-resilience",
      "review-validator",
      "review-refuter",
      "review-risk",
    ],
  },
  {
    id: "general",
    name: "General Harness",
    description: "General subagents for code, exploration, and tracking",
    agents: [
      "gentle-ai-explore",
      "gentle-ai-worker",
      "gentle-ai-verify",
      "ui-specialist",
      "task-tracker-manager",
    ],
  },
];

export const ALL_KNOWN_AGENTS = SDD_AGENT_CATEGORIES.flatMap((c) => c.agents);

export const CUSTOM_CATEGORY_ID = "custom";

/**
 * Returns true if key represents a synthetic menu item or invalid agent key
 * (keys starting with ⚡, 🧠, 📦, 👑, containing [Asignar or containing whitespace).
 */
export function isSyntheticAgentKey(key: string): boolean {
  if (!key || typeof key !== "string") {
    return true;
  }
  if (
    key.startsWith("⚡") ||
    key.startsWith("🧠") ||
    key.startsWith("📦") ||
    key.startsWith("👑") ||
    key.includes("[Asignar") ||
    /\s/.test(key)
  ) {
    return true;
  }
  return false;
}

/**
 * Builds an AgentCategory for custom agents discovered at runtime.
 * Returns null if customAgents is empty.
 */
export function buildCustomCategory(customAgents: string[]): AgentCategory | null {
  if (!customAgents || customAgents.length === 0) {
    return null;
  }
  return {
    id: CUSTOM_CATEGORY_ID,
    name: "Custom Agents",
    description: "Custom subagents discovered from configuration and profiles",
    agents: [...customAgents].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Resolves standard SDD categories together with an optional Custom Agents category.
 */
export function resolveCategories(customAgents: string[]): AgentCategory[] {
  const customCat = buildCustomCategory(customAgents);
  if (!customCat) {
    return [...SDD_AGENT_CATEGORIES];
  }
  return [...SDD_AGENT_CATEGORIES, customCat];
}
