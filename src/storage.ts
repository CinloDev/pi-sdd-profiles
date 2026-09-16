import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import type { Profile, ProfileScope, ProfileSummary } from "./types.js";

export interface StorageOptions {
  globalDir?: string;
  projectDir?: string;
  builtinsDir?: string;
  activeStatePath?: string;
  projectActiveStatePath?: string;
}

export class ProfileStorage {
  readonly globalDir: string;
  readonly projectDir: string;
  readonly builtinsDir: string;
  readonly activeStatePath: string;
  readonly projectActiveStatePath: string;

  constructor(options: StorageOptions = {}) {
    const home = os.homedir();
    this.globalDir = options.globalDir ?? path.join(home, ".pi", "agent", "profiles");
    this.projectDir = options.projectDir ?? path.join(process.cwd(), ".pi", "profiles");

    if (options.builtinsDir) {
      this.builtinsDir = options.builtinsDir;
    } else {
      // Default to bundled package profiles/ directory
      try {
        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        this.builtinsDir = path.resolve(currentDir, "..", "profiles");
      } catch {
        this.builtinsDir = path.resolve(process.cwd(), "profiles");
      }
    }

    this.activeStatePath =
      options.activeStatePath ?? path.join(this.globalDir, ".active");
    this.projectActiveStatePath =
      options.projectActiveStatePath ?? path.join(this.projectDir, ".active");
  }

  /**
   * Sanitizes a profile name to safe filename characters.
   */
  private sanitizeName(name: string): string {
    return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  }

  private getDeletedProfilesPath(): string {
    return path.join(this.globalDir, ".deleted-profiles");
  }

