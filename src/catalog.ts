export interface AgentCategory {
  id: string;
  name: string;
  description: string;
  agents: string[];
}

export const SDD_AGENT_CATEGORIES: AgentCategory[] = [
  {
    id: "sdd-core",
    name: "Núcleo SDD",
    description: "Agentes ejecutores de fases de Spec-Driven Development",
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
    description: "Revisión dual ciega, jueces y corrección",
    agents: ["jd-judge-a", "jd-judge-b", "jd-fix-agent"],
  },
  {
    id: "reviewers",
    name: "Revisores y Auditores",
    description: "Lentes de calidad, seguridad y arquitectura",
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
    name: "Harness General",
    description: "Subagentes generales para tareas exploratorias y de código",
    agents: [
      "gentle-ai-explore",
      "gentle-ai-worker",
      "gentle-ai-verify",
      "ui-specialist",
    ],
  },
];

export const ALL_KNOWN_AGENTS = SDD_AGENT_CATEGORIES.flatMap((c) => c.agents);
