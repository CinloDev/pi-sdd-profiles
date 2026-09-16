import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  resolveShortcutsConfig,
  updateShortcutsSettings,
  DEFAULT_SHORTCUTS,
} from "../src/shortcuts.js";

describe("shortcuts configuration module", () => {
  let tmpRoot: string;
  let globalSettingsPath: string;
  let projectSettingsPath: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sdd-shortcuts-test-"));
    globalSettingsPath = path.join(tmpRoot, "agent", "settings.json");
    projectSettingsPath = path.join(tmpRoot, "project", ".pi", "settings.json");

    fs.mkdirSync(path.dirname(globalSettingsPath), { recursive: true });
    fs.mkdirSync(path.dirname(projectSettingsPath), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("should return default shortcuts when no settings.json exists", () => {
    const resolved = resolveShortcutsConfig({
      globalSettingsPath,
      projectSettingsPath,
    });
    expect(resolved).toEqual(["ctrl+shift+m", "alt+m"]);
  });

  it("should return only ctrl+shift+m when disableAltShortcut is set to true", () => {
    fs.writeFileSync(
      globalSettingsPath,
      JSON.stringify({
        sddProfiles: {
          disableAltShortcut: true,
        },
      }),
      "utf-8"
    );

    const resolved = resolveShortcutsConfig({
      globalSettingsPath,
      projectSettingsPath,
    });
    expect(resolved).toEqual(["ctrl+shift+m"]);
  });

  it("should return custom shortcuts array if configured", () => {
    fs.writeFileSync(
      globalSettingsPath,
      JSON.stringify({
        sddProfiles: {
          shortcuts: ["ctrl+alt+p", "ctrl+shift+m"],
        },
      }),
      "utf-8"
    );

    const resolved = resolveShortcutsConfig({
      globalSettingsPath,
      projectSettingsPath,
    });
    expect(resolved).toEqual(["ctrl+alt+p", "ctrl+shift+m"]);
  });

  it("should return empty array if shortcuts is set to empty array (disables shortcuts)", () => {
    fs.writeFileSync(
      globalSettingsPath,
      JSON.stringify({
        sddProfiles: {
          shortcuts: [],
        },
      }),
      "utf-8"
    );

    const resolved = resolveShortcutsConfig({
      globalSettingsPath,
      projectSettingsPath,
    });
    expect(resolved).toEqual([]);
  });

  it("should prioritize project settings over global settings", () => {
    fs.writeFileSync(
      globalSettingsPath,
      JSON.stringify({
        sddProfiles: {
          shortcuts: ["alt+m"],
        },
      }),
      "utf-8"
    );

    fs.writeFileSync(
      projectSettingsPath,
      JSON.stringify({
        sddProfiles: {
          shortcuts: ["ctrl+shift+m"],
        },
      }),
      "utf-8"
    );

    const resolved = resolveShortcutsConfig({
      globalSettingsPath,
      projectSettingsPath,
    });
    expect(resolved).toEqual(["ctrl+shift+m"]);
  });

  it("should support updating settings and preserve other settings.json keys", () => {
    // Write initial settings with other keys
    fs.writeFileSync(
      globalSettingsPath,
      JSON.stringify({
        defaultModel: "anthropic/claude-sonnet-4-5",
        theme: "Cinlodev CUTE",
      }),
      "utf-8"
    );

    const res = updateShortcutsSettings(
      { disableAltShortcut: true },
      { globalSettingsPath, projectSettingsPath, scope: "global" }
    );

    expect(res.success).toBe(true);
    expect(res.shortcuts).toEqual(["ctrl+shift+m"]);

    const disk = JSON.parse(fs.readFileSync(globalSettingsPath, "utf-8"));
    expect(disk.defaultModel).toBe("anthropic/claude-sonnet-4-5");
    expect(disk.theme).toBe("Cinlodev CUTE");
    expect(disk.sddProfiles.disableAltShortcut).toBe(true);
  });
});
