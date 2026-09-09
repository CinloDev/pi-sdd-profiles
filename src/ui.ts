import type { ModelProfileEntry, Profile, ProfileSummary, ReasoningEffort } from "./types.js";
import { ALL_KNOWN_AGENTS, SDD_AGENT_CATEGORIES } from "./catalog.js";
import type { SddProfileManager } from "./manager.js";
import { resolveAvailableModels } from "./models-resolver.js";

export interface UiContext {
  ui?: {
    select?: (title: string, options: string[]) => Promise<string | undefined>;
    input?: (prompt: string, placeholder?: string) => Promise<string | undefined>;
    notify?: (message: string, type: "info" | "warning" | "error") => void;
    confirm?: (title: string, message: string) => Promise<boolean>;
    setStatus?: (id: string, text?: string) => void;
  };
  cwd?: string;
  onProfileActivated?: (profile: Profile) => Promise<void> | void;
  [key: string]: unknown;
}

/**
 * Prompts user to select a model from discovered models or type manually.
 */
export async function promptModelSelection(
  ctx: UiContext,
  title: string,
  currentModel?: string
): Promise<string | undefined> {
  if (!ctx.ui?.select) return currentModel;

  const available = await resolveAvailableModels(ctx);
  const MANUAL_OPTION = "✏️ [Escribir ID manual...]";
  const options: string[] = [MANUAL_OPTION];

  if (currentModel) {
    options.push(`(Mantener actual: ${currentModel})`);
  }

  options.push(...available);

  const selected = await ctx.ui.select(title, options);
  if (!selected) return undefined;

  if (selected === MANUAL_OPTION) {
    const input = await ctx.ui.input?.("Ingresá el ID del modelo (provider/model):", currentModel ?? "");
    return input?.trim() || undefined;
  }

  if (selected.startsWith("(Mantener actual:")) {
    return currentModel;
  }

  return selected;
}

/**
 * Prompts user to select a reasoning effort level.
 * Returns:
 * - A valid ReasoningEffort if chosen
 * - "default" if user explicitly chose default/heredar
 * - undefined if user cancelled the selection dialog (Esc)
 */
export async function promptEffortSelection(
  ctx: UiContext,
  title: string,
  currentEffort?: ReasoningEffort
): Promise<ReasoningEffort | "default" | undefined> {
  if (!ctx.ui?.select) return currentEffort ?? "default";

  const options = [
    "default (heredar / sin forzar)",
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ];
  const selected = await ctx.ui.select(title, options);
  if (!selected) return undefined;
  if (selected.startsWith("default") || selected.startsWith("heredar")) {
    return "default";
  }
  return selected as ReasoningEffort;
}

/**
 * Formats the profile list for chat or terminal output.
 */
export function formatProfileList(profiles: ProfileSummary[], activeName: string | null): string {
  if (profiles.length === 0) {
    return "No hay perfiles disponibles.";
  }

  const lines: string[] = [
    "📦 **Perfiles SDD Disponibles:**\n",
  ];

  for (const p of profiles) {
    const activeBadge = p.is_active || (activeName && p.name.toLowerCase() === activeName.toLowerCase())
      ? " [ACTIVO] 🟢"
      : "";
    const scopeBadge = `(${p.scope})`;
    const defaultModel = p.default_model ? ` → ${p.default_model}` : "";
    const desc = p.description ? `\n   _${p.description}_` : "";

    lines.push(`- **${p.name}** ${scopeBadge}${activeBadge}${defaultModel} (${p.agent_count} agentes)${desc}`);
  }

  return lines.join("\n");
}

/**
 * Formats a detailed view of a profile by categories.
 */
