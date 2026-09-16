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

  it("should register session_start, session_shutdown, and session_end hooks", () => {
    const listeners: Record<string, Function[]> = {};
    const mockPi = {
      registerCommand: vi.fn(),
      registerShortcut: vi.fn(),
      registerTool: vi.fn(),
      on: vi.fn((event: string, handler: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
      }),
    };

    sddProfilesExtension(mockPi);

    expect(mockPi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(mockPi.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
    expect(mockPi.on).toHaveBeenCalledWith("session_end", expect.any(Function));
  });

  it("should skip session_start work if inside gentle-pi subagent child process", async () => {
    const listeners: Record<string, Function[]> = {};
    const mockPi = {
      registerCommand: vi.fn(),
      registerShortcut: vi.fn(),
      registerTool: vi.fn(),
      setModel: vi.fn(),
      setThinkingLevel: vi.fn(),
      on: vi.fn((event: string, handler: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
      }),
    };

    sddProfilesExtension(mockPi);

    const prevChildEnv = process.env.GENTLE_PI_AGENTS_CHILD;
    process.env.GENTLE_PI_AGENTS_CHILD = "1";
    try {
      const startHandler = listeners["session_start"]?.[0];
      expect(startHandler).toBeDefined();

      const mockCtx = {
        cwd: "/tmp/mock-cwd",
        hasUI: true,
        ui: { setStatus: vi.fn(), notify: vi.fn() },
      };

      await startHandler({}, mockCtx);
      expect(mockCtx.ui.setStatus).not.toHaveBeenCalled();
      expect(mockPi.setModel).not.toHaveBeenCalled();
    } finally {
      if (prevChildEnv === undefined) {
        delete process.env.GENTLE_PI_AGENTS_CHILD;
      } else {
        process.env.GENTLE_PI_AGENTS_CHILD = prevChildEnv;
      }
    }
  });

  it("should update footer status without brackets when active profile is present", async () => {
    const listeners: Record<string, Function[]> = {};
    const mockPi = {
      registerCommand: vi.fn(),
      registerShortcut: vi.fn(),
      registerTool: vi.fn(),
      setModel: vi.fn(),
      setThinkingLevel: vi.fn(),
      on: vi.fn((event: string, handler: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
      }),
    };

    sddProfilesExtension(mockPi);

    const startHandler = listeners["session_start"]?.[0];
    expect(startHandler).toBeDefined();

    const mockCtx = {
      cwd: process.cwd(),
      hasUI: true,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
    };

    await startHandler({}, mockCtx);
    if (mockCtx.ui.setStatus.mock.calls.length > 0) {
      const statusCall = mockCtx.ui.setStatus.mock.calls[0];
      expect(statusCall[0]).toBe("sdd-profile");
      expect(statusCall[1]).toMatch(/^🤖 [^\[\]]+$/);
    }
  });

  it("should handle /sdd-profile shortcut commands (status, disable-alt, enable-alt, set, reset)", async () => {
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
      cwd: process.cwd(),
      ui: {
        notify: vi.fn(),
      },
    };

    // 1. Status command
    const statusMsg = await sddProfileCmd.handler("shortcut", mockCtx);
    expect(statusMsg).toContain("Atajos configurados para SDD Profiles");
    expect(statusMsg).toContain("disable-alt");

    // 2. Disable alt command
    const disableMsg = await sddProfileCmd.handler("shortcut disable-alt --project", mockCtx);
    expect(disableMsg).toContain("desactivado");
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("desactivado"), "info");

    // 3. Enable alt command
    const enableMsg = await sddProfileCmd.handler("shortcut enable-alt --project", mockCtx);
    expect(enableMsg).toContain("habilitado");

    // 4. Set custom shortcut
    const setMsg = await sddProfileCmd.handler("shortcut set ctrl+shift+m --project", mockCtx);
    expect(setMsg).toContain("Atajos personalizados configurados");

    // 5. Reset shortcuts
    const resetMsg = await sddProfileCmd.handler("shortcut reset --project", mockCtx);
    expect(resetMsg).toContain("restablecidos");
  });
});
