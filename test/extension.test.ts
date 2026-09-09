import { describe, it, expect, vi } from "vitest";
import sddProfilesExtension from "../index.js";

describe("extension entrypoint", () => {
  it("should register commands, shortcuts, and tools with Pi API", () => {
    const registeredCommands: Record<string, any> = {};
    const registeredShortcuts: Record<string, any> = {};
    const registeredTools: Record<string, any> = {};

    const mockPi = {
      registerCommand: vi.fn((name: string, opts: any) => {
        registeredCommands[name] = opts;
      }),
      registerShortcut: vi.fn((shortcut: string, opts: any) => {
        registeredShortcuts[shortcut] = opts;
      }),
      registerTool: vi.fn((tool: any) => {
        registeredTools[tool.name] = tool;
      }),
    };

    sddProfilesExtension(mockPi);

    // Commands registered
    expect(mockPi.registerCommand).toHaveBeenCalledWith("sdd-profile", expect.any(Object));
    expect(mockPi.registerCommand).toHaveBeenCalledWith("sdd-profile-save", expect.any(Object));
    expect(mockPi.registerCommand).toHaveBeenCalledWith("sdd-profile-list", expect.any(Object));
    expect(mockPi.registerCommand).toHaveBeenCalledWith("sdd-profile-rename", expect.any(Object));
    expect(mockPi.registerCommand).toHaveBeenCalledWith("sdd-profile-delete", expect.any(Object));

    // Shortcuts registered (both alt+m and ctrl+shift+m for universal/macOS support)
    expect(mockPi.registerShortcut).toHaveBeenCalledWith("alt+m", expect.any(Object));
    expect(mockPi.registerShortcut).toHaveBeenCalledWith("ctrl+shift+m", expect.any(Object));

    // Tools registered
    expect(mockPi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: "sdd_profile_list" }));
    expect(mockPi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: "sdd_profile_switch" }));
    expect(mockPi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: "sdd_profile_rename" }));
    expect(mockPi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: "sdd_profile_delete" }));
  });

  it("should handle /sdd-profile create and set with default reasoning effort", async () => {
    const registeredCommands: Record<string, any> = {};
    const mockPi = {
      registerCommand: vi.fn((name: string, opts: any) => {
        registeredCommands[name] = opts;
      }),
      registerShortcut: vi.fn(),
      registerTool: vi.fn(),
    };

    sddProfilesExtension(mockPi);

    const sddProfileCmd = registeredCommands["sdd-profile"];
    expect(sddProfileCmd).toBeDefined();

    const mockCtx = {
      cwd: "/tmp/mock-cwd",
      ui: {
        notify: vi.fn(),
      },
    };

    // Test invalid effort validation
    const invalidRes = await sddProfileCmd.handler("set my-profile sdd-explore some-model invalid_effort", mockCtx);
    expect(invalidRes).toContain('Nivel de esfuerzo inválido: "invalid_effort"');
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Nivel de esfuerzo inválido"), "error");
  });
});