export function formatProfileDetail(profile: Profile, isActive = false): string {
  const activeBadge = isActive ? " [ACTIVO] 🟢" : "";
  const lines: string[] = [
    `📋 **Perfil SDD: ${profile.name}**${activeBadge}`,
    profile.description ? `_${profile.description}_\n` : "",
    `• **Modelo por defecto:** ${profile.default_model ?? "No definido"}`,
    `• **Esfuerzo por defecto:** ${profile.default_effort ?? "No definido"}`,
    `• **Fecha de actualización:** ${profile.updated_at ?? profile.created_at ?? "N/A"}\n`,
    "### Asignación de Modelos por Categoría:",
  ];

  const assigned = profile.model_profiles || {};

  for (const category of SDD_AGENT_CATEGORIES) {
    lines.push(`\n**${category.name}** (${category.description}):`);
    let foundAny = false;
    for (const agent of category.agents) {
      if (assigned[agent]) {
        const item = assigned[agent];
        const effort = item.effort ? ` (effort: ${item.effort})` : "";
        lines.push(`  - \`${agent}\`: \`${item.model}\`${effort}`);
        foundAny = true;
      }
    }
    if (!foundAny) {
      lines.push(`  _(hereda modelo por defecto)_`);
    }
  }

  const knownSet = new Set(SDD_AGENT_CATEGORIES.flatMap((c) => c.agents));
  const otherAgents = Object.keys(assigned).filter((a) => !knownSet.has(a));
  if (otherAgents.length > 0) {
    lines.push(`\n**Otros Agentes:**`);
    for (const agent of otherAgents) {
      const item = assigned[agent];
      const effort = item.effort ? ` (effort: ${item.effort})` : "";
      lines.push(`  - \`${agent}\`: \`${item.model}\`${effort}`);
    }
  }

  return lines.join("\n");
}

/**
 * Interactive Profile Editor: allows tuning default model, categories, or individual agents.
 */
