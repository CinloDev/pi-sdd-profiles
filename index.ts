import { SddProfileManager } from "./src/manager.js";
import {
  formatProfileDetail,
  formatProfileList,
  runInteractiveProfileCreate,
  runInteractiveProfileEdit,
  runInteractiveProfileSelect,
  type UiContext,
} from "./src/ui.js";

export { SddProfileManager } from "./src/manager.js";
export * from "./src/types.js";
export * from "./src/catalog.js";

export default function sddProfilesExtension(pi: any): void {
  const getManager = (ctx?: any) => {
    const cwd = ctx?.cwd ?? process.cwd();
    return new SddProfileManager({
      projectDir: `${cwd}/.pi/profiles`,
      projectSubagentsPath: `${cwd}/.pi/subagents.json`,
    });
  };

  const syncActiveProfileToRuntime = async (profile?: any, ctx?: any): Promise<void> => {
    if (!profile) return;

    // 1. Update footer status indicator
    if (ctx?.hasUI && typeof ctx?.ui?.setStatus === "function") {
      ctx.ui.setStatus("sdd-profile", `🎛️ [${profile.name}]`);
    }

    // 2. Switch main session model if default_model is defined
    if (profile.default_model && typeof pi.setModel === "function") {
      const sep = profile.default_model.indexOf("/");
      if (sep !== -1) {
        const provider = profile.default_model.slice(0, sep).trim();
        const modelId = profile.default_model.slice(sep + 1).trim();

        let targetModel = ctx?.modelRegistry?.find?.(provider, modelId);
        if (!targetModel && typeof ctx?.modelRegistry?.getAvailable === "function") {
          try {
            const available = await ctx.modelRegistry.getAvailable();
            targetModel = available?.find?.(
              (m: any) =>
                (m.provider === provider || m.providerId === provider) &&
                (m.id === modelId || m.model === modelId || m.name === modelId)
            );
          } catch {}
        }

        if (targetModel) {
          try {
            await pi.setModel(targetModel);
          } catch (e) {
            console.warn(`[sdd-profiles] Could not switch session model to ${profile.default_model}:`, e);
          }
        }
      }
    }

    // 3. Switch thinking level
    if (profile.default_effort && typeof pi.setThinkingLevel === "function") {
      try {
        pi.setThinkingLevel(profile.default_effort);
      } catch {}
    }
  };

  // Ensure footer status and session model match active profile on start
  pi.on?.("session_start", async (_event: any, ctx: any) => {
    const manager = getManager(ctx);
    const active = manager.getActiveProfileName();
    if (active) {
      const profile = manager.getProfile(active);
      if (profile) {
        await syncActiveProfileToRuntime(profile, ctx);
      }
    }
  });

  // Main /sdd-profile command
  pi.registerCommand?.("sdd-profile", {
    description: "Gestionar y alternar perfiles de modelos SDD y subagentes (/sdd-profile [apply|save|list|show|delete])",
    handler: async (args: string, ctx: UiContext) => {
      const manager = getManager(ctx);
      const boundCtx: UiContext = {
        ...ctx,
        onProfileActivated: async (p) => {
          await syncActiveProfileToRuntime(p, ctx);
        },
      };
      const trimmed = (args || "").trim();

      if (!trimmed) {
        return runInteractiveProfileSelect(manager, boundCtx);
      }

      const parts = trimmed.split(/\s+/);
      const sub = parts[0].toLowerCase();
      const targetName = parts[1];

      switch (sub) {
        case "list": {
          const profiles = manager.listProfiles();
          const active = manager.getActiveProfileName();
          return formatProfileList(profiles, active);
        }

        case "show": {
          if (!targetName) {
            ctx.ui?.notify?.("Uso: /sdd-profile show <nombre>", "warning");
            return "Uso: /sdd-profile show <nombre>";
          }
          const profile = manager.getProfile(targetName);
          if (!profile) {
            const msg = `Perfil "${targetName}" no encontrado.`;
            ctx.ui?.notify?.(msg, "error");
            return msg;
          }
          const active = manager.getActiveProfileName();
          const isActive = Boolean(active && active.toLowerCase() === targetName.toLowerCase());
          return formatProfileDetail(profile, isActive);
        }

        case "apply": {
          if (!targetName) {
            ctx.ui?.notify?.("Uso: /sdd-profile apply <nombre>", "warning");
            return "Uso: /sdd-profile apply <nombre>";
          }
          const isProject = parts.includes("--project");
          const result = manager.activateProfile(targetName, isProject ? "project" : "global");
          if (result.success && result.profile) {
            await syncActiveProfileToRuntime(result.profile, ctx);
          }
          ctx.ui?.notify?.(result.message, result.success ? "info" : "error");
          return result.message;
        }

        case "save": {
          if (!targetName) {
            ctx.ui?.notify?.("Uso: /sdd-profile save <nombre> [descripción] [--project]", "warning");
            return "Uso: /sdd-profile save <nombre> [descripción] [--project]";
          }
          const isProject = parts.includes("--project");
          const descWords = parts.slice(2).filter((w) => w !== "--project" && w !== "--global");
          const description = descWords.length > 0 ? descWords.join(" ") : undefined;

          const result = manager.saveCurrentAsProfile(
            targetName,
            description,
            isProject ? "project" : "global"
          );
          ctx.ui?.notify?.(result.message, result.success ? "info" : "error");
          return result.message;
        }

        case "create": {
          if (!targetName) {
            return runInteractiveProfileCreate(manager, ctx);
          }
          const defaultModel = parts[2];
          const effort = parts[3] as any;
          const isProject = parts.includes("--project");
          const result = manager.createProfile({
            name: targetName,
            default_model: defaultModel && defaultModel !== "--project" ? defaultModel : undefined,
            default_effort: effort && effort !== "--project" ? effort : undefined,
            scope: isProject ? "project" : "global",
          });
          ctx.ui?.notify?.(result.message, result.success ? "info" : "error");
          return result.message;
        }

        case "edit": {
          if (!targetName) {
            ctx.ui?.notify?.("Uso: /sdd-profile edit <nombre>", "warning");
            return "Uso: /sdd-profile edit <nombre>";
          }
          return runInteractiveProfileEdit(manager, ctx, targetName);
        }

        case "set": {
          const agentName = parts[2];
          const modelName = parts[3];
          const effort = parts[4] as any;
          if (!targetName || !agentName || !modelName) {
            const msg = "Uso: /sdd-profile set <perfil> <agente> <modelo> [effort]";
            ctx.ui?.notify?.(msg, "warning");
            return msg;
          }
          const result = manager.setAgentInProfile({
            profileName: targetName,
            agentName,
            model: modelName,
            effort,
          });
          ctx.ui?.notify?.(result.message, result.success ? "info" : "error");
          return result.message;
        }

        case "delete": {
          if (!targetName) {
            ctx.ui?.notify?.("Uso: /sdd-profile delete <nombre>", "warning");
            return "Uso: /sdd-profile delete <nombre>";
          }
          const deleted = manager.deleteProfile(targetName);
          const msg = deleted
            ? `Perfil "${targetName}" eliminado.`
            : `No se pudo eliminar "${targetName}" (no existe o es un perfil predeterminado).`;
          ctx.ui?.notify?.(msg, deleted ? "info" : "warning");
          return msg;
        }

        default: {
          // If the user typed `/sdd-profile <name>`, try activating it directly
          const result = manager.activateProfile(sub);
          if (result.success && result.profile) {
            await syncActiveProfileToRuntime(result.profile, ctx);
          }
          ctx.ui?.notify?.(result.message, result.success ? "info" : "error");
          return result.message;
        }
      }
    },
  });

  // Direct helper command: /sdd-profile-save <name> [desc]
  pi.registerCommand?.("sdd-profile-save", {
    description: "Guardar configuración actual de subagents.json como perfil",
    handler: async (args: string, ctx: UiContext) => {
      const manager = getManager(ctx);
      const trimmed = (args || "").trim();
      if (!trimmed) {
        ctx.ui?.notify?.("Uso: /sdd-profile-save <nombre>", "warning");
        return "Uso: /sdd-profile-save <nombre>";
      }
      const [name, ...descParts] = trimmed.split(/\s+/);
      const desc = descParts.join(" ") || undefined;
      const res = manager.saveCurrentAsProfile(name, desc, "global");
      ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
      return res.message;
    },
  });

  // Direct helper command: /sdd-profile-list
  pi.registerCommand?.("sdd-profile-list", {
    description: "Listar perfiles de modelos SDD y subagentes",
    handler: async (_args: string, ctx: UiContext) => {
      const manager = getManager(ctx);
      const profiles = manager.listProfiles();
      const active = manager.getActiveProfileName();
      return formatProfileList(profiles, active);
    },
  });

  // Keyboard shortcut to open interactive selector (alt+s avoids conflict with Pi core alt+p model cycling)
  pi.registerShortcut?.("alt+s", {
    description: "Abrir selector interactivo de perfiles SDD",
    handler: async (ctx: UiContext) => {
      const manager = getManager(ctx);
      await runInteractiveProfileSelect(manager, ctx);
    },
  });

  // Tool registration for LLM / Orchestrator when programmatic switching is needed
  if (typeof pi.registerTool === "function") {
    pi.registerTool({
      name: "sdd_profile_list",
      description: "List all available SDD and subagent model profiles.",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const manager = getManager();
        const profiles = manager.listProfiles();
        const active = manager.getActiveProfileName();
        return {
          active_profile: active,
          profiles,
        };
      },
    });

    pi.registerTool({
      name: "sdd_profile_switch",
      description: "Switch the active SDD and subagent model profile.",
      parameters: {
        type: "object",
        properties: {
          profile_name: {
            type: "string",
            description: "The name of the profile to activate (e.g. 'cinlo-flash', 'deep-reasoning').",
          },
          scope: {
            type: "string",
            description: "Whether to update 'global' or 'project' subagents config.",
            enum: ["global", "project"],
          },
        },
        required: ["profile_name"],
      },
      handler: async (args: { profile_name: string; scope?: "global" | "project" }) => {
        const manager = getManager();
        const res = manager.activateProfile(args.profile_name, args.scope ?? "global");
        return {
          success: res.success,
          message: res.message,
          active_profile: args.profile_name,
        };
      },
    });
  }
}