  private getDeletedProfiles(): Set<string> {
    const filePath = this.getDeletedProfilesPath();
    if (!fs.existsSync(filePath)) return new Set();
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const lines = raw.split("\n").map((s) => this.sanitizeName(s)).filter(Boolean);
      return new Set(lines);
    } catch {
      return new Set();
    }
  }

  private addDeletedProfile(name: string): void {
    const set = this.getDeletedProfiles();
    set.add(this.sanitizeName(name));
    try {
      if (!fs.existsSync(this.globalDir)) {
        fs.mkdirSync(this.globalDir, { recursive: true });
      }
      fs.writeFileSync(this.getDeletedProfilesPath(), Array.from(set).join("\n"), "utf-8");
    } catch {}
  }

  private removeDeletedProfile(name: string): void {
    const set = this.getDeletedProfiles();
    const key = this.sanitizeName(name);
    if (set.has(key)) {
      set.delete(key);
      try {
        fs.writeFileSync(this.getDeletedProfilesPath(), Array.from(set).join("\n"), "utf-8");
      } catch {}
    }
  }

  /**
   * Reads all JSON profile files from a given directory.
   */
  private readProfilesFromDir(
    dir: string,
    scope: ProfileScope
  ): Map<string, { profile: Profile; path: string }> {
    const map = new Map<string, { profile: Profile; path: string }>();
    if (!fs.existsSync(dir)) return map;

    const deletedBuiltins = scope === "builtin" ? this.getDeletedProfiles() : new Set<string>();

    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith(".json") || file.startsWith(".")) continue;
        const filePath = path.join(dir, file);
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const data = JSON.parse(raw) as Profile;
          if (data && typeof data === "object" && data.name) {
            const normalizedKey = this.sanitizeName(data.name);
            if (deletedBuiltins.has(normalizedKey)) continue;
            map.set(normalizedKey, { profile: data, path: filePath });
          }
        } catch {
          // Ignore invalid JSON files
        }
      }
    } catch {
      // Ignore read errors
    }

    return map;
  }

  /**
   * Lists all available profiles across builtins, global, and project scopes.
   * Project profiles override global and builtin profiles with the same normalized name.
   */
  listProfiles(): ProfileSummary[] {
    const builtins = this.readProfilesFromDir(this.builtinsDir, "builtin");
    const globals = this.readProfilesFromDir(this.globalDir, "global");
    const projects = this.readProfilesFromDir(this.projectDir, "project");

    const activeName = this.getActiveProfileName();
    const activeScope = this.getActiveScope();
    const merged = new Map<string, { profile: Profile; scope: ProfileScope; path: string }>();

    for (const [key, val] of builtins) {
      merged.set(key, { profile: val.profile, scope: "builtin", path: val.path });
    }
    for (const [key, val] of globals) {
      merged.set(key, { profile: val.profile, scope: "global", path: val.path });
    }
    for (const [key, val] of projects) {
      merged.set(key, { profile: val.profile, scope: "project", path: val.path });
    }

    const summaries: ProfileSummary[] = [];
    for (const [, item] of merged) {
      const { profile, scope, path: filePath } = item;
      const count = Object.keys(profile.model_profiles || {}).length;
      const isActive = Boolean(activeName && this.sanitizeName(profile.name) === this.sanitizeName(activeName));
      summaries.push({
        name: profile.name,
        description: profile.description,
        default_model: profile.default_model,
        agent_count: count,
        scope,
        is_active: isActive,
        active_scope: isActive ? (activeScope ?? undefined) : undefined,
        path: filePath,
      });
    }

    // Sort alphabetically by name
    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Loads a full profile definition by name.
   * Checks project scope first, then global, then builtin.
   */
  loadProfile(name: string): Profile | null {
    const key = this.sanitizeName(name);

    // 1. Project
    const projectPath = path.join(this.projectDir, `${key}.json`);
    if (fs.existsSync(projectPath)) {
      try {
        return JSON.parse(fs.readFileSync(projectPath, "utf-8")) as Profile;
      } catch {}
    }

    // 2. Global
    const globalPath = path.join(this.globalDir, `${key}.json`);
    if (fs.existsSync(globalPath)) {
      try {
        return JSON.parse(fs.readFileSync(globalPath, "utf-8")) as Profile;
      } catch {}
    }

    // 3. Builtin (only if not marked deleted)
    if (!this.getDeletedProfiles().has(key)) {
      const builtinPath = path.join(this.builtinsDir, `${key}.json`);
      if (fs.existsSync(builtinPath)) {
        try {
          return JSON.parse(fs.readFileSync(builtinPath, "utf-8")) as Profile;
        } catch {}
      }
    }

    return null;
  }

  /**
   * Saves a profile to the specified scope ("global" by default).
   */
  saveProfile(profile: Profile, scope: "global" | "project" = "global"): string {
    const targetDir = scope === "project" ? this.projectDir : this.globalDir;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const key = this.sanitizeName(profile.name);
    this.removeDeletedProfile(key);
    const targetPath = path.join(targetDir, `${key}.json`);

    const payload: Profile = {
      ...profile,
      name: profile.name.trim(),
      updated_at: new Date().toISOString(),
    };
    if (!payload.created_at) {
      payload.created_at = payload.updated_at;
    }

    const formatted = JSON.stringify(payload, null, 2) + "\n";
    const tmpPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    fs.writeFileSync(tmpPath, formatted, "utf-8");
    fs.renameSync(tmpPath, targetPath);

    return targetPath;
  }

  /**
   * Clears active profile state.
   * - "project": clears only project-level .active
   * - "global": clears only global .active
   * - "both": clears both project and global
   */
  clearActiveProfileName(scope: "project" | "global" | "both" = "both"): void {
    if (scope === "project" || scope === "both") {
      if (fs.existsSync(this.projectActiveStatePath)) {
        try {
          fs.unlinkSync(this.projectActiveStatePath);
        } catch {}
      }
    }
    if (scope === "global" || scope === "both") {
      if (fs.existsSync(this.activeStatePath)) {
        try {
          fs.unlinkSync(this.activeStatePath);
        } catch {}
      }
    }
  }

  /**
   * Deletes a profile from project, global, or builtin scope.
   * Clears active state if the deleted profile was active in either scope.
   */
  deleteProfile(name: string): boolean {
    const key = this.sanitizeName(name);
    let deleted = false;

    // Check project first
    const projectPath = path.join(this.projectDir, `${key}.json`);
    if (fs.existsSync(projectPath)) {
      try {
        fs.unlinkSync(projectPath);
        deleted = true;
      } catch {}
    }

    // Check global
    const globalPath = path.join(this.globalDir, `${key}.json`);
    if (fs.existsSync(globalPath)) {
      try {
        fs.unlinkSync(globalPath);
        deleted = true;
      } catch {}
    }

    // Check builtin (mark deleted in persistent tombstone so package templates remain intact for new users)
    const builtinPath = path.join(this.builtinsDir, `${key}.json`);
    if (fs.existsSync(builtinPath) && !this.getDeletedProfiles().has(key)) {
      this.addDeletedProfile(key);
      deleted = true;
    }

    if (deleted) {
      const projectActive = this.getActiveProfileName("project");
      if (projectActive && this.sanitizeName(projectActive) === key) {
        this.clearActiveProfileName("project");
      }
      const globalActive = this.getActiveProfileName("global");
      if (globalActive && this.sanitizeName(globalActive) === key) {
        this.clearActiveProfileName("global");
      }
    }

    return deleted;
  }

  /**
   * Renames any profile in project, global, or builtin scope.
   * Returns an object indicating success, message, and target path.
   */
  renameProfile(
    oldName: string,
    newName: string
  ): { success: boolean; message: string; targetPath?: string } {
    const trimmedNew = newName.trim();
    if (!trimmedNew) {
      return { success: false, message: "El nuevo nombre no puede estar vacío." };
    }

    const oldKey = this.sanitizeName(oldName);
    const newKey = this.sanitizeName(trimmedNew);

    if (oldKey === newKey) {
      return { success: false, message: "El nuevo nombre debe ser diferente al actual." };
    }

    const original = this.loadProfile(oldName);
    if (!original) {
      return {
        success: false,
        message: `Perfil "${oldName}" no encontrado.`,
      };
    }

    // Check if new name already exists
    if (this.loadProfile(trimmedNew)) {
      return {
        success: false,
        message: `Ya existe un perfil con el nombre "${trimmedNew}".`,
      };
    }

    // Determine target scope: if original file was in project, save to project, else global
    const projectPath = path.join(this.projectDir, `${oldKey}.json`);
    const targetScope: "project" | "global" = fs.existsSync(projectPath) ? "project" : "global";

    const updatedProfile: Profile = {
      ...original,
      name: trimmedNew,
      updated_at: new Date().toISOString(),
    };

    const savedPath = this.saveProfile(updatedProfile, targetScope);

    // Check if the old profile was currently active in project or global
    const projectActive = this.getActiveProfileName("project");
    const wasActiveProject = Boolean(projectActive && this.sanitizeName(projectActive) === oldKey);
    const globalActive = this.getActiveProfileName("global");
    const wasActiveGlobal = Boolean(globalActive && this.sanitizeName(globalActive) === oldKey);

    // Delete old profile
    this.deleteProfile(oldName);

    // Update active state if the renamed profile was active
    if (wasActiveProject) {
      this.setActiveProfileName(trimmedNew, "project");
    }
    if (wasActiveGlobal) {
      this.setActiveProfileName(trimmedNew, "global");
    }

    return {
      success: true,
      message: `Perfil "${oldName}" renombrado correctamente a "${trimmedNew}".`,
      targetPath: savedPath,
    };
  }

  private readActiveFromFile(filePath: string): string | null {
    if (!fs.existsSync(filePath)) return null;
    try {
      const val = fs.readFileSync(filePath, "utf-8").trim();
      return val.length > 0 ? val : null;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves the active profile name.
   * - "project": only checks the project-local .active file.
   * - "global": only checks the user-global .active file.
   * - "effective" (or default): checks project first, falls back to global.
   */
  getActiveProfileName(scope: "effective" | "project" | "global" = "effective"): string | null {
    if (scope === "project") {
      return this.readActiveFromFile(this.projectActiveStatePath);
    }
    if (scope === "global") {
      return this.readActiveFromFile(this.activeStatePath);
    }
    return this.readActiveFromFile(this.projectActiveStatePath) ?? this.readActiveFromFile(this.activeStatePath);
  }

  /**
   * Returns whether the effective active profile is set at "project" or "global" scope, or null.
   */
  getActiveScope(): "project" | "global" | null {
    if (this.readActiveFromFile(this.projectActiveStatePath)) return "project";
    if (this.readActiveFromFile(this.activeStatePath)) return "global";
    return null;
  }

  /**
   * Sets the active profile name in the designated scope (global by default).
   */
  setActiveProfileName(name: string, scope: "global" | "project" = "global"): void {
    const targetPath = scope === "project" ? this.projectActiveStatePath : this.activeStatePath;
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, name.trim(), "utf-8");
  }
}