export async function runInteractiveProfileEdit(
  manager: SddProfileManager,
  ctx: UiContext,
  profileName: string
): Promise<string | undefined> {
  const profile = manager.getProfile(profileName);
  if (!profile) {
    const msg = `Perfil "${profileName}" no encontrado.`;
    ctx.ui?.notify?.(msg, "error");
    return msg;
  }

  let currentProfile: Profile = {
    ...profile,
    model_profiles: { ...profile.model_profiles },
  };

  while (true) {
    const menuOptions = [
      `🎯 Cambiar modelo por defecto [${currentProfile.default_model ?? "no definido"}]`,
      `🧠 Cambiar esfuerzo por defecto [${currentProfile.default_effort ?? "no definido"}]`,
      `🚀 Asignar un modelo a TODOS los agentes juntos`,
      `📦 Asignar modelo por Categoría (SDD Core, Judgment Day, etc.)`,
      `🔍 Asignar Agente por Agente`,
      `📋 Ver resumen actual`,
      `💾 Guardar y Salir`,
      `❌ Cancelar cambios`,
    ];

    const action = await ctx.ui?.select?.(`Editar Perfil: ${profileName}`, menuOptions);
    if (!action || action.startsWith("❌ Cancelar")) {
      ctx.ui?.notify?.("Edición cancelada.", "info");
      return "Edición cancelada.";
    }

    if (action.startsWith("💾 Guardar y Salir")) {
      const saveRes = manager.createProfile({
        name: currentProfile.name,
        description: currentProfile.description,
        default_model: currentProfile.default_model,
        default_effort: currentProfile.default_effort,
        model_profiles: currentProfile.model_profiles,
        scope: "global",
      });
      ctx.ui?.notify?.(`Perfil "${profileName}" actualizado correctamente.`, "info");
      return saveRes.message;
    }

    if (action.startsWith("📋 Ver resumen")) {
      const detail = formatProfileDetail(currentProfile);
      ctx.ui?.notify?.(detail, "info");
      continue;
    }

    if (action.startsWith("🎯 Cambiar modelo por defecto")) {
      const selectedModel = await promptModelSelection(ctx, "Seleccionar Modelo Principal:", currentProfile.default_model);
      if (selectedModel) {
        currentProfile.default_model = selectedModel;
      }
      continue;
    }

    if (action.startsWith("🧠 Cambiar esfuerzo por defecto")) {
      const selectedEffort = await promptEffortSelection(ctx, "Seleccionar Esfuerzo de Razonamiento:", currentProfile.default_effort);
      if (selectedEffort === "default") {
        delete currentProfile.default_effort;
        ctx.ui?.notify?.("Esfuerzo por defecto restablecido a default del proveedor.", "info");
      } else if (selectedEffort) {
        currentProfile.default_effort = selectedEffort;
        ctx.ui?.notify?.(`Esfuerzo por defecto cambiado a ${selectedEffort}.`, "info");
      }
      continue;
    }

    if (action.startsWith("🚀 Asignar un modelo a TODOS")) {
      const model = await promptModelSelection(ctx, "Elegir modelo para asignar a TODOS los agentes:");
      if (!model) continue;

      const effortRes = await promptEffortSelection(ctx, `Esfuerzo para todos los agentes con ${model}:`);
      const effort = effortRes === "default" ? undefined : effortRes;

      for (const agent of ALL_KNOWN_AGENTS) {
        currentProfile.model_profiles[agent] = {
          model,
          ...(effort ? { effort } : {}),
        };
      }
      ctx.ui?.notify?.(`Modelo ${model} asignado a todos los ${ALL_KNOWN_AGENTS.length} agentes.`, "info");
      continue;
    }

    if (action.startsWith("📦 Asignar modelo por Categoría")) {
      const catOptions = [
        ...SDD_AGENT_CATEGORIES.map((c) => `${c.name} (${c.agents.length} agentes)`),
        "⬅️ Volver",
      ];
      const selectedCatLabel = await ctx.ui?.select?.("Elegir Categoría a Configurar:", catOptions);
      if (!selectedCatLabel || selectedCatLabel.startsWith("⬅️")) continue;

      const cat = SDD_AGENT_CATEGORIES.find((c) => selectedCatLabel.startsWith(c.name));
      if (!cat) continue;

      // Special handling for Judgment Day if user wants cross arbitration
      if (cat.id === "judgment-day") {
        const jdSubChoice = await ctx.ui?.select?.("Configuración de Judgment Day:", [
          "🤝 Asignar el mismo modelo a todo Judgment Day",
          "⚖️ Arbitraje Cruzado (Elegir Juez A y Juez B por separado)",
        ]);

        if (jdSubChoice?.includes("Arbitraje Cruzado")) {
          const modelA = await promptModelSelection(ctx, "Elegir modelo para Juez A (jd-judge-a):");
          const effortResA = await promptEffortSelection(ctx, "Esfuerzo para Juez A:");
          const effortA = effortResA === "default" ? undefined : effortResA;
          if (modelA) currentProfile.model_profiles["jd-judge-a"] = { model: modelA, ...(effortA ? { effort: effortA } : {}) };

          const modelB = await promptModelSelection(ctx, "Elegir modelo para Juez B (jd-judge-b):");
          const effortResB = await promptEffortSelection(ctx, "Esfuerzo para Juez B:");
          const effortB = effortResB === "default" ? undefined : effortResB;
          if (modelB) currentProfile.model_profiles["jd-judge-b"] = { model: modelB, ...(effortB ? { effort: effortB } : {}) };

          const modelFix = await promptModelSelection(ctx, "Elegir modelo para Fix Agent (jd-fix-agent):");
          const effortResFix = await promptEffortSelection(ctx, "Esfuerzo para Fix Agent:");
          const effortFix = effortResFix === "default" ? undefined : effortResFix;
          if (modelFix) currentProfile.model_profiles["jd-fix-agent"] = { model: modelFix, ...(effortFix ? { effort: effortFix } : {}) };

          ctx.ui?.notify?.("Arbitraje cruzado de Judgment Day configurado.", "info");
          continue;
        }
      }

      const model = await promptModelSelection(ctx, `Elegir modelo para ${cat.name}:`);
      if (!model) continue;

      const effortRes = await promptEffortSelection(ctx, `Esfuerzo para ${cat.name}:`);
      const effort = effortRes === "default" ? undefined : effortRes;

      for (const agent of cat.agents) {
        currentProfile.model_profiles[agent] = {
          model,
          ...(effort ? { effort } : {}),
        };
      }
      ctx.ui?.notify?.(`Categoría "${cat.name}" actualizada con ${model}.`, "info");
      continue;
    }

    if (action.startsWith("🔍 Asignar Agente por Agente")) {
      const agentOptions = [
        ...ALL_KNOWN_AGENTS.map((a) => {
          const current = currentProfile.model_profiles[a];
          const desc = current ? `[${current.model}${current.effort ? ` : ${current.effort}` : ""}]` : "[hereda default]";
          return `${a} ${desc}`;
        }),
        "⬅️ Volver",
      ];

      const agentSelection = await ctx.ui?.select?.("Elegir Agente a Configurar:", agentOptions);
      if (!agentSelection || agentSelection.startsWith("⬅️")) continue;

      const agentName = agentSelection.split(" ")[0];
      const current = currentProfile.model_profiles[agentName];

      const model = await promptModelSelection(ctx, `Elegir modelo para ${agentName}:`, current?.model);
      if (!model) continue;

      const effortRes = await promptEffortSelection(ctx, `Esfuerzo para ${agentName}:`, current?.effort);
      let effort: ReasoningEffort | undefined;
      if (effortRes === "default") {
        effort = undefined;
      } else if (effortRes !== undefined) {
        effort = effortRes;
      } else {
        effort = current?.effort;
      }

      currentProfile.model_profiles[agentName] = {
        model,
        ...(effort ? { effort } : {}),
      };
      ctx.ui?.notify?.(`Agente "${agentName}" asignado a ${model}.`, "info");
      continue;
    }
  }
}

