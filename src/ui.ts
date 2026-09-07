import type { Profile, ProfileSummary } from "./types.js";
import { SDD_AGENT_CATEGORIES } from "./catalog.js";
import type { SddProfileManager } from "./manager.js";

export interface UiContext {
  ui?: {
    select?: (title: string, options: string[]) => Promise<string | undefined>;
    input?: (prompt: string, placeholder?: string) => Promise<string | undefined>;
    notify?: (message: string, type: "info" | "warning" | "error") => void;
    confirm?: (title: string, message: string) => Promise<boolean>;
  };
  cwd?: string;
  [key: string]: unknown;
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

  // Any other agents not in predefined categories
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
 * Interactive creation wizard using ctx.ui.input and ctx.ui.select.
 */
export async function runInteractiveProfileCreate(
  manager: SddProfileManager,
  ctx: UiContext
): Promise<string | undefined> {
  if (!ctx.ui?.input) {
    const msg = "Creación interactiva requiere soporte de entrada de terminal (ctx.ui.input). Usá `/sdd-profile create <nombre>`.";
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

  const defaultModel = await ctx.ui.input(
    "Modelo principal / por defecto (ej. provider/model):",
    "anthropic/claude-sonnet-4-5"
  );

  let effort: any = undefined;
  if (ctx.ui?.select) {
    const selectedEffort = await ctx.ui.select("Esfuerzo de razonamiento por defecto:", [
      "medium",
      "high",
      "max",
      "low",
      "off",
    ]);
    if (selectedEffort) effort = selectedEffort;
  }

  const createRes = manager.createProfile({
    name,
    description: desc?.trim() || undefined,
    default_model: defaultModel?.trim() || undefined,
    default_effort: effort,
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

  // Build options for select
  const options = [
    CREATE_ACTION,
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

  // Extract profile name from the selected option string
  const match = selectedOption.match(/^[●○]\s*([a-zA-Z0-9_-]+)/);
  if (!match) return undefined;

  const profileName = match[1];
  const result = manager.activateProfile(profileName);

  if (result.success) {
    ctx.ui.notify?.(`Perfil SDD activado: ${profileName}`, "info");
  } else {
    ctx.ui.notify?.(result.message, "error");
  }

  return result.message;
}
