export interface AgentCategory {
  id: string;
  name: string;
  icon?: string;
  description: string;
  agents: string[];
}

export const ODD_CORE_CATEGORY_ID = "odd-core";
export const JUDGMENT_DAY_CATEGORY_ID = "judgment-day";
export const REVIEWERS_CATEGORY_ID = "reviewers";
export const SDD_CATEGORY_ID = "sdd-core";
export const CUSTOM_CATEGORY_ID = "custom";

export interface CategoryMeta {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export const CATEGORY_DEFINITIONS: Record<string, CategoryMeta> = {
  [ODD_CORE_CATEGORY_ID]: {
    id: ODD_CORE_CATEGORY_ID,
    name: "ODD Core",
    icon: "⚡",
    description: "Organic Driven Development primary delegation agents",
  },
  [JUDGMENT_DAY_CATEGORY_ID]: {
    id: JUDGMENT_DAY_CATEGORY_ID,
    name: "Judgment Day",
    icon: "⚖️",
    description: "Blind dual review judges and fix agent",
  },
  [REVIEWERS_CATEGORY_ID]: {
    id: REVIEWERS_CATEGORY_ID,
    name: "Reviewers",
    icon: "🔍",
    description: "Native code review lenses",
  },
  [SDD_CATEGORY_ID]: {
    id: SDD_CATEGORY_ID,
    name: "SDD On-Demand",
    icon: "📦",
    description: "Spec-Driven Development on-demand phase executor agents",
  },
  [CUSTOM_CATEGORY_ID]: {
    id: CUSTOM_CATEGORY_ID,
    name: "Custom Agents",
    icon: "📦",
    description: "Custom subagents discovered from configuration and profiles",
  },
};

export const SDD_AGENT_CATEGORIES: AgentCategory[] = [
  {
    id: ODD_CORE_CATEGORY_ID,
    name: "ODD Core",
    icon: "⚡",
    description: "Organic Driven Development primary delegation agents",
    agents: [
      "gentle-ai-explore",
      "gentle-ai-worker",
      "gentle-ai-verify",
    ],
  },
  {
    id: JUDGMENT_DAY_CATEGORY_ID,
    name: "Judgment Day",
    icon: "⚖️",
    description: "Blind dual review judges and fix agent",
    agents: ["jd-judge-a", "jd-judge-b", "jd-fix-agent"],
  },
  {
    id: REVIEWERS_CATEGORY_ID,
    name: "Reviewers",
    icon: "🔍",
    description: "Native code review lenses",
    agents: [
      "review-risk",
      "review-readability",
      "review-reliability",
      "review-resilience",
    ],
  },
];

export const ALL_KNOWN_AGENTS = SDD_AGENT_CATEGORIES.flatMap((c) => c.agents);

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
 * Categorizes an agent name semantically by its prefix convention:
 * - gentle-ai-* -> "odd-core"
 * - jd-* -> "judgment-day"
 * - review-* -> "reviewers"
 * - sdd-* -> "sdd-core"
 * - any other -> "custom"
 */
export function categorizeAgent(agent: string): string {
  if (!agent || typeof agent !== "string") {
    return CUSTOM_CATEGORY_ID;
  }
  if (agent.startsWith("gentle-ai-")) {
    return ODD_CORE_CATEGORY_ID;
  }
  if (agent.startsWith("jd-")) {
    return JUDGMENT_DAY_CATEGORY_ID;
  }
  if (agent.startsWith("review-")) {
    return REVIEWERS_CATEGORY_ID;
  }
  if (agent.startsWith("sdd-")) {
    return SDD_CATEGORY_ID;
  }
  return CUSTOM_CATEGORY_ID;
}

/**
 * Returns metadata (id, name, icon, description) for the category of a given agent.
 */
export function getAgentCategoryInfo(agent: string): CategoryMeta {
  const catId = categorizeAgent(agent);
  return CATEGORY_DEFINITIONS[catId] ?? CATEGORY_DEFINITIONS[CUSTOM_CATEGORY_ID];
}

/**
 * Builds an AgentCategory for custom agents discovered at runtime.
 * Returns null if customAgents is empty or contains only invalid/synthetic keys.
 */
export function buildCustomCategory(customAgents: string[]): AgentCategory | null {
  if (!customAgents || !Array.isArray(customAgents) || customAgents.length === 0) {
    return null;
  }
  const validAgents = customAgents
    .filter((a) => a && typeof a === "string" && !isSyntheticAgentKey(a))
    .filter((a, idx, arr) => arr.indexOf(a) === idx)
    .sort((a, b) => a.localeCompare(b));

  if (validAgents.length === 0) {
    return null;
  }
  return {
    id: CUSTOM_CATEGORY_ID,
    name: "Custom Agents",
    icon: "📦",
    description: "Custom subagents discovered from configuration and profiles",
    agents: validAgents,
  };
}

/**
 * Builds dynamic categories grouping discovered agents into their semantic categories.
 * Preserves base categories in order: odd-core, judgment-day, reviewers.
 * Dynamically includes sdd-core if any sdd-* agents are present.
 * Dynamically includes custom if any other agents are present.
 */
export function buildDynamicCategories(discoveredAgents: string[] = []): AgentCategory[] {
  const baseOdd = SDD_AGENT_CATEGORIES.find((c) => c.id === ODD_CORE_CATEGORY_ID)!;
  const baseJd = SDD_AGENT_CATEGORIES.find((c) => c.id === JUDGMENT_DAY_CATEGORY_ID)!;
  const baseRev = SDD_AGENT_CATEGORIES.find((c) => c.id === REVIEWERS_CATEGORY_ID)!;

  const oddCoreAgents = [...baseOdd.agents];
  const judgmentDayAgents = [...baseJd.agents];
  const reviewersAgents = [...baseRev.agents];
  const sddAgents: string[] = [];
  const customAgents: string[] = [];

  const seenOddCore = new Set<string>(oddCoreAgents);
  const seenJudgmentDay = new Set<string>(judgmentDayAgents);
  const seenReviewers = new Set<string>(reviewersAgents);
  const seenSdd = new Set<string>();
  const seenCustom = new Set<string>();

  const extraOdd: string[] = [];
  const extraJd: string[] = [];
  const extraRev: string[] = [];

  if (Array.isArray(discoveredAgents)) {
    for (const agent of discoveredAgents) {
      if (!agent || typeof agent !== "string" || isSyntheticAgentKey(agent)) {
        continue;
      }
      const categoryId = categorizeAgent(agent);
      switch (categoryId) {
        case ODD_CORE_CATEGORY_ID:
          if (!seenOddCore.has(agent)) {
            seenOddCore.add(agent);
            extraOdd.push(agent);
          }
          break;
        case JUDGMENT_DAY_CATEGORY_ID:
          if (!seenJudgmentDay.has(agent)) {
            seenJudgmentDay.add(agent);
            extraJd.push(agent);
          }
          break;
        case REVIEWERS_CATEGORY_ID:
          if (!seenReviewers.has(agent)) {
            seenReviewers.add(agent);
            extraRev.push(agent);
          }
          break;
        case SDD_CATEGORY_ID:
          if (!seenSdd.has(agent)) {
            seenSdd.add(agent);
            sddAgents.push(agent);
          }
          break;
        default:
          if (!seenCustom.has(agent)) {
            seenCustom.add(agent);
            customAgents.push(agent);
          }
          break;
      }
    }
  }

  // Extra agents in base categories are appended sorted
  extraOdd.sort((a, b) => a.localeCompare(b));
  extraJd.sort((a, b) => a.localeCompare(b));
  extraRev.sort((a, b) => a.localeCompare(b));

  oddCoreAgents.push(...extraOdd);
  judgmentDayAgents.push(...extraJd);
  reviewersAgents.push(...extraRev);

  sddAgents.sort((a, b) => a.localeCompare(b));
  customAgents.sort((a, b) => a.localeCompare(b));

  const result: AgentCategory[] = [
    {
      ...baseOdd,
      agents: oddCoreAgents,
    },
    {
      ...baseJd,
      agents: judgmentDayAgents,
    },
    {
      ...baseRev,
      agents: reviewersAgents,
    },
  ];

  if (sddAgents.length > 0) {
    result.push({
      id: SDD_CATEGORY_ID,
      name: "SDD On-Demand",
      icon: "📦",
      description: "Spec-Driven Development on-demand phase executor agents",
      agents: sddAgents,
    });
  }

  if (customAgents.length > 0) {
    result.push({
      id: CUSTOM_CATEGORY_ID,
      name: "Custom Agents",
      icon: "📦",
      description: "Custom subagents discovered from configuration and profiles",
      agents: customAgents,
    });
  }

  return result;
}

/**
 * Resolves standard categories together with dynamically discovered agent categories.
 * Returns populated categories in order: odd-core, judgment-day, reviewers,
 * then sdd-core (if agents exist), then custom (if agents exist).
 */
export function resolveCategories(discoveredAgents?: string[]): AgentCategory[] {
  return buildDynamicCategories(discoveredAgents ?? []);
}