/**
 * Interactive creation wizard using dropdown model selection and category assignment.
 */
export async function runInteractiveProfileCreate(
  manager: SddProfileManager,
  ctx: UiContext
): Promise<string | undefined> {
  if (!ctx.ui?.input || !ctx.ui?.select) {
    const msg = "Creación interactiva requiere soporte de entrada de terminal. Usá `/sdd-profile create <nombre>`.";
    ctx.ui?.notify?.(msg, "warning");
    return msg;
  }

  const rawName = await ctx.ui.input("Nombre del nuevo perfil (ej. mi-setup):", "mi-setup");
  const name = rawName?.trim();
  if (!name) {
    ctx.ui.notify?.("Creación de perfil cancelada.", "info");
    return undefined;
  }

  const desc = await ctx.ui.input("Descripción breve (opcional):", "Modelos optimizados para...");

  // Select Default Base Model from dropdown
  const defaultModel = await promptModelSelection(ctx, "Elegir Modelo Principal / Base:");
  if (!defaultModel) {
    ctx.ui.notify?.("Creación de perfil cancelada.", "info");
    return undefined;
  }

  const defaultEffortRes = await promptEffortSelection(ctx, "Esfuerzo de razonamiento por defecto:");
  const defaultEffort = defaultEffortRes === "default" ? undefined : defaultEffortRes;

  const modelProfiles: Record<string, ModelProfileEntry> = {};

  // Choose assignment strategy
  const strategy = await ctx.ui.select("¿Cómo deseas asignar los modelos a los agentes?", [
    `🚀 Aplicar "${defaultModel}" a todos los agentes (rápido)`,
    "🎯 Configurar por Categoría (SDD Core, Judgment Day, Revisores)",
    "🔍 Personalizar Agente por Agente",
    "💾 Guardar solo modelo base (agentes heredan el default)",
  ]);

  if (strategy?.startsWith("🚀 Aplicar")) {
    for (const agent of ALL_KNOWN_AGENTS) {
      modelProfiles[agent] = {
        model: defaultModel,
        ...(defaultEffort ? { effort: defaultEffort } : {}),
      };
    }
  } else if (strategy?.startsWith("🎯 Configurar por Categoría") || strategy?.startsWith("🔍 Personalizar")) {
    // Create draft profile and open full editor
    const draftProfile: Profile = {
      name,
      description: desc?.trim() || undefined,
      default_model: defaultModel,
      default_effort: defaultEffort,
      model_profiles: modelProfiles,
    };
    manager.createProfile(draftProfile);
    await runInteractiveProfileEdit(manager, ctx, name);

    // Offer to activate immediately
    if (ctx.ui.confirm) {
      const activate = await ctx.ui.confirm("Activar perfil", `¿Deseas activar el perfil "${name}" ahora?`);
      if (activate) {
        const actRes = manager.activateProfile(name, "global");
        if (actRes.success && actRes.profile && ctx.onProfileActivated) {
          await ctx.onProfileActivated(actRes.profile);
        }
        ctx.ui.notify?.(actRes.message, actRes.success ? "info" : "error");
      }
    }
    return `Perfil "${name}" creado exitosamente.`;
  }

  const createRes = manager.createProfile({
    name,
    description: desc?.trim() || undefined,
    default_model: defaultModel,
    default_effort: defaultEffort,
    model_profiles: modelProfiles,
    scope: "global",
  });

  if (!createRes.success) {
    ctx.ui.notify?.(createRes.message, "error");
    return createRes.message;
  }

  ctx.ui.notify?.(`Perfil "${name}" creado exitosamente.`, "info");

  // Offer to activate immediately
  if (ctx.ui.confirm) {
    const activate = await ctx.ui.confirm("Activar perfil", `¿Deseas activar el perfil "${name}" ahora?`);
    if (activate) {
      const actRes = manager.activateProfile(name, "global");
      if (actRes.success && actRes.profile && ctx.onProfileActivated) {
        await ctx.onProfileActivated(actRes.profile);
      }
      ctx.ui.notify?.(actRes.message, actRes.success ? "info" : "error");
    }
  }

  return createRes.message;
}

