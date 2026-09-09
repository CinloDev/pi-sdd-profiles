import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSddProfilesModal } from "../src/modal.js";

describe("modal overlay component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
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

  it("should navigate with arrow keys and activate on Enter without immediately closing", () => {
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
    expect(onProfileActivated).toHaveBeenCalledWith(mockProfileDetails);
    // Modal stays open with feedback message!
    expect(done).not.toHaveBeenCalled();
    const lines = modal.render(80);
    expect(lines.join("\n")).toContain("activado con éxito");

    // User can close with Esc when ready
    modal.handleInput("\u001b");
    expect(done).toHaveBeenCalledWith({ action: "closed" });
  });

  it("should filter models in model picker as user types and select matching model", () => {
    const done = vi.fn();
    const modal = createSddProfilesModal({
      manager: mockManager,
      availableModels: [
        "anthropic/claude-sonnet-4-5",
        "openai/gpt-4o",
        "google/gemini-2.5-flash",
        "cpamc/cin82/gemini-3.8-flash-high",
      ],
      done,
    });

    // Open editor on first profile
    modal.handleInput("e");
    // Open model picker for orchestrator
    modal.handleInput("m");

    let lines = modal.render(80);
    expect(lines.join("\n")).toContain("Filtrar:");
    expect(lines.join("\n")).toContain("claude-sonnet-4-5");

    // Type "flash" to filter
    modal.handleInput("f");
    modal.handleInput("l");
    modal.handleInput("a");
    modal.handleInput("s");
    modal.handleInput("h");

    lines = modal.render(80);
    const content = lines.join("\n");
    expect(content).toContain("gemini-2.5-flash");
    expect(content).toContain("gemini-3.8-flash-high");
    expect(content).not.toContain("claude-sonnet-4-5");
    expect(content).not.toContain("gpt-4o");

    // Backspace to delete 'h'
    modal.handleInput("\u007f");
    lines = modal.render(80);
    expect(lines.join("\n")).toContain("flas");

    // Press Enter to select first filtered model
    modal.handleInput("\r");
    lines = modal.render(80);
    expect(lines.join("\n")).toContain("Nivel de Razonamiento");
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

  it("should prompt confirmation when deleting a custom profile and delete on confirm", () => {
    const done = vi.fn();
    mockManager.deleteProfile.mockReturnValueOnce(true);
    const modal = createSddProfilesModal({
      manager: mockManager,
      availableModels,
      done,
    });

    // Index 0 is "cin" (global)
    // Press 'd' to initiate delete
    modal.handleInput("d");
    let lines = modal.render(80);
    expect(lines.join("\n")).toContain("Confirmar Eliminación");
    expect(lines.join("\n")).toContain("cin");

    // Cancel with Esc first
    modal.handleInput("\u001b");
    lines = modal.render(80);
    expect(lines.join("\n")).toContain("SDD Profile Manager");
    expect(mockManager.deleteProfile).not.toHaveBeenCalled();

    // Press 'd' again and confirm with Enter
    modal.handleInput("d");
    modal.handleInput("\r");
    expect(mockManager.deleteProfile).toHaveBeenCalledWith("cin");
    lines = modal.render(80);
    expect(lines.join("\n")).toContain("eliminado");
  });

  it("should support physical delete key and allow deleting any profile with confirmation", () => {
    const done = vi.fn();
    mockManager.deleteProfile.mockReturnValueOnce(true);
    const modal = createSddProfilesModal({
      manager: mockManager,
      availableModels,
      done,
    });

    // Move to index 1 ("deep-reasoning", builtin)
    modal.handleInput("\u001b[B"); // down
    // Press Delete key (\u001b[3~)
    modal.handleInput("\u001b[3~");

    // Opens confirmation dialog
    let lines = modal.render(80);
    expect(lines.join("\n")).toContain("Confirmar Eliminación");
    expect(lines.join("\n")).toContain("deep-reasoning");

    // Confirm with Enter
    modal.handleInput("\r");
    expect(mockManager.deleteProfile).toHaveBeenCalledWith("deep-reasoning");
    lines = modal.render(80);
    expect(lines.join("\n")).toContain("eliminado");
  });

  it("should rename any profile on 'r' including builtin profiles", () => {
    const done = vi.fn();
    mockManager.renameProfile = vi.fn((oldName, newName) => ({
      success: true,
      message: `Perfil "${oldName}" renombrado correctamente a "${newName}".`,
    }));

    const modal = createSddProfilesModal({
      manager: mockManager,
      availableModels,
      done,
    });

    // Index 0 is "cin" (global)
    // Press 'r' to rename
    modal.handleInput("r");
    let lines = modal.render(80);
    expect(lines.join("\n")).toContain("Renombrar Perfil");
    expect(lines.join("\n")).toContain("cin");

    // Type "-updated"
    "-updated".split("").forEach((ch) => modal.handleInput(ch));
    // Press Enter
    modal.handleInput("\r");

    expect(mockManager.renameProfile).toHaveBeenCalledWith("cin", "cin-updated");
    lines = modal.render(80);
    expect(lines.join("\n")).toContain("renombrado");

    // Move to builtin profile (index 1: deep-reasoning) and press 'r'
    modal.handleInput("\u001b[B"); // down
    modal.handleInput("r");
    lines = modal.render(80);
    expect(lines.join("\n")).toContain("Renombrar Perfil");
    expect(lines.join("\n")).toContain("deep-reasoning");

    // Confirm rename of builtin
    modal.handleInput("\r");
    expect(mockManager.renameProfile).toHaveBeenCalledWith("deep-reasoning", "deep-reasoning");
  });

  it("should display contextualized default effort and clear default_effort when default is chosen", () => {
    const done = vi.fn();
    const modal = createSddProfilesModal({
      manager: mockManager,
      availableModels,
      done,
    });

    // Press 'e' on 'cin' (which has default_effort: "high")
    modal.handleInput("e");
    // Press 'm' to open model picker for orchestrator
    modal.handleInput("m");
    // Select first model (google/gemini-2.5-flash) with enter -> opens effort picker
    modal.handleInput("\r");

    let lines = modal.render(80);
    let content = lines.join("\n");
    expect(content).toContain("predeterminado del proveedor / sin forzar");

    // Index 0 in EFFORT_OPTIONS is "default"
    // Press enter to choose "default"
    modal.handleInput("\r");

    // Back in editor: orchestrator should now have no explicit effort
    lines = modal.render(80);
    content = lines.join("\n");
    expect(content).toContain("Orquestador");
  });
});
