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
    // Press enter to open scope selection dialog
    modal.handleInput("\r"); // enter

    const scopeLines = modal.render(80);
    expect(scopeLines.join("\n")).toContain("Seleccionar Alcance");
    expect(scopeLines.join("\n")).toContain("Solo en este proyecto");
    expect(scopeLines.join("\n")).toContain("Global para toda la máquina");

    // Press '2' to activate globally
    modal.handleInput("2");

    expect(mockManager.activateProfile).toHaveBeenCalledWith("deep-reasoning", "global");
    expect(onProfileActivated).toHaveBeenCalledWith(mockProfileDetails);
    // Modal stays open with feedback message!
    expect(done).not.toHaveBeenCalled();
    const lines = modal.render(80);
    expect(lines.join("\n")).toContain("activado");

    // User can close with Esc when ready
    modal.handleInput("\u001b");
    expect(done).toHaveBeenCalledWith({ action: "closed" });
  });

  it("should activate for project scope when selecting option 1 in scope dialog", () => {
    const done = vi.fn();
    const onProfileActivated = vi.fn();
    const modal = createSddProfilesModal({
      manager: mockManager,
      availableModels,
      onProfileActivated,
      done,
    });

    modal.handleInput("\u001bOB"); // select deep-reasoning
    modal.handleInput("\r"); // open scope dialog
    modal.handleInput("1"); // select option 1 (project)

    expect(mockManager.activateProfile).toHaveBeenCalledWith("deep-reasoning", "project");
    expect(onProfileActivated).toHaveBeenCalledWith(mockProfileDetails);
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

  describe("mouse interactions", () => {
    it("should handle wheel down and wheel up to navigate profiles list", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      expect(typeof (modal as any).handleMouse).toBe("function");

      modal.render(80);

      // Mouse wheel down (wheelDelta > 0)
      const resDown = (modal as any).handleMouse({
        type: "wheel",
        button: "none",
        x: 10,
        y: 5,
        screenX: 10,
        screenY: 5,
        width: 80,
        height: 15,
        shift: false,
        alt: false,
        ctrl: false,
        wheelDelta: 1,
      });

      expect(resDown?.handled).toBe(true);

      let lines = modal.render(80);
      // deep-reasoning (index 1) should now be selected with cursor ›
      expect(lines.join("\n")).toMatch(/›\s+.*deep-reasoning/);

      // Mouse wheel up (wheelDelta < 0)
      const resUp = (modal as any).handleMouse({
        type: "wheel",
        button: "none",
        x: 10,
        y: 5,
        screenX: 10,
        screenY: 5,
        width: 80,
        height: 15,
        shift: false,
        alt: false,
        ctrl: false,
        wheelDelta: -1,
      });

      expect(resUp?.handled).toBe(true);
      lines = modal.render(80);
      // cin (index 0) should be selected again
      expect(lines.join("\n")).toMatch(/›\s+.*cin\b/);
    });

    it("should select a profile item on left click and activate on double click", () => {
      const done = vi.fn();
      const onProfileActivated = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        onProfileActivated,
        done,
      });

      const lines = modal.render(80);
      // Find row index of "deep-reasoning"
      const deepReasoningRowIndex = lines.findIndex((l) => l.includes("deep-reasoning"));
      expect(deepReasoningRowIndex).toBeGreaterThan(0);

      // Single click on deep-reasoning row
      const clickRes = (modal as any).handleMouse({
        type: "click",
        button: "left",
        x: 15,
        y: deepReasoningRowIndex,
        screenX: 15,
        screenY: deepReasoningRowIndex,
        width: 80,
        height: lines.length,
        shift: false,
        alt: false,
        ctrl: false,
        clickCount: 1,
      });

      expect(clickRes?.handled).toBe(true);
      let updatedLines = modal.render(80);
      expect(updatedLines.join("\n")).toMatch(/›\s+.*deep-reasoning/);
      expect(mockManager.activateProfile).not.toHaveBeenCalled();

      // Double click on deep-reasoning row opens scope selection dialog
      const doubleClickRes = (modal as any).handleMouse({
        type: "click",
        button: "left",
        x: 15,
        y: deepReasoningRowIndex,
        screenX: 15,
        screenY: deepReasoningRowIndex,
        width: 80,
        height: lines.length,
        shift: false,
        alt: false,
        ctrl: false,
        clickCount: 2,
      });

      expect(doubleClickRes?.handled).toBe(true);
      const scopeLines = modal.render(80);
      expect(scopeLines.join("\n")).toContain("Seleccionar Alcance");

      // Press 2 to activate globally
      modal.handleInput("2");
      expect(mockManager.activateProfile).toHaveBeenCalledWith("deep-reasoning", "global");
      expect(onProfileActivated).toHaveBeenCalled();
    });

    it("should trigger actions when clicking on shortcut buttons", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      const lines = modal.render(100);
      // Find shortcuts line
      const shortcutsRowIndex = lines.findIndex((l) => l.includes("[Esc]") && l.includes("Salir"));
      expect(shortcutsRowIndex).toBeGreaterThan(0);

      const shortcutsLine = lines[shortcutsRowIndex];
      const escPos = shortcutsLine.indexOf("[Esc]");
      expect(escPos).toBeGreaterThan(0);

      // Click on [Esc]
      const clickRes = (modal as any).handleMouse({
        type: "click",
        button: "left",
        x: escPos + 2,
        y: shortcutsRowIndex,
        screenX: escPos + 2,
        screenY: shortcutsRowIndex,
        width: 80,
        height: lines.length,
        shift: false,
        alt: false,
        ctrl: false,
        clickCount: 1,
      });

      expect(clickRes?.handled).toBe(true);
      expect(done).toHaveBeenCalledWith({ action: "closed" });
    });

    it("should handle wheel and clicks in profile editor and model picker", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels: [
          "anthropic/claude-sonnet-4-5",
          "openai/gpt-4o",
          "google/gemini-pro",
        ],
        done,
      });

      modal.render(80);
      // Press 'e' to enter profile editor
      modal.handleInput("e");
      let lines = modal.render(80);
      expect(lines.join("\n")).toContain("Editar Perfil: cin");

      // Wheel down in editor
      (modal as any).handleMouse({
        type: "wheel",
        button: "none",
        x: 10,
        y: 5,
        screenX: 10,
        screenY: 5,
        width: 80,
        height: lines.length,
        shift: false,
        alt: false,
        ctrl: false,
        wheelDelta: 1,
      });

      lines = modal.render(80);
      // Row 1 in editor is ASSIGN_ALL_SUBAGENTS_KEY
      expect(lines.join("\n")).toMatch(/›\s+.*Asignar un mismo modelo a TODOS/);

      // Press Enter to open model picker for all
      modal.handleInput("\r");
      lines = modal.render(80);
      expect(lines.join("\n")).toContain("Asignar modelo a:");

      // Wheel down in picker
      (modal as any).handleMouse({
        type: "wheel",
        button: "none",
        x: 10,
        y: 6,
        screenX: 10,
        screenY: 6,
        width: 80,
        height: lines.length,
        shift: false,
        alt: false,
        ctrl: false,
        wheelDelta: 1,
      });

      lines = modal.render(80);
      expect(lines.join("\n")).toMatch(/›\s+openai\/.*gpt-4o/);

      // Find the row of "google/gemini-pro"
      const geminiRow = lines.findIndex((l) => l.includes("google/gemini-pro"));
      expect(geminiRow).toBeGreaterThan(0);

      // Double click on gemini
      (modal as any).handleMouse({
        type: "click",
        button: "left",
        x: 15,
        y: geminiRow,
        screenX: 15,
        screenY: geminiRow,
        width: 80,
        height: lines.length,
        shift: false,
        alt: false,
        ctrl: false,
        clickCount: 2,
      });

      lines = modal.render(80);
      // Opens effort picker!
      expect(lines.join("\n")).toContain("Nivel de Razonamiento");
    });

    it("should ignore right clicks, move events, wheel with zero delta, or out-of-bounds clicks", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      modal.render(80);

      // Right click
      const rightClick = (modal as any).handleMouse({
        type: "click",
        button: "right",
        x: 10,
        y: 5,
        screenX: 10,
        screenY: 5,
        width: 80,
        height: 15,
        shift: false,
        alt: false,
        ctrl: false,
      });
      expect(rightClick).toBeUndefined();

      // Move event
      const moveEvent = (modal as any).handleMouse({
        type: "move",
        button: "none",
        x: 10,
        y: 5,
        screenX: 10,
        screenY: 5,
        width: 80,
        height: 15,
        shift: false,
        alt: false,
        ctrl: false,
      });
      expect(moveEvent).toBeUndefined();

      // Wheel with 0 delta
      const wheelZero = (modal as any).handleMouse({
        type: "wheel",
        button: "none",
        x: 10,
        y: 5,
        screenX: 10,
        screenY: 5,
        width: 80,
        height: 15,
        shift: false,
        alt: false,
        ctrl: false,
        wheelDelta: 0,
      });
      expect(wheelZero).toBeUndefined();

      // Click on row 0 (top border)
      const borderClick = (modal as any).handleMouse({
        type: "click",
        button: "left",
        x: 10,
        y: 0,
        screenX: 10,
        screenY: 0,
        width: 80,
        height: 15,
        shift: false,
        alt: false,
        ctrl: false,
      });
      expect(borderClick).toBeUndefined();
    });

    it("should handle clicks in confirm-delete view (confirm and cancel)", () => {
      const done = vi.fn();
      mockManager.deleteProfile.mockReturnValueOnce(true);
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      // Press 'd' to open confirm-delete
      modal.render(100);
      modal.handleInput("d");

      let lines = modal.render(100);
      expect(lines.join("\n")).toContain("Confirmar Eliminación");

      const shortcutsRow = lines.findIndex((l) => l.includes("Cancelar"));
      expect(shortcutsRow).toBeGreaterThan(0);

      const cancelLine = lines[shortcutsRow];
      const cancelX = cancelLine.indexOf("Cancelar");

      // Click on Cancelar
      const cancelRes = (modal as any).handleMouse({
        type: "click",
        button: "left",
        x: cancelX + 1,
        y: shortcutsRow,
        screenX: cancelX + 1,
        screenY: shortcutsRow,
        width: 100,
        height: lines.length,
        shift: false,
        alt: false,
        ctrl: false,
      });
      expect(cancelRes?.handled).toBe(true);

      lines = modal.render(100);
      expect(lines.join("\n")).toContain("SDD Profile Manager");
      expect(mockManager.deleteProfile).not.toHaveBeenCalled();

      // Open confirm delete again
      modal.handleInput("d");
      lines = modal.render(100);
      const confirmX = lines[shortcutsRow].indexOf("Confirmar");

      // Click on Confirmar
      const confirmRes = (modal as any).handleMouse({
        type: "click",
        button: "left",
        x: confirmX + 1,
        y: shortcutsRow,
        screenX: confirmX + 1,
        screenY: shortcutsRow,
        width: 100,
        height: lines.length,
        shift: false,
        alt: false,
        ctrl: false,
      });
      expect(confirmRes?.handled).toBe(true);
      expect(mockManager.deleteProfile).toHaveBeenCalledWith("cin");
    });
  });
});