/**
 * Interactive selector workflow using ctx.ui.select.
 */
export async function runInteractiveProfileSelect(
  manager: SddProfileManager,
  ctx: UiContext
): Promise<string | undefined> {
  const profiles = manager.listProfiles();
  const activeName = manager.getActiveProfileName();

  if (!ctx.ui?.select) {
    return formatProfileList(profiles, activeName);
  }

  const CREATE_ACTION = "➕ [Crear nuevo perfil...]";
  const EDIT_ACTION = "✏️ [Editar modelos de un perfil...]";
  const RENAME_ACTION = "📝 [Renombrar un perfil...]";
  const DELETE_ACTION = "🗑️ [Eliminar un perfil...]";

  // Build options for select
  const options = [
    CREATE_ACTION,
    EDIT_ACTION,
    RENAME_ACTION,
    DELETE_ACTION,
    ...profiles.map((p) => {
      const activeMark = p.is_active || (activeName && p.name.toLowerCase() === activeName.toLowerCase()) ? "● " : "○ ";
      const model = p.default_model ? ` (${p.default_model})` : "";
      return `${activeMark}${p.name} [${p.scope}]${model}`;
    }),
  ];

  const selectedOption = await ctx.ui.select("Seleccionar Perfil SDD", options);
  if (!selectedOption) return undefined;

  if (selectedOption === CREATE_ACTION) {
    return runInteractiveProfileCreate(manager, ctx);
  }

  if (selectedOption === EDIT_ACTION) {
    const editChoices = profiles.map((p) => p.name);
    const chosen = await ctx.ui.select("Elegir perfil a editar:", editChoices);
    if (!chosen) return undefined;
    return runInteractiveProfileEdit(manager, ctx, chosen);
  }

  if (selectedOption === RENAME_ACTION) {
    const choices = profiles.map((p) => p.name);
    if (choices.length === 0) {
      ctx.ui.notify?.("No hay perfiles para renombrar.", "warning");
      return undefined;
    }
    const chosen = await ctx.ui.select("Elegir perfil a renombrar:", choices);
    if (!chosen) return undefined;

    const newName = await ctx.ui.input?.(`Nuevo nombre para "${chosen}":`, chosen);
    if (!newName || !newName.trim()) {
      ctx.ui.notify?.("Renombramiento cancelado.", "info");
      return undefined;
    }
    const res = manager.renameProfile(chosen, newName.trim());
    ctx.ui.notify?.(res.message, res.success ? "info" : "warning");
    return res.message;
  }

  if (selectedOption === DELETE_ACTION) {
    const choices = profiles.map((p) => p.name);
    if (choices.length === 0) {
      ctx.ui.notify?.("No hay perfiles para eliminar.", "warning");
      return undefined;
    }
    const chosen = await ctx.ui.select("Elegir perfil a eliminar:", choices);
    if (!chosen) return undefined;

    if (ctx.ui.confirm) {
      const confirmed = await ctx.ui.confirm("Eliminar Perfil", `¿Seguro que querés eliminar el perfil "${chosen}"?`);
      if (!confirmed) {
        ctx.ui.notify?.("Eliminación cancelada.", "info");
        return undefined;
      }
    }
    const deleted = manager.deleteProfile(chosen);
    const msg = deleted ? `Perfil "${chosen}" eliminado.` : `No se pudo eliminar el perfil "${chosen}".`;
    ctx.ui.notify?.(msg, deleted ? "info" : "warning");
    return msg;
  }

  // Extract profile name from the selected option string
  const match = selectedOption.match(/^[●○]\s*([a-zA-Z0-9_-]+)/);
  if (!match) return undefined;

  const profileName = match[1];
  const result = manager.activateProfile(profileName);

  if (result.success) {
    if (result.profile && ctx.onProfileActivated) {
      await ctx.onProfileActivated(result.profile);
    }
    ctx.ui.notify?.(`Perfil SDD activado: ${profileName}`, "info");
  } else {
    ctx.ui.notify?.(result.message, "error");
  }

  return result.message;
}
