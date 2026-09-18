import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProfileStorage, type StorageOptions } from "./storage.js";
import { applyProfileToFile, extractProfileFromConfig, reconcileProfileWithFile } from "./sync.js";
import {
  ALL_KNOWN_AGENTS,
  type AgentCategory,
  CUSTOM_CATEGORY_ID,
  isSyntheticAgentKey,
  resolveCategories,
} from "./catalog.js";
import type {
  ModelProfileEntry,
  Profile,
  ProfileSummary,
  ReasoningEffort,
  SubagentsConfigFile,
} from "./types.js";

export interface ManagerOptions extends StorageOptions {
  globalSubagentsPath?: string;
  projectSubagentsPath?: string;
}

export class SddProfileManager {
  readonly storage: ProfileStorage;
  readonly globalSubagentsPath: string;
  readonly projectSubagentsPath: string;

  constructor(options: ManagerOptions = {}) {
    this.storage = new ProfileStorage(options);

    const home = os.homedir();
    this.globalSubagentsPath =
      options.globalSubagentsPath ?? path.join(home, ".pi", "agent", "subagents.json");
    this.projectSubagentsPath =
      options.projectSubagentsPath ?? path.join(process.cwd(), ".pi", "subagents.json");
  }

  listProfiles(): ProfileSummary[] {
    return this.storage.listProfiles();
  }

  getProfile(name: string): Profile | null {
    return this.storage.loadProfile(name);
  }

  getActiveProfileName(scope?: "effective" | "project" | "global"): string | null {
    return this.storage.getActiveProfileName(scope);
  }

  getActiveScope(): "project" | "global" | null {
    return this.storage.getActiveScope();
  }

  /**
   * Activates a profile by applying its models and defaults onto subagents.json
   */
  activateProfile(
    name: string,
    target: "global" | "project" = "global"
  ): { success: boolean; profile?: Profile; message: string } {
    const profile = this.storage.loadProfile(name);
    if (!profile) {
      return {
        success: false,
        message: `Perfil "${name}" no encontrado.`,
      };
    }

    const targetPath =
      target === "project" ? this.projectSubagentsPath : this.globalSubagentsPath;

    applyProfileToFile(targetPath, profile);
    this.storage.setActiveProfileName(profile.name, target);

    return {
      success: true,
      profile,
      message: `Perfil "${profile.name}" activado correctamente en ${target} subagents.json.`,
    };
  }

  /**
   * Clears the active profile assignment for the specified scope.
   */
  clearActiveProfile(scope: "project" | "global" | "both" = "project"): {
    success: boolean;
    message: string;
  } {
    this.storage.clearActiveProfileName(scope);
    return {
      success: true,
      message: `Perfil activo de ${scope} limpiado correctamente.`,
    };
  }

  /**
   * Reaffirms the active profile against global and/or project subagents.json.
   * If model_profiles or defaults diverge from the active profile, they are restored atomically.
   * Global subagents.json reconciles against the global active profile.
   * Project subagents.json reconciles against the project active profile.
   */
  reaffirmActiveProfile(target: "global" | "project" | "both" = "both"): {
    globalUpdated: boolean;
    projectUpdated: boolean;
  } {
    let globalUpdated = false;
    let projectUpdated = false;

    if (target === "global" || target === "both") {
      const globalActive = this.getActiveProfileName("global");
      if (globalActive) {
        const profile = this.getProfile(globalActive);
        if (profile) {
          const res = reconcileProfileWithFile(this.globalSubagentsPath, profile);
          globalUpdated = res.updated;
        }
      }
    }

    if (target === "project" || target === "both") {
      const projectActive = this.getActiveProfileName("project");
      if (projectActive) {
        const profile = this.getProfile(projectActive);
        if (profile) {
          const res = reconcileProfileWithFile(this.projectSubagentsPath, profile);
          projectUpdated = res.updated;
        }
      } else if (target === "project") {
        const effectiveActive = this.getActiveProfileName("effective");
        if (effectiveActive && fs.existsSync(this.projectSubagentsPath)) {
          const profile = this.getProfile(effectiveActive);
          if (profile) {
            const res = reconcileProfileWithFile(this.projectSubagentsPath, profile);
            projectUpdated = res.updated;
          }
        }
      }
    }

    return { globalUpdated, projectUpdated };
  }

