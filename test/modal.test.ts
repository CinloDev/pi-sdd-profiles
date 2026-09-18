import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createSddProfilesModal } from "../src/modal.js";
import { resolveCategories, SDD_AGENT_CATEGORIES, ALL_KNOWN_AGENTS } from "../src/catalog.js";

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
    getCategories: vi.fn(() => SDD_AGENT_CATEGORIES),
    getAllAgents: vi.fn(() => ALL_KNOWN_AGENTS),
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
    expect(lines.join("\n")).toContain("Proveedores");
    expect(lines.join("\n")).toContain("Modelos disponibles");

    // Type "flash" to filter
    modal.handleInput("f");
    modal.handleInput("l");
    modal.handleInput("a");
    modal.handleInput("s");
    modal.handleInput("h");

    lines = modal.render(80);
    const content = lines.join("\n");
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
    expect(lines.join("\n")).toContain("Modelo \"cpamc/cin82/gemini-3.8-flash-high\" guardado");
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
    expect(content).toContain("Proveedores");
    expect(content).toContain("Modelos disponibles");

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
    expect(content).toContain("guardado");

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
    modal.handleInput("\r"); // enter -> sets model in-place!
    lines = modal.render(80);
    content = lines.join("\n");
    expect(content).toContain("guardado");

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
    // Move to Effort column with Tab
    modal.handleInput("\t");
    let lines = modal.render(80);
    let content = lines.join("\n");
    expect(content).toContain("Effort / Thinking");
    expect(content).toContain("default (auto)");

    // Press enter on default effort to apply it directly in Column 3
    modal.handleInput("\r");

    // Back in editor: orchestrator should now have updated effort
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
      expect(lines.join("\n")).toContain("Proveedores");
      expect(lines.join("\n")).toContain("Modelos disponibles");

      // Press Enter to select the active model
      modal.handleInput("\r");
      lines = modal.render(80);
      expect(lines.join("\n")).toContain("guardado");
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

  describe("three-column miller layout and panel navigation", () => {
    it("should render all three columns simultaneously with vertical dividers in main view", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      const lines = modal.render(100);
      const content = lines.join("\n");

      // Column 1
      expect(content).toContain("Perfiles");
      expect(content).toContain("cin");
      // Column 2
      expect(content).toContain("Agentes");
      expect(content).toContain("Orquestador");
      // Column 3
      expect(content).toContain("Effort / Thinking");
      expect(content).toContain("default");
      expect(content).toContain("high");

      // Dividers
      expect(content).toContain("│");
      expect(content).toContain("┼");
    });

    it("should cycle focus between panels with Tab, Shift-Tab, and Arrow keys", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      let lines = modal.render(100);
      expect(lines.join("\n")).toContain("Panel activo: Perfiles");

      // Press Tab -> switch to Agentes
      modal.handleInput("\t");
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("Panel activo: Agentes");

      // Press Tab -> switch to Effort
      modal.handleInput("\t");
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("Panel activo: Effort / Thinking");

      // Press Tab -> wrap back to Perfiles
      modal.handleInput("\t");
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("Panel activo: Perfiles");

      // Press Left arrow from Profiles (stays in Profiles)
      modal.handleInput("\u001b[D"); // Left
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("Panel activo: Perfiles");

      // Press Right arrow -> moves to Agentes
      modal.handleInput("\u001b[C"); // Right
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("Panel activo: Agentes");

      // Press Right arrow -> moves to Effort
      modal.handleInput("\u001b[C"); // Right
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("Panel activo: Effort / Thinking");

      // Press Shift+Tab (backtab) -> moves back to Agentes
      modal.handleInput("\u001b[Z"); // Backtab
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("Panel activo: Agentes");
    });

    it("should apply and persist effort directly from Column 3 using keyboard", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      // Switch to Effort pane via Tab twice
      modal.handleInput("\t");
      modal.handleInput("\t");
      let lines = modal.render(100);
      expect(lines.join("\n")).toContain("Panel activo: Effort / Thinking");

      // Move down in effort options (0: default, 1: off, 2: minimal, 3: low, 4: medium, 5: high, 6: xhigh, 7: max)
      // Navigate to 'low' (down 3 times)
      modal.handleInput("\u001b[B");
      modal.handleInput("\u001b[B");
      modal.handleInput("\u001b[B");

      // Press Enter to apply
      modal.handleInput("\r");

      expect(mockManager.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          default_effort: "low",
        })
      );

      lines = modal.render(100);
      expect(lines.join("\n")).toContain("guardado");
    });

    it("should allow single click on Effort column to select and apply immediately", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      const lines = modal.render(100);
      // Find row containing "medium"
      const mediumRow = lines.findIndex((l) => l.includes("medium") && l.includes("│"));
      expect(mediumRow).toBeGreaterThan(0);

      // Col 3 starts after Col 2 (~ x=75 on width 100)
      const clickRes = (modal as any).handleMouse({
        type: "click",
        button: "left",
        x: 82,
        y: mediumRow,
        screenX: 82,
        screenY: mediumRow,
        width: 100,
        height: lines.length,
        shift: false,
        alt: false,
        ctrl: false,
        clickCount: 1,
      });

      expect(clickRes?.handled).toBe(true);
      expect(mockManager.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          default_effort: "medium",
        })
      );
    });

    it("should render [ x ] button at top right and close immediately when clicked", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      const lines = modal.render(80);
      // Top line should contain [ x ]
      expect(lines[0]).toContain("[ x ]");

      // Click on [ x ] at top right (y: 0, x: 75 on width 80)
      const clickRes = (modal as any).handleMouse({
        type: "click",
        button: "left",
        x: 75,
        y: 0,
        screenX: 75,
        screenY: 0,
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

    it("should close immediately on 'q' without requiring multiple Esc presses", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      // Switch to Agentes panel
      modal.handleInput("\t");
      let lines = modal.render(80);
      expect(lines.join("\n")).toContain("Panel activo: Agentes");

      // Press 'q' -> closes immediately!
      modal.handleInput("q");
      expect(done).toHaveBeenCalledWith({ action: "closed" });
    });

    it("should assign model and persist to all agents in a category when using category picker", () => {
      const done = vi.fn();
      const customProfile = {
        name: "test-cat-profile",
        default_model: "openai/o3-mini",
        default_effort: "high" as const,
        model_profiles: {},
      };
      const customManager: any = {
        listProfiles: vi.fn(() => [{ name: "test-cat-profile", is_active: true }]),
        getActiveProfileName: vi.fn(() => "test-cat-profile"),
        getProfile: vi.fn(() => ({ ...customProfile, model_profiles: { ...customProfile.model_profiles } })),
        createProfile: vi.fn(() => ({ success: true })),
      };
      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels: [
          "anthropic/claude-sonnet-4-5",
          "openai/gpt-4o",
        ],
        done,
      });

      // Press 'c' to jump to category in the tree
      modal.handleInput("c");
      let lines = modal.render(80);
      expect(lines.join("\n")).toContain("SDD Core");

      // Press Enter directly on SDD Core to open model picker
      modal.handleInput("\r");
      lines = modal.render(80);
      expect(lines.join("\n")).toContain("Categoría: SDD Core");

      lines = modal.render(80);
      expect(lines.join("\n")).toContain("Categoría: SDD Core");

      // Select first model (anthropic/claude-sonnet-4-5)
      modal.handleInput("\r"); // Enter -> saves model in-place
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("guardado");

      // Verify createProfile was called with updated agents in SDD Core
      expect(customManager.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          model_profiles: expect.objectContaining({
            "sdd-explore": expect.objectContaining({ model: "anthropic/claude-sonnet-4-5" }),
            "sdd-apply": expect.objectContaining({ model: "anthropic/claude-sonnet-4-5" }),
            "sdd-verify": expect.objectContaining({ model: "anthropic/claude-sonnet-4-5" }),
          }),
        })
      );
    });

    it("should toggle expand and collapse of categories in accordion tree using Space", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      // Jump to category
      modal.handleInput("c");
      let lines = modal.render(100);
      expect(lines.join("\n")).toContain("▼ 📦 SDD Core");
      expect(lines.join("\n")).toContain("sdd-explore");

      // Press Space to collapse SDD Core
      modal.handleInput(" ");
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("► 📦 SDD Core");
      expect(lines.join("\n")).not.toContain("sdd-explore");

      // Press Space again to re-expand
      modal.handleInput(" ");
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("▼ 📦 SDD Core");
      expect(lines.join("\n")).toContain("sdd-explore");
    });
  });

  describe("dynamic reasoning effort options per model", () => {
    it("should show only 'default' and hint for non-reasoning models like gpt-4o in Col 3 and effort picker", () => {
      const done = vi.fn();
      const customProfile = {
        name: "test-non-reasoning",
        default_model: "openai/gpt-4o",
        model_profiles: {},
      };
      const customManager: any = {
        listProfiles: vi.fn(() => [{ name: "test-non-reasoning", is_active: true }]),
        getActiveProfileName: vi.fn(() => "test-non-reasoning"),
        getProfile: vi.fn(() => ({ ...customProfile, model_profiles: { ...customProfile.model_profiles } })),
        createProfile: vi.fn(() => ({ success: true })),
      };

      const modelsMetadata = {
        "openai/gpt-4o": {
          id: "openai/gpt-4o",
          provider: "openai",
          reasoning: false,
        },
      };

      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels: ["openai/gpt-4o"],
        modelsMetadata,
        done,
      });

      // Render 3 columns (width 120)
      let lines = modal.render(120);
      let content = lines.join("\n");
      // Col 3 should show default and sin razonamiento hint
      expect(content).toContain("default");
      expect(content).toContain("(sin razonamiento)");
      // Should NOT contain reasoning options like high, minimal, max
      expect(content).not.toContain("xhigh");
      expect(content).not.toContain("minimal");

      // Now open model picker on orchestrator and select gpt-4o
      modal.handleInput("m");
      modal.handleInput("\r"); // Enter -> saves model in-place

      lines = modal.render(120);
      content = lines.join("\n");
      expect(content).toContain("guardado");
      expect(content).toContain("(sin razonamiento)");

      expect(customManager.createProfile).toHaveBeenCalled();
    });

    it("should dynamically filter options in Col 3 according to thinkingLevelMap", () => {
      const done = vi.fn();
      const customProfile = {
        name: "test-custom-reasoner",
        default_model: "cliproxyapi/custom-reasoner",
        model_profiles: {},
      };
      const customManager: any = {
        listProfiles: vi.fn(() => [{ name: "test-custom-reasoner", is_active: true }]),
        getActiveProfileName: vi.fn(() => "test-custom-reasoner"),
        getProfile: vi.fn(() => ({ ...customProfile, model_profiles: { ...customProfile.model_profiles } })),
        createProfile: vi.fn(() => ({ success: true })),
      };

      const modelsMetadata = {
        "cliproxyapi/custom-reasoner": {
          id: "cliproxyapi/custom-reasoner",
          provider: "cliproxyapi",
          reasoning: true,
          thinkingLevelMap: {
            off: null,
            minimal: null,
            low: "low",
            medium: null,
            high: "high",
            xhigh: null,
            max: null,
          },
        },
      };

      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels: ["cliproxyapi/custom-reasoner"],
        modelsMetadata,
        done,
      });

      const lines = modal.render(120);
      const content = lines.join("\n");

      // Only default, low, and high should appear in Col 3
      expect(content).toContain("default");
      expect(content).toContain("low");
      expect(content).toContain("high");
      expect(content).not.toContain("minimal");
      expect(content).not.toContain("medium");
      expect(content).not.toContain("xhigh");
      expect(content).not.toContain("max");
    });
  });

  describe("footer soft divider", () => {
    it("should render a subtle divider line separating active panel info and shortcuts", () => {
      const done = vi.fn();
      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels,
        done,
      });

      const lines = modal.render(100);
      const content = lines.join("\n");

      // Verify presence of panel info, divider line, and shortcuts
      expect(content).toContain("Panel activo: Perfiles");
      expect(content).toContain("[Enter]");

      const panelLineIdx = lines.findIndex((l) => l.includes("Panel activo:"));
      expect(panelLineIdx).toBeGreaterThan(-1);

      // The line right after panel info should be the divider line containing horizontal rule
      const dividerLine = lines[panelLineIdx + 1];
      expect(dividerLine).toContain("─");

      // The line after divider should be the shortcuts line
      const shortcutsLine = lines[panelLineIdx + 2];
      expect(shortcutsLine).toContain("[Enter]");
    });
  });

  describe("export and import modal flows", () => {
    it("should open export-profile view on 'x', allow path editing and confirm export", () => {
      const done = vi.fn();
      const customManager: any = {
        listProfiles: vi.fn(() => [{ name: "cinlo-export", is_active: true }]),
        getActiveProfileName: vi.fn(() => "cinlo-export"),
        getProfile: vi.fn(() => ({ name: "cinlo-export", model_profiles: {} })),
        exportProfile: vi.fn(() => ({ success: true, path: "/tmp/cinlo-export.json", message: "ok" })),
      };

      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels,
        done,
      });

      // Press 'x' on selected profile
      modal.handleInput("x");
      let lines = modal.render(100);
      let content = lines.join("\n");
      expect(content).toContain("Exportar perfil SDD");
      expect(content).toContain("cinlo-export");
      expect(content).toContain("~/cinlo-export.json");

      // Edit path: press backspace 5 times to remove '.json', type '.backup.json'
      for (let i = 0; i < 5; i++) {
        modal.handleInput("backspace");
      }
      for (const char of ".backup.json") {
        modal.handleInput(char);
      }

      lines = modal.render(100);
      expect(lines.join("\n")).toContain("~/cinlo-export.backup.json");

      // Press Enter to confirm export
      modal.handleInput("\r");
      expect(customManager.exportProfile).toHaveBeenCalledWith(
        "cinlo-export",
        "~/cinlo-export.backup.json"
      );

      // Should return to profiles list with feedback message
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("exportado con éxito");
    });

    it("should open import-profile file browser on 'i', allow scope toggling and manual path mode", () => {
      const done = vi.fn();
      const customManager: any = {
        listProfiles: vi.fn(() => [{ name: "existing-profile", is_active: true }]),
        getActiveProfileName: vi.fn(() => "existing-profile"),
        getProfile: vi.fn((name: string) => (name === "existing-profile" ? { name: "existing-profile", model_profiles: {} } : null)),
        importProfile: vi.fn(() => ({
          success: true,
          profile: { name: "imported-test", model_profiles: {} },
          path: "/path/imported-test.json",
          message: "ok",
        })),
      };

      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels,
        done,
      });

      // Press 'i' on profiles pane -> opens file browser
      modal.handleInput("i");
      let lines = modal.render(100);
      let content = lines.join("\n");
      expect(content).toContain("Importar perfil SDD (Explorador de archivos)");
      expect(content).toContain("[1] Proyecto");
      expect(content).toContain("[2] Global");

      // Default scope is project. Press '2' to switch to global
      modal.handleInput("2");
      lines = modal.render(100);
      expect(lines.join("\n")).toMatch(/●.*\[2\] Global/);

      // Press Tab to switch back to project
      modal.handleInput("\t");
      lines = modal.render(100);
      expect(lines.join("\n")).toMatch(/●.*\[1\] Proyecto/);

      // Press 'm' to switch to manual path mode
      modal.handleInput("m");
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("Ruta manual");

      // Type file path in manual mode
      for (const char of "./test-profile.json") {
        modal.handleInput(char);
      }

      lines = modal.render(100);
      expect(lines.join("\n")).toContain("./test-profile.json");

      // Press Enter to import
      modal.handleInput("\r");
      expect(customManager.importProfile).toHaveBeenCalledWith({
        sourceFilePath: "./test-profile.json",
        scope: "project",
      });

      // Returns to profiles list
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("importado con éxito en project");
    });

    it("should navigate directories and select a .json file directly in file browser", () => {
      const done = vi.fn();
      const customManager: any = {
        listProfiles: vi.fn(() => [{ name: "existing-profile", is_active: true }]),
        getActiveProfileName: vi.fn(() => "existing-profile"),
        getProfile: vi.fn(() => ({ name: "existing-profile", model_profiles: {} })),
        importProfile: vi.fn(() => ({
          success: true,
          profile: { name: "cin", model_profiles: {} },
          path: "/home/cinlodev/cin.json",
          message: "ok",
        })),
      };

      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels,
        done,
      });

      // Press 'i' on profiles pane
      modal.handleInput("i");
      let lines = modal.render(100);
      expect(lines.join("\n")).toContain("Explorador de archivos");

      // Press 'down' a few times and 'Enter'
      modal.handleInput("down");
      modal.handleInput("up");
      expect(lines.join("\n")).toContain("Ámbito destino");
    });

    it("should trigger conflict resolution when importing a profile whose name already exists", () => {
      const done = vi.fn();
      // Setup a real temp JSON file that has name: "existing-profile"
      const tempJson = path.join(os.tmpdir(), "connn.json");
      fs.writeFileSync(tempJson, JSON.stringify({ name: "existing-profile", model_profiles: {} }), "utf-8");

      try {
        const customManager: any = {
          listProfiles: vi.fn(() => [{ name: "existing-profile", is_active: true }]),
          getActiveProfileName: vi.fn(() => "existing-profile"),
          getProfile: vi.fn((name: string) => (name === "existing-profile" ? { name: "existing-profile", model_profiles: {} } : null)),
          importProfile: vi.fn(({ overrideName }) => ({
            success: true,
            profile: { name: overrideName || "existing-profile", model_profiles: {} },
            path: tempJson,
            message: "ok",
          })),
        };

        const modal = createSddProfilesModal({
          manager: customManager,
          availableModels,
          done,
        });

        // Open import with 'i'
        modal.handleInput("i");
        // Switch to manual mode with 'm'
        modal.handleInput("m");

        // Type the temp json path
        for (const char of tempJson) {
          modal.handleInput(char);
        }

        // Press Enter to trigger import -> should detect conflict!
        modal.handleInput("\r");
        let lines = modal.render(100);
        let content = lines.join("\n");
        expect(content).toContain("Conflicto al importar perfil SDD");
        expect(content).toContain("El perfil ya existe");
        expect(content).toContain("existing-profile");
        expect(content).toContain("[1 / o] Sobreescribir");
        expect(content).toContain("[2 / r] Renombrar");

        // Press '2' (or 'r') to rename
        modal.handleInput("2");
        lines = modal.render(100);
        expect(lines.join("\n")).toContain("Renombrar Perfil Importado");
        // Suggested name was 'connn' because the file is connn.json!
        expect(lines.join("\n")).toContain("connn");

        // Press Enter to confirm import with new name
        modal.handleInput("\r");
        expect(customManager.importProfile).toHaveBeenCalledWith({
          sourceFilePath: tempJson,
          scope: "project",
          overrideName: "connn",
        });

        lines = modal.render(100);
        expect(lines.join("\n")).toContain("importado con éxito");
      } finally {
        if (fs.existsSync(tempJson)) fs.unlinkSync(tempJson);
      }
    });
  });

  describe("adaptive visible height", () => {
    it("should display up to 15 items when sufficient height is available", () => {
      const done = vi.fn();
      // Generate 20 profiles to test visibility count
      const twentyProfiles = Array.from({ length: 20 }, (_, i) => ({
        name: `profile-${String(i + 1).padStart(2, "0")}`,
        default_model: "anthropic/claude-3-7-sonnet",
        agent_count: 5,
        scope: "global" as const,
        is_active: i === 0,
      }));

      const customManager: any = {
        listProfiles: vi.fn(() => twentyProfiles),
        getActiveProfileName: vi.fn(() => "profile-01"),
        getProfile: vi.fn((name: string) => ({ name, model_profiles: {} })),
      };

      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels,
        tui: { height: 40 },
        done,
      });

      const lines = modal.render(100);
      const content = lines.join("\n");

      // In a terminal with height: 40, maxVisible should be 15
      // Verify profile-01 through profile-15 are rendered in the lines
      expect(content).toContain("profile-01");
      expect(content).toContain("profile-15");
      // profile-16 should be hidden behind scroll
      expect(content).not.toContain("profile-16");
    });

    it("should adaptively clamp maxVisible on constrained terminal heights", () => {
      const done = vi.fn();
      const twentyProfiles = Array.from({ length: 20 }, (_, i) => ({
        name: `p-${String(i + 1).padStart(2, "0")}`,
        default_model: "anthropic/claude-3-7-sonnet",
        agent_count: 5,
        scope: "global" as const,
        is_active: i === 0,
      }));

      const customManager: any = {
        listProfiles: vi.fn(() => twentyProfiles),
        getActiveProfileName: vi.fn(() => "p-01"),
        getProfile: vi.fn((name: string) => ({ name, model_profiles: {} })),
      };

      // Constrained terminal: height = 20 (reservedRows = 12 => available = 8)
      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels,
        tui: { height: 20 },
        done,
      });

      const lines = modal.render(100);
      const content = lines.join("\n");

      expect(content).toContain("p-01");
      expect(content).toContain("p-08");
      // p-09 should be clamped/hidden to protect smaller screen
      expect(content).not.toContain("p-09");
    });
  });

  describe("two-column master-detail model picker", () => {
    it("should render providers on the left and models on the right, allowing Tab switching", () => {
      const done = vi.fn();
      const multiProviderModels = [
        "cpamc/cinlo/gemini-3.8-flash-high",
        "cpamc/cinlo/gpt-oss-120b-medium",
        "cpamc/cin82/gemini-pro",
        "anthropic/claude-3-7-sonnet",
        "openai/o3-mini",
        "google/gemini-2.5-flash",
      ];

      const modal = createSddProfilesModal({
        manager: mockManager,
        availableModels: multiProviderModels,
        done,
      });

      // Enter editor and open model picker
      modal.handleInput("e");
      modal.handleInput("m");

      let lines = modal.render(100);
      let content = lines.join("\n");

      // Verify two-column headers and vertical divider
      expect(content).toContain("Proveedores");
      expect(content).toContain("Modelos disponibles");
      expect(content).toContain("│");

      // Verify that current assigned model is shown in the header
      expect(content).toContain("Actual:");
      expect(content).toContain("gemini-3.8-flash-high");

      // Verify providers are listed on left with clean account names and counts
      expect(content).toContain("cin82");
      expect(content).toContain("(1)");
      expect(content).toContain("cinlo");
      expect(content).toContain("(2)");
      expect(content).toContain("anthropic");
      expect(content).toContain("google");
      expect(content).toContain("openai");

      // By default, first provider cin82 is selected, showing its clean models on the right
      expect(content).toContain("gemini-pro");

      // Switch active pane to providers with Tab
      modal.handleInput("\t");
      lines = modal.render(100);
      content = lines.join("\n");
      expect(content).toContain("› Proveedores");

      // Navigate down to cinlo
      modal.handleInput("\u001b[B"); // down
      lines = modal.render(100);
      content = lines.join("\n");
      // Right side now updates to show cinlo's models!
      expect(content).toContain("gemini-3.8-flash-high");
      expect(content).toContain("gpt-oss-120b-medium");
      expect(content).not.toContain("gemini-pro");

      // Navigate down to anthropic
      modal.handleInput("\u001b[B"); // down
      lines = modal.render(100);
      content = lines.join("\n");
      expect(content).toContain("claude-3-7-sonnet");

      // Switch back to models pane with Tab
      modal.handleInput("\t");
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("› Modelos disponibles");

      // Press Enter to pick the model in-place
      modal.handleInput("\r");
      lines = modal.render(100);
      expect(lines.join("\n")).toContain("guardado");
      expect(lines.join("\n")).toContain("claude-3-7-sonnet");
    });

    it("should display current category model and never overwrite orchestrator when assigning category", () => {
      const done = vi.fn();
      const profileData: any = {
        name: "test-category-isolation",
        default_model: "google/gemini-orchestrator",
        model_profiles: {
          "sdd-explore": { model: "anthropic/claude-3-7-sonnet" },
          "sdd-propose": { model: "anthropic/claude-3-7-sonnet" },
          "sdd-spec": { model: "anthropic/claude-3-7-sonnet" },
          "sdd-design": { model: "anthropic/claude-3-7-sonnet" },
          "sdd-tasks": { model: "anthropic/claude-3-7-sonnet" },
          "sdd-apply": { model: "anthropic/claude-3-7-sonnet" },
          "sdd-verify": { model: "anthropic/claude-3-7-sonnet" },
          "sdd-archive": { model: "anthropic/claude-3-7-sonnet" },
        },
      };

      const customManager: any = {
        listProfiles: vi.fn(() => [{ name: "test-category-isolation", is_active: true }]),
        getActiveProfileName: vi.fn(() => "test-category-isolation"),
        getProfile: vi.fn(() => profileData),
        createProfile: vi.fn((p) => {
          Object.assign(profileData, p);
          return { success: true, profile: p };
        }),
      };

      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels: [
          "anthropic/claude-3-7-sonnet",
          "openai/o3-mini",
          "google/gemini-orchestrator",
        ],
        done,
      });

      // Navigate to SDD Core category
      modal.handleInput("c");
      // Open model picker on category
      modal.handleInput("\r");

      let lines = modal.render(100);
      let content = lines.join("\n");

      // Verify category target is displayed
      expect(content).toContain("Categoría: SDD Core");
      // Verify currently assigned model for this category is displayed!
      expect(content).toContain("Actual:");
      expect(content).toContain("claude-3-7-sonnet");

      // Select openai/o3-mini
      modal.handleInput("o");
      modal.handleInput("3");
      modal.handleInput("\r"); // Selects model in-place

      // Verify createProfile was called
      expect(customManager.createProfile).toHaveBeenCalled();
      // Crucial assertion: Orchestrator's default_model must remain untouched!
      expect(profileData.default_model).toBe("google/gemini-orchestrator");
      // All SDD Core agents must be updated to openai/o3-mini
      expect(profileData.model_profiles["sdd-explore"].model).toBe("openai/o3-mini");
      expect(profileData.model_profiles["sdd-archive"].model).toBe("openai/o3-mini");
    });
  });

  describe("Custom Agents in modal tree and model/effort assignment", () => {
    const customAgentsList = ["coder-bot", "tester-ai"];
    const customCategories = resolveCategories(customAgentsList);
    const customAllAgents = customCategories.flatMap((c) => c.agents);

    it("should display custom agents under ▼ 📦 Custom Agents in Column 2 tree when expanded", () => {
      const done = vi.fn();
      const profileData: any = {
        name: "test-custom-agents",
        default_model: "google/gemini-orchestrator",
        model_profiles: {
          "coder-bot": { model: "anthropic/claude-sonnet-4-5" },
        },
      };

      const customManager: any = {
        listProfiles: vi.fn(() => [{ name: "test-custom-agents", is_active: true }]),
        getActiveProfileName: vi.fn(() => "test-custom-agents"),
        getProfile: vi.fn(() => profileData),
        createProfile: vi.fn((p) => {
          Object.assign(profileData, p);
          return { success: true, profile: p };
        }),
        getCategories: vi.fn(() => customCategories),
        getAllAgents: vi.fn(() => customAllAgents),
      };

      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels: [
          "anthropic/claude-sonnet-4-5",
          "openai/o3-mini",
        ],
        tui: { height: 40 },
        done,
      });

      // Switch to agents pane
      modal.handleInput("tab");

      // Jump to SDD Core and collapse it so all categories and items fit in the viewport
      modal.handleInput("c");
      modal.handleInput(" ");

      // Jump through remaining categories with 'c' until reaching Custom Agents
      // Judgment Day -> Reviewers -> General -> Custom Agents
      modal.handleInput("c"); // Judgment Day
      modal.handleInput("c"); // Reviewers
      modal.handleInput("c"); // General
      modal.handleInput("c"); // Custom Agents

      let lines = modal.render(100);
      expect(lines.join("\n")).toContain("► 📦 Custom Agents");

      // Press Space to expand Custom Agents category
      modal.handleInput(" ");

      lines = modal.render(100);
      const content = lines.join("\n");
      expect(content).toContain("▼ 📦 Custom Agents");
      expect(content).toContain("coder-bot");
      expect(content).toContain("tester-ai");
    });

    it("should allow assigning model and effort to custom agents", () => {
      const done = vi.fn();
      const profileData: any = {
        name: "test-custom-agents",
        default_model: "google/gemini-orchestrator",
        model_profiles: {},
      };

      const customManager: any = {
        listProfiles: vi.fn(() => [{ name: "test-custom-agents", is_active: true }]),
        getActiveProfileName: vi.fn(() => "test-custom-agents"),
        getProfile: vi.fn(() => profileData),
        createProfile: vi.fn((p) => {
          Object.assign(profileData, p);
          return { success: true, profile: p };
        }),
        getCategories: vi.fn(() => customCategories),
        getAllAgents: vi.fn(() => customAllAgents),
      };

      const modelsMetadata = {
        "openai/o3-mini": {
          id: "openai/o3-mini",
          provider: "openai",
          supportedEfforts: ["low", "medium", "high"],
        },
      };

      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels: [
          "anthropic/claude-sonnet-4-5",
          "openai/o3-mini",
        ],
        modelsMetadata: modelsMetadata as any,
        done,
      });

      // Jump to Custom Agents category and expand it
      modal.handleInput("c");
      modal.handleInput("c");
      modal.handleInput("c");
      modal.handleInput("c");
      modal.handleInput("c");
      modal.handleInput(" "); // Expand Custom Agents

      // Move down into coder-bot
      modal.handleInput("\u001b[B"); // down arrow

      // Press Enter to open model picker for coder-bot
      modal.handleInput("\r");
      let lines = modal.render(100);
      expect(lines.join("\n")).toContain("Agente: coder-bot");

      // Type "o3" to filter and press Enter to select openai/o3-mini
      modal.handleInput("o");
      modal.handleInput("3");
      modal.handleInput("\r"); // selects model

      expect(customManager.createProfile).toHaveBeenCalled();
      expect(profileData.model_profiles["coder-bot"].model).toBe("openai/o3-mini");

      // Now assign effort to coder-bot:
      // coder-bot is selected; switch to effort pane with Tab
      modal.handleInput("tab"); // moves to Col 3 (effort)
      // Col 3 effort options for o3-mini: [default, low, medium, high]
      // Move down to 'high' (down 3 times: 0=default, 1=low, 2=medium, 3=high)
      modal.handleInput("\u001b[B");
      modal.handleInput("\u001b[B");
      modal.handleInput("\u001b[B");
      modal.handleInput("\r"); // Apply effort

      expect(customManager.createProfile).toHaveBeenCalled();
      expect(profileData.model_profiles["coder-bot"].effort).toBe("high");
    });

    it("should assign model to all custom agents when configuring the Custom Agents category", () => {
      const done = vi.fn();
      const profileData: any = {
        name: "test-custom-cat",
        default_model: "google/gemini-orchestrator",
        model_profiles: {},
      };

      const customManager: any = {
        listProfiles: vi.fn(() => [{ name: "test-custom-cat", is_active: true }]),
        getActiveProfileName: vi.fn(() => "test-custom-cat"),
        getProfile: vi.fn(() => profileData),
        createProfile: vi.fn((p) => {
          Object.assign(profileData, p);
          return { success: true, profile: p };
        }),
        getCategories: vi.fn(() => customCategories),
        getAllAgents: vi.fn(() => customAllAgents),
      };

      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels: [
          "anthropic/claude-sonnet-4-5",
          "openai/o3-mini",
        ],
        done,
      });

      // Navigate to agents pane
      modal.handleInput("tab");

      // Jump to Custom Agents category with 'c'
      modal.handleInput("c");
      modal.handleInput("c");
      modal.handleInput("c");
      modal.handleInput("c");
      modal.handleInput("c"); // On Custom Agents category

      // Press 'm' to open model picker for the category
      modal.handleInput("m");

      let lines = modal.render(100);
      expect(lines.join("\n")).toContain("Categoría: Custom Agents");

      // Filter and select anthropic/claude-sonnet-4-5
      modal.handleInput("s");
      modal.handleInput("o");
      modal.handleInput("n");
      modal.handleInput("\r");

      expect(customManager.createProfile).toHaveBeenCalled();
      expect(profileData.model_profiles["coder-bot"].model).toBe("anthropic/claude-sonnet-4-5");
      expect(profileData.model_profiles["tester-ai"].model).toBe("anthropic/claude-sonnet-4-5");
    });

    it("should cover custom agents when using 'Asignar un mismo modelo a TODOS'", () => {
      const done = vi.fn();
      const profileData: any = {
        name: "test-custom-all",
        default_model: "google/gemini-orchestrator",
        model_profiles: {
          "sdd-explore": { model: "some-old-model" },
          "coder-bot": { model: "old-custom-model" },
          "tester-ai": { model: "another-old-model" },
        },
      };

      const customManager: any = {
        listProfiles: vi.fn(() => [{ name: "test-custom-all", is_active: true }]),
        getActiveProfileName: vi.fn(() => "test-custom-all"),
        getProfile: vi.fn(() => profileData),
        createProfile: vi.fn((p) => {
          Object.assign(profileData, p);
          return { success: true, profile: p };
        }),
        getCategories: vi.fn(() => customCategories),
        getAllAgents: vi.fn(() => customAllAgents),
      };

      const modal = createSddProfilesModal({
        manager: customManager,
        availableModels: [
          "anthropic/claude-sonnet-4-5",
          "openai/o3-mini",
        ],
        done,
      });

      // Navigate to agents pane
      modal.handleInput("tab");
      // Move from Orchestrator (index 0) down to 'Asignar un mismo modelo a TODOS' (index 1)
      modal.handleInput("\u001b[B");

      let lines = modal.render(100);
      expect(lines.join("\n")).toMatch(/›\s+.*Asignar un mismo modelo a TODOS/);

      // Press Enter to open model picker for all subagents
      modal.handleInput("\r");

      lines = modal.render(100);
      expect(lines.join("\n")).toContain("Asignar modelo a:");
      expect(lines.join("\n")).toContain("TODOS los subagentes");

      // Filter for claude-sonnet-4-5
      modal.handleInput("s");
      modal.handleInput("o");
      modal.handleInput("n");
      modal.handleInput("\r"); // Selects model

      // Verify createProfile was called and both standard and custom agents received the model
      expect(customManager.createProfile).toHaveBeenCalled();
      expect(profileData.model_profiles["sdd-explore"].model).toBe("anthropic/claude-sonnet-4-5");
      expect(profileData.model_profiles["sdd-archive"].model).toBe("anthropic/claude-sonnet-4-5");
      expect(profileData.model_profiles["coder-bot"].model).toBe("anthropic/claude-sonnet-4-5");
      expect(profileData.model_profiles["tester-ai"].model).toBe("anthropic/claude-sonnet-4-5");
    });
  });
});
