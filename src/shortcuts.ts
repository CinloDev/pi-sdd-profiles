import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface SddProfilesSettings {
  shortcuts?: string[];
  disableAltShortcut?: boolean;
  enableAltShortcut?: boolean;
  [key: string]: unknown;
}

export interface ShortcutsResolveOptions {
  cwd?: string;
  globalSettingsPath?: string;
  projectSettingsPath?: string;
}

export interface ShortcutsUpdateOptions extends ShortcutsResolveOptions {
  scope?: "global" | "project";
}

export const DEFAULT_SHORTCUTS = ["ctrl+shift+m", "alt+m"] as const;

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractSddProfilesSettings(
  config: Record<string, unknown> | null
): SddProfilesSettings | null {
  if (!config) return null;
  const raw = config.sddProfiles ?? config["sdd-profiles"];
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as SddProfilesSettings)
    : null;
}

/**
 * Resolves the active keyboard shortcuts configured for pi-sdd-profiles.
 * Checks project-level `.pi/settings.json` first, then falls back to `~/.pi/agent/settings.json`.
 *
 * Defaults:
 * - If no configuration is found: ["ctrl+shift+m", "alt+m"]
 * - If disableAltShortcut is true: ["ctrl+shift+m"]
 * - If shortcuts array is provided: returns the custom list (minus alt+m if disableAltShortcut is true)
 * - If shortcuts is an empty array: [] (disables all shortcuts)
 */
export function resolveShortcutsConfig(options: ShortcutsResolveOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const projectSettingsPath =
    options.projectSettingsPath ?? path.join(cwd, ".pi", "settings.json");
  const globalSettingsPath =
    options.globalSettingsPath ?? path.join(os.homedir(), ".pi", "agent", "settings.json");

  const projectConfig = extractSddProfilesSettings(readJsonFile(projectSettingsPath));
  const globalConfig = extractSddProfilesSettings(readJsonFile(globalSettingsPath));

  // Merge settings: project overrides global
  const settings: SddProfilesSettings | null =
    projectConfig || globalConfig
      ? { ...(globalConfig ?? {}), ...(projectConfig ?? {}) }
      : null;

  if (!settings) {
    return [...DEFAULT_SHORTCUTS];
  }

  const isAltDisabled =
    settings.disableAltShortcut === true || settings.enableAltShortcut === false;

  if (Array.isArray(settings.shortcuts)) {
    const cleaned = settings.shortcuts
      .map((s) => (typeof s === "string" ? s.trim().toLowerCase() : ""))
      .filter(Boolean);

    if (isAltDisabled) {
      return cleaned.filter((s) => s !== "alt+m");
    }
    return cleaned;
  }

  if (isAltDisabled) {
    return ["ctrl+shift+m"];
  }

  return [...DEFAULT_SHORTCUTS];
}

/**
 * Persists shortcut settings updates into settings.json (global by default).
 * Preserves all other existing settings.json properties.
 */
export function updateShortcutsSettings(
  updates: Partial<SddProfilesSettings>,
  options: ShortcutsUpdateOptions = {}
): {
  success: boolean;
  message: string;
  targetPath: string;
  shortcuts: string[];
} {
  const cwd = options.cwd ?? process.cwd();
  const scope = options.scope ?? "global";
  const targetPath =
    scope === "project"
      ? options.projectSettingsPath ?? path.join(cwd, ".pi", "settings.json")
      : options.globalSettingsPath ?? path.join(os.homedir(), ".pi", "agent", "settings.json");

  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let fullConfig: Record<string, unknown> = {};
  if (fs.existsSync(targetPath)) {
    try {
      fullConfig = JSON.parse(fs.readFileSync(targetPath, "utf-8")) ?? {};
    } catch {
      fullConfig = {};
    }
  }

  const currentSection =
    (fullConfig.sddProfiles as Record<string, unknown>) ??
    (fullConfig["sdd-profiles"] as Record<string, unknown>) ??
    {};

  const updatedSection: Record<string, unknown> = {
    ...currentSection,
    ...updates,
  };

  // Clean up undefined values
  for (const [k, v] of Object.entries(updatedSection)) {
    if (v === undefined) {
      delete updatedSection[k];
    }
  }

  fullConfig.sddProfiles = updatedSection;

  // Write atomically via tmp file
  const formatted = JSON.stringify(fullConfig, null, 2) + "\n";
  const tmpPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmpPath, formatted, "utf-8");
  fs.renameSync(tmpPath, targetPath);

  const effective = resolveShortcutsConfig(options);

  return {
    success: true,
    message: `Configuración de atajos actualizada en ${scope} (${targetPath}).`,
    targetPath,
    shortcuts: effective,
  };
}
