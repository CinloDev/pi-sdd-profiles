import { describe, it, expect, vi } from "vitest";
import {
  formatProfileList,
  formatProfileDetail,
  runInteractiveProfileCreate,
} from "../src/ui.js";
import type { Profile, ProfileSummary } from "../src/types.js";

describe("ui formatting module", () => {
  const summaries: ProfileSummary[] = [
    {
      name: "cinlo-flash",
      description: "Gemini flash",
      default_model: "cpamc/cinlo/gemini-3.8-flash-high",
      agent_count: 14,
      scope: "global",
      is_active: true,
    },
    {
      name: "claude-frontier",
      description: "Claude 4.5",
      default_model: "anthropic/claude-sonnet-4-5",
      agent_count: 8,
      scope: "builtin",
      is_active: false,
    },
  ];

  it("should format profile list correctly with badges", () => {
    const output = formatProfileList(summaries, "cinlo-flash");
    expect(output).toContain("cinlo-flash");
    expect(output).toContain("[ACTIVO]");
    expect(output).toContain("(global)");
    expect(output).toContain("claude-frontier");
    expect(output).toContain("(builtin)");
  });

  it("should format detailed profile view categorized", () => {
    const profile: Profile = {
      name: "cinlo-flash",
      description: "Fast setup",
      default_model: "cpamc/cinlo/gemini-3.8-flash-high",
      default_effort: "high",
      model_profiles: {
        "sdd-explore": { model: "cpamc/cinlo/gemini-3.8-flash-high", effort: "low" },
        "jd-judge-a": { model: "cpamc/cinlo/gemini-3.8-flash-high", effort: "high" },
        "custom-special": { model: "special-model", effort: "medium" },
      },
    };

    const output = formatProfileDetail(profile, true);
    expect(output).toContain("Perfil SDD: cinlo-flash");
    expect(output).toContain("[ACTIVO]");
    expect(output).toContain("Núcleo SDD");
    expect(output).toContain("`sdd-explore`: `cpamc/cinlo/gemini-3.8-flash-high` (effort: low)");
    expect(output).toContain("Judgment Day");
    expect(output).toContain("`jd-judge-a`");
    expect(output).toContain("Otros Agentes");
    expect(output).toContain("`custom-special`");
  });

  it("should guide profile creation via interactive wizard", async () => {
    const mockManager = {
      createProfile: vi.fn(() => ({ success: true, message: "OK" })),
      activateProfile: vi.fn(() => ({ success: true, message: "Activated" })),
    };

    const mockCtx = {
      ui: {
        input: vi
          .fn()
          .mockResolvedValueOnce("wizard-profile") // name
          .mockResolvedValueOnce("Wizard created") // desc
          .mockResolvedValueOnce("test/model"), // model
        select: vi.fn().mockResolvedValueOnce("high"), // effort
        confirm: vi.fn().mockResolvedValueOnce(true), // activate now
        notify: vi.fn(),
      },
    };

    const res = await runInteractiveProfileCreate(mockManager as any, mockCtx as any);
    expect(res).toBe("OK");
    expect(mockManager.createProfile).toHaveBeenCalledWith({
      name: "wizard-profile",
      description: "Wizard created",
      default_model: "test/model",
      default_effort: "high",
      scope: "global",
    });
    expect(mockManager.activateProfile).toHaveBeenCalledWith("wizard-profile", "global");
  });
});
