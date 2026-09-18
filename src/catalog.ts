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
