import { describe, it, expect } from "vitest";
import {
  SDD_AGENT_CATEGORIES,
  ALL_KNOWN_AGENTS,
  ODD_CORE_CATEGORY_ID,
  JUDGMENT_DAY_CATEGORY_ID,
  REVIEWERS_CATEGORY_ID,
  SDD_CATEGORY_ID,
  CUSTOM_CATEGORY_ID,
  CATEGORY_DEFINITIONS,
  categorizeAgent,
  getAgentCategoryInfo,
  buildCustomCategory,
  buildDynamicCategories,
  resolveCategories,
  isSyntheticAgentKey,
} from "../src/catalog.js";

describe("catalog module", () => {
  describe("constants and base categories", () => {
    it("should have exactly 3 base categories in SDD_AGENT_CATEGORIES", () => {
      expect(SDD_AGENT_CATEGORIES.length).toBe(3);
      expect(SDD_AGENT_CATEGORIES.map((c) => c.id)).toEqual([
        ODD_CORE_CATEGORY_ID,
        JUDGMENT_DAY_CATEGORY_ID,
        REVIEWERS_CATEGORY_ID,
      ]);
    });

    it("should have exactly 10 active agents in ALL_KNOWN_AGENTS", () => {
      expect(ALL_KNOWN_AGENTS.length).toBe(10);
      expect(ALL_KNOWN_AGENTS).toEqual([
        "gentle-ai-explore",
        "gentle-ai-worker",
        "gentle-ai-verify",
        "jd-judge-a",
        "jd-judge-b",
        "jd-fix-agent",
        "review-risk",
        "review-readability",
        "review-reliability",
        "review-resilience",
      ]);
    });

    it("should define valid metadata in CATEGORY_DEFINITIONS", () => {
      expect(CATEGORY_DEFINITIONS[ODD_CORE_CATEGORY_ID].name).toBe("ODD Core");
      expect(CATEGORY_DEFINITIONS[JUDGMENT_DAY_CATEGORY_ID].name).toBe("Judgment Day");
      expect(CATEGORY_DEFINITIONS[REVIEWERS_CATEGORY_ID].name).toBe("Reviewers");
      expect(CATEGORY_DEFINITIONS[SDD_CATEGORY_ID].name).toBe("SDD On-Demand");
      expect(CATEGORY_DEFINITIONS[CUSTOM_CATEGORY_ID].name).toBe("Custom Agents");
    });
  });

  describe("categorizeAgent", () => {
    it("should classify gentle-ai-* as odd-core", () => {
      expect(categorizeAgent("gentle-ai-explore")).toBe(ODD_CORE_CATEGORY_ID);
      expect(categorizeAgent("gentle-ai-worker")).toBe(ODD_CORE_CATEGORY_ID);
      expect(categorizeAgent("gentle-ai-custom")).toBe(ODD_CORE_CATEGORY_ID);
    });

    it("should classify jd-* as judgment-day", () => {
      expect(categorizeAgent("jd-judge-a")).toBe(JUDGMENT_DAY_CATEGORY_ID);
      expect(categorizeAgent("jd-fix-agent")).toBe(JUDGMENT_DAY_CATEGORY_ID);
    });

    it("should classify review-* as reviewers", () => {
      expect(categorizeAgent("review-risk")).toBe(REVIEWERS_CATEGORY_ID);
      expect(categorizeAgent("review-security")).toBe(REVIEWERS_CATEGORY_ID);
    });

    it("should classify sdd-* as sdd-core", () => {
      expect(categorizeAgent("sdd-explore")).toBe(SDD_CATEGORY_ID);
      expect(categorizeAgent("sdd-archive")).toBe(SDD_CATEGORY_ID);
    });

    it("should classify unknown or non-prefix agents as custom", () => {
      expect(categorizeAgent("my-agent")).toBe(CUSTOM_CATEGORY_ID);
      expect(categorizeAgent("coder-bot")).toBe(CUSTOM_CATEGORY_ID);
      expect(categorizeAgent("")).toBe(CUSTOM_CATEGORY_ID);
      expect(categorizeAgent(null as any)).toBe(CUSTOM_CATEGORY_ID);
    });
  });

  describe("getAgentCategoryInfo", () => {
    it("should return metadata matching the categorized agent", () => {
      const oddInfo = getAgentCategoryInfo("gentle-ai-worker");
      expect(oddInfo.id).toBe(ODD_CORE_CATEGORY_ID);
      expect(oddInfo.name).toBe("ODD Core");

      const customInfo = getAgentCategoryInfo("unknown-bot");
      expect(customInfo.id).toBe(CUSTOM_CATEGORY_ID);
      expect(customInfo.name).toBe("Custom Agents");
    });
  });

  describe("buildCustomCategory", () => {
    it("should return null for empty or invalid input", () => {
      expect(buildCustomCategory([])).toBeNull();
      expect(buildCustomCategory(null as any)).toBeNull();
      expect(buildCustomCategory(["⚡ Asignar a todos", "👑 Orquestador"])).toBeNull();
    });

    it("should deduplicate and sort custom agent names", () => {
      const cat = buildCustomCategory(["zeta", "alpha", "alpha", "beta"]);
      expect(cat).not.toBeNull();
      expect(cat!.id).toBe(CUSTOM_CATEGORY_ID);
      expect(cat!.agents).toEqual(["alpha", "beta", "zeta"]);
    });
  });

  describe("buildDynamicCategories and resolveCategories", () => {
    it("should return base categories when no agents discovered", () => {
      const categories = buildDynamicCategories([]);
      expect(categories.length).toBe(3);
      expect(categories.map((c) => c.id)).toEqual([
        ODD_CORE_CATEGORY_ID,
        JUDGMENT_DAY_CATEGORY_ID,
        REVIEWERS_CATEGORY_ID,
      ]);
    });

    it("should dynamically add sdd-core category when sdd-* agents are discovered", () => {
      const categories = resolveCategories(["sdd-explore", "sdd-tasks"]);
      expect(categories.length).toBe(4);
      expect(categories[3].id).toBe(SDD_CATEGORY_ID);
      expect(categories[3].name).toBe("SDD On-Demand");
      expect(categories[3].agents).toEqual(["sdd-explore", "sdd-tasks"]);
    });

    it("should dynamically add custom category when custom agents are discovered", () => {
      const categories = resolveCategories(["coder-bot"]);
      expect(categories.length).toBe(4);
      expect(categories[3].id).toBe(CUSTOM_CATEGORY_ID);
      expect(categories[3].name).toBe("Custom Agents");
      expect(categories[3].agents).toEqual(["coder-bot"]);
    });

    it("should dynamically add both sdd and custom in order", () => {
      const categories = resolveCategories(["coder-bot", "sdd-explore"]);
      expect(categories.length).toBe(5);
      expect(categories[3].id).toBe(SDD_CATEGORY_ID);
      expect(categories[4].id).toBe(CUSTOM_CATEGORY_ID);
    });

    it("should append extra discovered agents with known prefixes to base categories", () => {
      const categories = resolveCategories([
        "gentle-ai-planner",
        "jd-judge-extra",
        "review-architecture",
      ]);
      expect(categories.length).toBe(3);
      expect(categories[0].agents).toContain("gentle-ai-planner");
      expect(categories[1].agents).toContain("jd-judge-extra");
      expect(categories[2].agents).toContain("review-architecture");
    });
  });

  describe("isSyntheticAgentKey", () => {
    it("should identify synthetic menu keys", () => {
      expect(isSyntheticAgentKey("⚡ Asignar a todos")).toBe(true);
      expect(isSyntheticAgentKey("🧠 Esfuerzo")).toBe(true);
      expect(isSyntheticAgentKey("📦 Categoria")).toBe(true);
      expect(isSyntheticAgentKey("👑 Orquestador")).toBe(true);
      expect(isSyntheticAgentKey("agent with spaces")).toBe(true);
      expect(isSyntheticAgentKey("")).toBe(true);
      expect(isSyntheticAgentKey(null as any)).toBe(true);
    });

    it("should return false for valid agent keys", () => {
      expect(isSyntheticAgentKey("gentle-ai-explore")).toBe(false);
      expect(isSyntheticAgentKey("coder-bot")).toBe(false);
      expect(isSyntheticAgentKey("jd-judge-a")).toBe(false);
    });
  });
});
