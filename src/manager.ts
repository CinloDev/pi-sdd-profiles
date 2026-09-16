import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProfileStorage, type StorageOptions } from "./storage.js";
import { applyProfileToFile, extractProfileFromConfig, reconcileProfileWithFile } from "./sync.js";
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
}
