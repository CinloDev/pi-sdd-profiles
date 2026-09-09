import { SddProfileManager } from "./src/manager.js";
import {
  formatProfileDetail,
  formatProfileList,
  runInteractiveProfileCreate,
  runInteractiveProfileEdit,
  runInteractiveProfileSelect,
  type UiContext,
} from "./src/ui.js";
import { createSddProfilesModal } from "./src/modal.js";
import { resolveAvailableModels } from "./src/models-resolver.js";
import { parseReasoningEffort, type ReasoningEffort } from "./src/types.js";

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

  const openProfilesModalOrFallback = async (manager: SddProfileManager, boundCtx: UiContext) => {
    if (typeof (boundCtx.ui as any)?.custom === "function") {
      const availableModels = await resolveAvailableModels(boundCtx);
      return (boundCtx.ui as any).custom(
        (tui: any, theme: any, _keybindings: any, done: (result?: any) => void) =>
          createSddProfilesModal({
            manager,
            availableModels,
            theme,
            tui,
            onProfileActivated: async (p) => {
              await syncActiveProfileToRuntime(p, boundCtx);
            },
            done: (res) => {
              if (res?.action === "activated") {
                boundCtx.ui?.notify?.(`Perfil SDD activado: ${res.profileName}`, "info");
              }
              done(res);
            },
          }),
        {
          overlay: true,
          overlayOptions: () => {
            const cols = process.stdout.columns || 100;
            // Keep card compact and centered: max 94 columns on wide screens,
            // while adapting responsively on smaller terminals.
            const targetWidth = Math.max(56, Math.min(cols - 4, 94));
            return {
              anchor: "center",
              width: targetWidth,
              maxHeight: "85%",
              minWidth: 56,
            };
          },
        }
      );
    }
    return runInteractiveProfileSelect(manager, boundCtx);
  };

  // Main /sdd-profile command
  pi.registerCommand?.("sdd-profile", {
    description: "Gestionar y alternar perfiles de modelos SDD y subagentes (/sdd-profile [apply|save|list|show|rename|delete])",
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
        return openProfilesModalOrFallback(manager, boundCtx);
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
          const rawEffort = parts[3];
          const isProject = parts.includes("--project");
          let parsedEffort: ReasoningEffort | undefined;
          if (rawEffort && rawEffort !== "--project") {
            try {
              parsedEffort = parseReasoningEffort(rawEffort);
            } catch (err: any) {
              ctx.ui?.notify?.(err.message, "error");
              return err.message;
            }
          }
          const result = manager.createProfile({
            name: targetName,
            default_model: defaultModel && defaultModel !== "--project" ? defaultModel : undefined,
            default_effort: parsedEffort,
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
          const rawEffort = parts[4];
          if (!targetName || !agentName || !modelName) {
            const msg = "Uso: /sdd-profile set <perfil> <agente> <modelo> [effort]";
            ctx.ui?.notify?.(msg, "warning");
            return msg;
          }
          let parsedEffort: ReasoningEffort | undefined;
          if (rawEffort !== undefined) {
            try {
              parsedEffort = parseReasoningEffort(rawEffort);
            } catch (err: any) {
              ctx.ui?.notify?.(err.message, "error");
              return err.message;
            }
          }
          const result = manager.setAgentInProfile({
            profileName: targetName,
            agentName,
            model: modelName,
            effort: parsedEffort,
          });
          ctx.ui?.notify?.(result.message, result.success ? "info" : "error");
          return result.message;
        }

        case "rename": {
          const newName = parts[2];
          if (!targetName || !newName) {
            const usage = "Uso: /sdd-profile rename <nombre-actual> <nuevo-nombre>";
            ctx.ui?.notify?.(usage, "warning");
            return usage;
          }
          const res = manager.renameProfile(targetName, newName);
          ctx.ui?.notify?.(res.message, res.success ? "info" : "warning");
          return res.message;
        }

        case "delete": {
          if (!targetName) {
            ctx.ui?.notify?.("Uso: /sdd-profile delete <nombre>", "warning");
            return "Uso: /sdd-profile delete <nombre>";
          }
          const profile = manager.getProfile(targetName);
          if (!profile) {
            const msg = `Perfil "${targetName}" no encontrado.`;
            ctx.ui?.notify?.(msg, "warning");
            return msg;
          }
          const deleted = manager.deleteProfile(targetName);
          const msg = deleted
            ? `Perfil "${targetName}" eliminado correctamente.`
            : `No se pudo eliminar el perfil "${targetName}".`;
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

  // Direct helper command: /sdd-profile-rename <actual> <nuevo>
  pi.registerCommand?.("sdd-profile-rename", {
    description: "Renombrar un perfil existente de modelos SDD",
    handler: async (args: string, ctx: UiContext) => {
      const manager = getManager(ctx);
      const parts = (args || "").trim().split(/\s+/);
      const oldName = parts[0];
      const newName = parts[1];
      if (!oldName || !newName) {
        const usage = "Uso: /sdd-profile-rename <nombre-actual> <nuevo-nombre>";
        ctx.ui?.notify?.(usage, "warning");
        return usage;
      }
      const res = manager.renameProfile(oldName, newName);
      ctx.ui?.notify?.(res.message, res.success ? "info" : "warning");
      return res.message;
    },
  });

  // Direct helper command: /sdd-profile-delete <nombre>
  pi.registerCommand?.("sdd-profile-delete", {
    description: "Eliminar un perfil de modelos SDD",
    handler: async (args: string, ctx: UiContext) => {
      const manager = getManager(ctx);
      const target = (args || "").trim();
      if (!target) {
        const usage = "Uso: /sdd-profile-delete <nombre>";
        ctx.ui?.notify?.(usage, "warning");
        return usage;
      }
      const profile = manager.getProfile(target);
      if (!profile) {
        const msg = `Perfil "${target}" no encontrado.`;
        ctx.ui?.notify?.(msg, "warning");
        return msg;
      }
      const deleted = manager.deleteProfile(target);
      const msg = deleted
        ? `Perfil "${target}" eliminado correctamente.`
        : `No se pudo eliminar el perfil "${target}".`;
      ctx.ui?.notify?.(msg, deleted ? "info" : "warning");
      return msg;
    },
  });

  // Keyboard shortcuts to open interactive selector
  // - alt+m: standard for Linux/Windows and macOS with Option as Meta key enabled
  // - ctrl+shift+m: universal shortcut (avoids 'µ' character issue on macOS terminal emulators)
  const openModalHandler = async (ctx: UiContext) => {
    const manager = getManager(ctx);
    const boundCtx: UiContext = {
      ...ctx,
      onProfileActivated: async (p) => {
        await syncActiveProfileToRuntime(p, ctx);
      },
    };
    await openProfilesModalOrFallback(manager, boundCtx);
  };

  pi.registerShortcut?.("alt+m", {
    description: "Abrir ventana flotante de perfiles SDD",
    handler: openModalHandler,
  });

  pi.registerShortcut?.("ctrl+shift+m", {
    description: "Abrir ventana flotante de perfiles SDD (alternativa macOS/universal)",
    handler: openModalHandler,
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
      execute: async (_toolCallId: string, _params: any, _signal: any, _onUpdate: any, ctx: any) => {
        const manager = getManager(ctx);
        const profiles = manager.listProfiles();
        const active = manager.getActiveProfileName();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ active_profile: active, profiles }, null, 2),
            },
          ],
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
      execute: async (
        _toolCallId: string,
        args: { profile_name: string; scope?: "global" | "project" },
        _signal: any,
        _onUpdate: any,
        ctx: any
      ) => {
        const manager = getManager(ctx);
        const res = manager.activateProfile(args.profile_name, args.scope ?? "global");
        if (res.success && res.profile) {
          await syncActiveProfileToRuntime(res.profile, ctx);
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: res.success,
                  message: res.message,
                  active_profile: args.profile_name,
                },
                null,
                2
              ),
            },
          ],
        };
      },
    });

    pi.registerTool({
      name: "sdd_profile_rename",
      description: "Rename an existing SDD and subagent model profile.",
      parameters: {
        type: "object",
        properties: {
          old_name: {
            type: "string",
            description: "The current name of the profile to rename.",
          },
          new_name: {
            type: "string",
            description: "The new name for the profile.",
          },
        },
        required: ["old_name", "new_name"],
      },
      execute: async (
        _toolCallId: string,
        args: { old_name: string; new_name: string },
        _signal: any,
        _onUpdate: any,
        ctx: any
      ) => {
        const manager = getManager(ctx);
        const res = manager.renameProfile(args.old_name, args.new_name);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(res, null, 2),
            },
          ],
        };
      },
    });

    pi.registerTool({
      name: "sdd_profile_delete",
      description: "Delete an existing SDD and subagent model profile.",
      parameters: {
        type: "object",
        properties: {
          profile_name: {
            type: "string",
            description: "The name of the profile to delete.",
          },
        },
        required: ["profile_name"],
      },
      execute: async (
        _toolCallId: string,
        args: { profile_name: string },
        _signal: any,
        _onUpdate: any,
        ctx: any
      ) => {
        const manager = getManager(ctx);
        const profile = manager.getProfile(args.profile_name);
        if (!profile) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { success: false, message: `Perfil "${args.profile_name}" no encontrado.` },
                  null,
                  2
                ),
              },
            ],
          };
        }
        const deleted = manager.deleteProfile(args.profile_name);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: deleted,
                  message: deleted
                    ? `Perfil "${args.profile_name}" eliminado.`
                    : `No se pudo eliminar "${args.profile_name}".`,
                },
                null,
                2
              ),
            },
          ],
        };
      },
    });
  }
}
