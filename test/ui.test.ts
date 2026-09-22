import { describe, it, expect, vi } from "vitest";
import {
  formatProfileList,
  formatProfileDetail,
  runInteractiveProfileCreate,
  runInteractiveProfileSelect,
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
    expect(output).toContain("[ACTIVO");
    expect(output).toContain("(global)");
    expect(output).toContain("claude-frontier");
    expect(output).toContain("(builtin)");
  });

  it("should display active_scope in profile list when present", () => {
    const withScope: ProfileSummary[] = [
      {
        ...summaries[0],
        active_scope: "project",
      },
    ];
    const output = formatProfileList(withScope, "cinlo-flash");
    expect(output).toContain("[ACTIVO (project)]");
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
    expect(output).toContain("SDD On-Demand");
    expect(output).toContain("`sdd-explore`: `cpamc/cinlo/gemini-3.8-flash-high` (effort: low)");
    expect(output).toContain("Judgment Day");
    expect(output).toContain("`jd-judge-a`");
    expect(output).toContain("Otros Agentes");
    expect(output).toContain("`custom-special`");
  });

  it("should guide profile creation via interactive wizard with model select dropdown", async () => {
    const mockManager = {
      createProfile: vi.fn(() => ({ success: true, message: "OK" })),
      activateProfile: vi.fn(() => ({ success: true, message: "Activated" })),
    };

    const mockCtx = {
      ui: {
        input: vi
          .fn()
          .mockResolvedValueOnce("wizard-profile") // name
          .mockResolvedValueOnce("Wizard created"), // desc
        select: vi
          .fn()
          .mockResolvedValueOnce("anthropic/claude-sonnet-4-5") // model select from dropdown!
          .mockResolvedValueOnce("high") // effort select
          .mockResolvedValueOnce("🚀 Aplicar a todos"), // strategy
        confirm: vi.fn().mockResolvedValueOnce(true), // activate now
        notify: vi.fn(),
      },
    };

    const res = await runInteractiveProfileCreate(mockManager as any, mockCtx as any);
    expect(res).toBe("OK");
    expect(mockManager.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "wizard-profile",
        description: "Wizard created",
        default_model: "anthropic/claude-sonnet-4-5",
        default_effort: "high",
        scope: "global",
      })
    );
    expect(mockManager.activateProfile).toHaveBeenCalledWith("wizard-profile", "global");
  });

  it("should allow editing profile models interactively", async () => {
    const mockProfile: Profile = {
      name: "edit-me",
      default_model: "old/model",
      default_effort: "low",
      model_profiles: {},
    };

    const mockManager = {
      getProfile: vi.fn(() => mockProfile),
      createProfile: vi.fn(() => ({ success: true, message: "Saved" })),
    };

    const mockCtx = {
      ui: {
        select: vi
          .fn()
          .mockResolvedValueOnce("🎯 Cambiar modelo por defecto [old/model]")
          .mockResolvedValueOnce("anthropic/claude-sonnet-4-5") // picked new model from list
          .mockResolvedValueOnce("💾 Guardar y Salir"),
        notify: vi.fn(),
      },
    };

    const res = await (await import("../src/ui.js")).runInteractiveProfileEdit(
      mockManager as any,
      mockCtx as any,
      "edit-me"
    );

    expect(res).toBe("Saved");
    expect(mockManager.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "edit-me",
        default_model: "anthropic/claude-sonnet-4-5",
      })
    );
  });

  it("should allow renaming profile interactively in fallback selector", async () => {
    const mockManager: any = {
      listProfiles: vi.fn(() => [
        { name: "custom-p", scope: "global", agent_count: 5, is_active: false },
        { name: "builtin-p", scope: "builtin", agent_count: 5, is_active: false },
      ]),
      getActiveProfileName: vi.fn(() => null),
      renameProfile: vi.fn(() => ({ success: true, message: 'Perfil renombrado a "renamed-p".' })),
    };

    const mockCtx: any = {
      ui: {
        select: vi
          .fn()
          .mockResolvedValueOnce("📝 [Renombrar un perfil...]")
          .mockResolvedValueOnce("custom-p"),
        input: vi.fn().mockResolvedValueOnce("renamed-p"),
        notify: vi.fn(),
      },
    };

    const res = await runInteractiveProfileSelect(mockManager, mockCtx);
    expect(res).toContain("renamed-p");
    expect(mockManager.renameProfile).toHaveBeenCalledWith("custom-p", "renamed-p");
  });

  it("should allow deleting profile interactively in fallback selector", async () => {
    const mockManager: any = {
      listProfiles: vi.fn(() => [
        { name: "custom-p", scope: "global", agent_count: 5, is_active: false },
      ]),
      getActiveProfileName: vi.fn(() => null),
      deleteProfile: vi.fn(() => true),
    };

    const mockCtx: any = {
      ui: {
        select: vi
          .fn()
          .mockResolvedValueOnce("🗑️ [Eliminar un perfil...]")
          .mockResolvedValueOnce("custom-p"),
        confirm: vi.fn().mockResolvedValueOnce(true),
        notify: vi.fn(),
      },
    };

    const res = await runInteractiveProfileSelect(mockManager, mockCtx);
    expect(res).toContain('Perfil "custom-p" eliminado.');
    expect(mockManager.deleteProfile).toHaveBeenCalledWith("custom-p");
  });

  it("should reset default_effort when default/heredar is chosen in interactive edit", async () => {
    const mockProfile: Profile = {
      name: "edit-effort",
      default_model: "test/model",
      default_effort: "high",
      model_profiles: {},
    };

    const mockManager = {
      getProfile: vi.fn(() => ({ ...mockProfile })),
      createProfile: vi.fn(() => ({ success: true, message: "Saved" })),
    };

    const mockCtx = {
      ui: {
        select: vi
          .fn()
          .mockResolvedValueOnce("🧠 Cambiar esfuerzo por defecto [high]")
          .mockResolvedValueOnce("default (heredar / sin forzar)")
          .mockResolvedValueOnce("💾 Guardar y Salir"),
        notify: vi.fn(),
      },
    };

    const res = await (await import("../src/ui.js")).runInteractiveProfileEdit(
      mockManager as any,
      mockCtx as any,
      "edit-effort"
    );

    expect(res).toBe("Saved");
    expect(mockManager.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "edit-effort",
        default_effort: undefined,
      })
    );
  });
});
