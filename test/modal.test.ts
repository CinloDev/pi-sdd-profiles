import { describe, it, expect, vi } from "vitest";
import { createSddProfilesModal } from "../src/modal.js";

describe("modal overlay component", () => {
  const mockProfiles = [
    {
      name: "cin",
      description: "My profile",
      default_model: "cpamc/cin82/gemini-3.8-flash-high",
      agent_count: 20,
      scope: "global" as const,
      is_active: true,
    },
    {
      name: "deep-reasoning",
      description: "Deep thinking",
      default_model: "openai/o3-mini",
      agent_count: 10,
      scope: "builtin" as const,
      is_active: false,
    },
  ];

  const mockProfileDetails = {
    name: "cin",
    default_model: "cpamc/cin82/gemini-3.8-flash-high",
    default_effort: "high" as const,
    model_profiles: {
      "sdd-explore": { model: "cpamc/cin82/gemini-3.8-flash-high", effort: "high" as const },
    },
  };

  const mockManager: any = {
    listProfiles: vi.fn(() => [...mockProfiles]),
    getActiveProfileName: vi.fn(() => "cin"),
    getProfile: vi.fn(() => ({ ...mockProfileDetails })),
    activateProfile: vi.fn((name) => ({ success: true, profile: mockProfileDetails, message: "OK" })),
    createProfile: vi.fn(() => ({ success: true })),
    deleteProfile: vi.fn(() => true),
  };

  const availableModels = [
    "cpamc/cin82/gemini-3.8-flash-high",
    "anthropic/claude-sonnet-4-5",
    "openai/o3-mini",
  ];

  it("should render the main profile list correctly", () => {
    const done = vi.fn();
    const modal = createSddProfilesModal({
      manager: mockManager,
      availableModels,
      done,
    });

    const lines = modal.render(80);
    expect(lines.length).toBeGreaterThan(5);
    const content = lines.join("\n");
    expect(content).toContain("SDD Profile Manager");
    expect(content).toContain("cin");
    expect(content).toContain("deep-reasoning");
  });

  it("should navigate with arrow keys and activate on Enter", () => {
    const done = vi.fn();
    const onProfileActivated = vi.fn();
    const modal = createSddProfilesModal({
      manager: mockManager,
      availableModels,
      onProfileActivated,
      done,
    });

    // Press down in Application Cursor / SS3 mode (\u001bOB) to select deep-reasoning
    modal.handleInput("\u001bOB"); // down in SS3 mode
    // Press enter to activate
    modal.handleInput("\r"); // enter

    expect(mockManager.activateProfile).toHaveBeenCalledWith("deep-reasoning", "global");
    expect(done).toHaveBeenCalledWith({ action: "activated", profileName: "deep-reasoning" });
  });

  it("should open create view on 'n', accept typed input and enter editor", () => {
    const done = vi.fn();
    mockManager.createProfile.mockReturnValueOnce({
      success: true,
      profile: {
        name: "nuevo-perfil",
        default_model: "anthropic/claude-sonnet-4-5",
        default_effort: "high",
        model_profiles: {},
      },
    });

    const modal = createSddProfilesModal({
      manager: mockManager,
      availableModels,
      done,
    });

    // Press 'n' to create
    modal.handleInput("n");
    let lines = modal.render(80);
    expect(lines.join("\n")).toContain("Nuevo Perfil SDD");

    // Type "test"
    modal.handleInput("t");
    modal.handleInput("e");
    modal.handleInput("s");
    modal.handleInput("t");

    // Press Enter to confirm creation
    modal.handleInput("\r");

    expect(mockManager.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "test" })
    );

    // After creation, it immediately opens the editor
    lines = modal.render(80);
    expect(lines.join("\n")).toContain("Editar Perfil");
    expect(lines.join("\n")).toContain("Orquestador");
  });

  it("should open profile editor on 'e' and allow model picker navigation", () => {
    const done = vi.fn();
    const modal = createSddProfilesModal({
      manager: mockManager,
      availableModels,
      done,
    });

    // Press 'e' on 'cin'
    modal.handleInput("e");
    let lines = modal.render(80);
    let content = lines.join("\n");
    expect(content).toContain("Editar Perfil: cin");
    expect(content).toContain("sdd-explore");

    // Press 'm' to open model picker (for orchestrator)
    modal.handleInput("m");
    lines = modal.render(80);
    content = lines.join("\n");
    expect(content).toContain("Seleccionar Modelo");
    expect(content).toContain("anthropic/claude-sonnet-4-5");

    // Press 'esc' to exit picker back to editor
    modal.handleInput("\u001b");
    lines = modal.render(80);
    content = lines.join("\n");
    expect(content).toContain("Editar Perfil: cin");

    // Move down to index 1: "Asignar a TODOS los subagentes"
    modal.handleInput("\u001b[B"); // down
    modal.handleInput("\r"); // enter
    lines = modal.render(80);
    content = lines.join("\n");
    expect(content).toContain("TODOS los subagentes");

    // Select second model (anthropic/claude-sonnet-4-5)
    modal.handleInput("\u001b[B"); // down
    modal.handleInput("\r"); // enter
    lines = modal.render(80);
    content = lines.join("\n");
    expect(content).toContain("Nivel de Razonamiento"); // Prompted for effort!

    // Select effort (high) and confirm
    modal.handleInput("\u001b[B"); // down
    modal.handleInput("\r"); // enter (confirms effort)

    // Now back in editor. Move down to sdd-explore to customize individually
    modal.handleInput("\u001b[B"); // down to index 2 (All effort)
    modal.handleInput("\u001b[B"); // down to index 3 (Category)
    modal.handleInput("\u001b[B"); // down to index 4 (sdd-explore)
    modal.handleInput("\r"); // enter
    lines = modal.render(80);
    content = lines.join("\n");
    expect(content).toContain("Agente: sdd-explore");

    // Select third model (openai/o3-mini) for sdd-explore individually
    modal.handleInput("\u001b[B");
    modal.handleInput("\u001b[B");
    modal.handleInput("\r"); // enter -> opens effort picker!
    lines = modal.render(80);
    content = lines.join("\n");
    expect(content).toContain("Nivel de Razonamiento");

    // Select low effort and confirm
    modal.handleInput("\u001b[B"); // down
    modal.handleInput("\u001b[B"); // down
    modal.handleInput("\r"); // enter (confirms effort)

    // Press 'esc' to exit editor back to main list
    modal.handleInput("\u001b");
    lines = modal.render(80);
    content = lines.join("\n");
    expect(content).toContain("SDD Profile Manager");
  });

  it("should close on 'esc' from main view", () => {
    const done = vi.fn();
    const modal = createSddProfilesModal({
      manager: mockManager,
      availableModels,
      done,
    });

    modal.handleInput("\u001b"); // esc
    expect(done).toHaveBeenCalledWith({ action: "closed" });
  });
});