  /**
   * Saves the current subagents.json configuration as a reusable profile.
   */
  saveCurrentAsProfile(
    name: string,
    description?: string,
    scope: "global" | "project" = "global"
  ): { success: boolean; path?: string; profile?: Profile; message: string } {
    // Read from project config if exists, else global
    let sourcePath = this.globalSubagentsPath;
    if (scope === "project" && fs.existsSync(this.projectSubagentsPath)) {
      sourcePath = this.projectSubagentsPath;
    } else if (fs.existsSync(this.projectSubagentsPath)) {
      sourcePath = this.projectSubagentsPath;
    }

    let config: SubagentsConfigFile = {};
    if (fs.existsSync(sourcePath)) {
      try {
        config = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
      } catch {
        config = {};
      }
    }

    const profile = extractProfileFromConfig(config, name, description);
    const savedPath = this.storage.saveProfile(profile, scope);
    this.storage.setActiveProfileName(profile.name);

    return {
      success: true,
      path: savedPath,
      profile,
      message: `Perfil "${profile.name}" guardado exitosamente en ${savedPath}.`,
    };
  }

  /**
   * Creates a new profile explicitly with user-defined models and defaults.
   */
  createProfile(params: {
    name: string;
    description?: string;
    default_model?: string;
    default_effort?: ReasoningEffort;
    model_profiles?: Record<string, ModelProfileEntry>;
    scope?: "global" | "project";
  }): { success: boolean; path?: string; profile?: Profile; message: string } {
    const trimmed = params.name.trim();
    if (!trimmed) {
      return { success: false, message: "El nombre del perfil no puede estar vacío." };
    }

    const scope = params.scope ?? "global";
    const newProfile: Profile = {
      name: trimmed,
      description: params.description?.trim() || undefined,
      default_model: params.default_model?.trim() || undefined,
      default_effort: params.default_effort,
      model_profiles: params.model_profiles ?? {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const savedPath = this.storage.saveProfile(newProfile, scope);
    return {
      success: true,
      path: savedPath,
      profile: newProfile,
      message: `Perfil "${newProfile.name}" creado correctamente en ${scope} (${savedPath}).`,
    };
  }

  /**
   * Exports an existing profile to an external file.
   */
  exportProfile(
    name: string,
    targetFilePath: string
  ): { success: boolean; path?: string; message: string } {
    try {
      const savedPath = this.storage.exportProfile(name, targetFilePath);
      return {
        success: true,
        path: savedPath,
        message: `Perfil "${name}" exportado con éxito a "${savedPath}".`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Error al exportar perfil: ${err?.message ?? String(err)}`,
      };
    }
  }

  /**
   * Imports a profile from an external JSON file.
   */
  importProfile(params: {
    sourceFilePath: string;
    scope?: "global" | "project";
    overrideName?: string;
  }): { success: boolean; profile?: Profile; path?: string; message: string } {
    try {
      const scope = params.scope ?? "global";
      const res = this.storage.importProfile(
        params.sourceFilePath,
        scope,
        params.overrideName
      );
      return {
        success: true,
        profile: res.profile,
        path: res.path,
        message: `Perfil "${res.profile.name}" importado con éxito en ${scope} (${res.path}).`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Error al importar perfil: ${err?.message ?? String(err)}`,
      };
    }
  }

  /**
   * Updates or assigns a specific agent model inside an existing profile.
   */
  setAgentInProfile(params: {
    profileName: string;
    agentName: string;
    model: string;
    effort?: ReasoningEffort;
    scope?: "global" | "project";
  }): { success: boolean; profile?: Profile; message: string } {
    const profile = this.storage.loadProfile(params.profileName);
    if (!profile) {
      return { success: false, message: `Perfil "${params.profileName}" no encontrado.` };
    }

    const updatedProfiles = { ...profile.model_profiles };
    const agentKey = params.agentName.trim();
    if (params.effort) {
      updatedProfiles[agentKey] = {
        model: params.model.trim(),
        effort: params.effort,
      };
    } else {
      updatedProfiles[agentKey] = {
        model: params.model.trim(),
      };
    }

    const updatedProfile: Profile = {
      ...profile,
      model_profiles: updatedProfiles,
      updated_at: new Date().toISOString(),
    };

    const savedPath = this.storage.saveProfile(updatedProfile, params.scope ?? "global");
    return {
      success: true,
      profile: updatedProfile,
      message: `Agente "${params.agentName}" asignado a "${params.model}" en el perfil "${profile.name}".`,
    };
  }

  renameProfile(
    oldName: string,
    newName: string
  ): { success: boolean; message: string; profile?: Profile } {
    const res = this.storage.renameProfile(oldName, newName);
    if (!res.success) {
      return { success: false, message: res.message };
    }
    const loaded = this.storage.loadProfile(newName);
    return {
      success: true,
      message: res.message,
      profile: loaded ?? undefined,
    };
  }

  deleteProfile(name: string): boolean {
    return this.storage.deleteProfile(name);
  }

  /**
   * Discovers custom agents dynamically from project/global subagents.json,
   * saved profiles in storage, and the currently active/specified profile.
   */
  discoverCustomAgents(currentProfile?: Profile): string[] {
    const candidateSet = new Set<string>();

    const collectFromConfig = (filePath: string) => {
      if (!fs.existsSync(filePath)) return;
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object") return;

        if (data.model_profiles && typeof data.model_profiles === "object") {
          for (const key of Object.keys(data.model_profiles)) {
            if (typeof key === "string") candidateSet.add(key);
          }
        }

        if (data.agents) {
          if (Array.isArray(data.agents)) {
            for (const item of data.agents) {
              if (typeof item === "string") {
                candidateSet.add(item);
              } else if (item && typeof item === "object") {
                if (typeof (item as any).name === "string") candidateSet.add((item as any).name);
                if (typeof (item as any).id === "string") candidateSet.add((item as any).id);
                if (typeof (item as any).key === "string") candidateSet.add((item as any).key);
              }
            }
          } else if (typeof data.agents === "object") {
            for (const [key, val] of Object.entries(data.agents)) {
              if (typeof key === "string") candidateSet.add(key);
              if (typeof val === "string") {
                candidateSet.add(val);
              } else if (val && typeof val === "object") {
                if (typeof (val as any).name === "string") candidateSet.add((val as any).name);
                if (typeof (val as any).id === "string") candidateSet.add((val as any).id);
                if (typeof (val as any).key === "string") candidateSet.add((val as any).key);
              }
            }
          }
        }
      } catch {
        // Ignore unreadable / malformed files
      }
    };

    collectFromConfig(this.projectSubagentsPath);
    collectFromConfig(this.globalSubagentsPath);

    const collectFromAgentsDirectory = (dirPath: string) => {
      if (!fs.existsSync(dirPath)) return;
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const validExts = new Set([".md", ".json", ".yaml", ".yml"]);
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const ext = path.extname(entry.name).toLowerCase();
          if (!validExts.has(ext)) continue;
          const agentName = path.basename(entry.name, path.extname(entry.name));
          if (agentName.startsWith(".")) continue;
          if (isSyntheticAgentKey(agentName)) continue;
          candidateSet.add(agentName);
        }
      } catch {
        // Ignore unreadable directories
      }
    };

    const projectAgentsDir = path.join(path.dirname(this.projectSubagentsPath), "agents");
    const globalAgentsDir = path.join(path.dirname(this.globalSubagentsPath), "agents");
    collectFromAgentsDirectory(projectAgentsDir);
    collectFromAgentsDirectory(globalAgentsDir);

    try {
      const summaries = this.storage.listProfiles();
      for (const summary of summaries) {
        const prof = this.storage.loadProfile(summary.name);
        if (prof?.model_profiles && typeof prof.model_profiles === "object") {
          for (const key of Object.keys(prof.model_profiles)) {
            if (typeof key === "string") candidateSet.add(key);
          }
        }
      }
    } catch {
      // Ignore storage errors
    }

    if (currentProfile?.model_profiles && typeof currentProfile.model_profiles === "object") {
      for (const key of Object.keys(currentProfile.model_profiles)) {
        if (typeof key === "string") candidateSet.add(key);
      }
    }

    const knownSet = new Set<string>(ALL_KNOWN_AGENTS);
    const result: string[] = [];

    for (const key of candidateSet) {
      if (!knownSet.has(key) && !isSyntheticAgentKey(key)) {
        result.push(key);
      }
    }

    return result.sort((a, b) => a.localeCompare(b));
  }

  /**
   * Returns all agent categories including standard SDD categories and,
   * if discovered, a Custom Agents category.
   */
  getCategories(currentProfile?: Profile): AgentCategory[] {
    return resolveCategories(this.discoverCustomAgents(currentProfile));
  }

  /**
   * Returns a flat list of all known agent names (standard SDD agents + discovered custom agents).
   */
  getAllAgents(currentProfile?: Profile): string[] {
    return this.getCategories(currentProfile).flatMap((c) => c.agents);
  }
}
