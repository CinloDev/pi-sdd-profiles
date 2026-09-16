import type { ModelProfileEntry, Profile, ProfileSummary, ReasoningEffort } from "./types.js";
import type { TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import { ALL_KNOWN_AGENTS, SDD_AGENT_CATEGORIES } from "./catalog.js";
import type { SddProfileManager } from "./manager.js";
import {
  constrainLines,
  frameModal,
  normalizeModalKey,
  padToVisibleWidth,
  visibleWidth,
} from "./modal-formatting.js";

export type ModalView =
  | "profiles-list"
  | "choose-scope"
  | "create-profile"
  | "rename-profile"
  | "confirm-delete"
  | "profile-editor"
  | "model-picker"
  | "effort-picker"
  | "category-picker";

export interface ModalInput {
  manager: SddProfileManager;
  availableModels: string[];
  theme?: any;
  tui?: { requestRender?: () => void };
  onProfileActivated?: (profile: Profile) => Promise<void> | void;
  done: (result?: { action: "activated" | "saved" | "closed"; profileName?: string }) => void;
}

export const ORCHESTRATOR_AGENT_KEY = "👑 Orquestador (Sesión Principal)";
export const ASSIGN_ALL_SUBAGENTS_KEY = "⚡ [Asignar un mismo modelo a TODOS los subagentes...]";
export const ASSIGN_ALL_EFFORT_KEY = "🧠 [Asignar un mismo nivel de esfuerzo a TODOS los subagentes...]";
export const ASSIGN_CATEGORY_KEY = "📦 [Asignar modelo por Categoría...]";

export const EFFORT_OPTIONS: Array<ReasoningEffort | "default"> = [
  "default",
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export function createSddProfilesModal(input: ModalInput) {
  const { manager, theme, tui, done, onProfileActivated } = input;
  const availableModels = input.availableModels;

  let view: ModalView = "profiles-list";
  let profiles: ProfileSummary[] = manager.listProfiles();
  let activeProfileName = manager.getActiveProfileName();

  // Navigation state for profiles-list
  let selectedProfileIndex = 0;
  let profileScrollOffset = 0;

  // State for choose scope view
  let activatingProfile: ProfileSummary | null = null;
  let chooseScopeIndex = 0; // 0 = project, 1 = global

  // State for new profile creation view
  let newProfileInput = "";

  // State for rename and delete confirmation views
  let renamingOldName = "";
  let renameProfileInput = "";
  let renameErrorMessage: string | null = null;
  let deletingProfileName = "";

  // Editing state for profile-editor
  let editingProfile: Profile | null = null;
  let editingAgentsList: string[] = [
    ORCHESTRATOR_AGENT_KEY,
    ASSIGN_ALL_SUBAGENTS_KEY,
    ASSIGN_ALL_EFFORT_KEY,
    ASSIGN_CATEGORY_KEY,
    ...ALL_KNOWN_AGENTS,
  ];
  let selectedAgentIndex = 0;
  let agentScrollOffset = 0;
  let isDirty = false;

  // Picker state (for model-picker / effort-picker / category-picker)
  let pickerItems: string[] = [];
  let pickerIndex = 0;
  let pickerScrollOffset = 0;
  let pickerTarget: "default-model" | "agent-model" | "all-models" | "category-models" = "agent-model";
  let targetCategory: string | undefined = undefined;
  let stagedModel: string | undefined = undefined;

  // Feedback and model search filter state
  let feedbackMessage: string | null = null;
  let modelFilter = "";
  let allPickerModels: string[] = [];

  const applyModelFilter = () => {
    const query = modelFilter.trim().toLowerCase();
    if (!query) {
      pickerItems = [...allPickerModels];
    } else {
      const tokens = query.split(/\s+/).filter(Boolean);
      pickerItems = allPickerModels.filter((model) => {
        const lower = model.toLowerCase();
        return tokens.every((token) => lower.includes(token));
      });
    }
    pickerIndex = 0;
    pickerScrollOffset = 0;
  };

  const openModelPicker = (
    target: "default-model" | "agent-model" | "all-models" | "category-models",
    category?: string,
  ) => {
    pickerTarget = target;
    targetCategory = category;
    allPickerModels = [...availableModels];
    modelFilter = "";
    applyModelFilter();
    view = "model-picker";
  };

  const requestRender = () => tui?.requestRender?.();

  const refreshProfiles = () => {
    profiles = manager.listProfiles();
    activeProfileName = manager.getActiveProfileName();
    if (selectedProfileIndex >= profiles.length) {
      selectedProfileIndex = Math.max(0, profiles.length - 1);
    }
  };

  const selectedProfile = (): ProfileSummary | undefined => {
    return profiles[selectedProfileIndex];
  };

  const selectedAgent = (): string => {
    return editingAgentsList[selectedAgentIndex] ?? editingAgentsList[0];
  };

  const executeActivation = (scope: "project" | "global") => {
    if (!activatingProfile) return;
    const targetName = activatingProfile.name;
    const res = manager.activateProfile(targetName, scope);
    if (res.success && res.profile) {
      onProfileActivated?.(res.profile);
      refreshProfiles();
      const scopeLabel = scope === "project" ? "en este proyecto" : "globalmente";
      feedbackMessage = `Perfil "${targetName}" activado ${scopeLabel} con éxito. Podés seguir configurando o presionar [Esc] para cerrar.`;
    } else {
      feedbackMessage = `Error al activar perfil: ${res.message ?? "desconocido"}`;
    }
    view = "profiles-list";
    activatingProfile = null;
  };

  // Clamp selection helper
  const clampList = (index: number, scroll: number, total: number, maxVisible: number) => {
    const newIndex = Math.min(Math.max(index, 0), Math.max(0, total - 1));
    let newScroll = scroll;
    if (newIndex < newScroll) newScroll = newIndex;
    if (newIndex >= newScroll + maxVisible) newScroll = newIndex - maxVisible + 1;
    newScroll = Math.max(0, Math.min(newScroll, Math.max(0, total - 1)));
    return { index: newIndex, scroll: newScroll };
  };

  // Safe tone helpers bound to Pi's theme tokens with graceful fallbacks
  const safeFg = (color: string, text: string, fallback = "text"): string => {
    if (!theme?.fg) return text;
    try {
      return theme.fg(color, text);
    } catch {
      try {
        return theme.fg(fallback, text);
      } catch {
        return text;
      }
    }
  };

  // Palette mapping:
  // - Heading / Labels: mdHeading (warm gold #E0C27A in Cinlodev CUTE, amber in default)
  // - Primary Accent / Active selection: accent (pastel pink #F095C8 in CUTE, primary in default)
  // - Highlight / Focus: borderAccent (bright pink #FFB1DD in CUTE)
  // - Models / Functions: syntaxFunction (pastel sky blue #A9C7EE in CUTE, cyan in default)
  // - Success / Active status: success (mint green #B4E7C7 in CUTE, green in default)
  // - Warning / Alerts / Project scope: warning (amber orange #F2B86D in CUTE, yellow in default)
  // - Errors: error (coral red #FF718F in CUTE, red in default)
  // - Primary text / Actions: text (crisp light cream #F6EFF3 in CUTE)
  // - Secondary text / Category counts: secondary (soft rose #D7A0B8 in CUTE)
  // - Borders / Dividers: borderMuted (purple #5c2c74 in CUTE) or border (purple #8e44ad in CUTE)
  // - Hints: muted (dusty rose)
  // - Inactive / Dim: dim
  const cHeading = (t: string) => safeFg("mdHeading", t, "accent");
  const cAccent = (t: string) => safeFg("accent", t, "text");
  const cHighlight = (t: string) => safeFg("borderAccent", t, "accent");
  const cModel = (t: string) => safeFg("syntaxFunction", t, "accent");
  const cSuccess = (t: string) => safeFg("success", t, "accent");
  const cWarning = (t: string) => safeFg("warning", t, "accent");
  const cError = (t: string) => safeFg("error", t, "accent");
  const cText = (t: string) => safeFg("text", t, "text");
  const cSecondary = (t: string) => safeFg("secondary", t, "text");
  const cBorder = (t: string) => safeFg("border", t, "text");
  const cBorderMuted = (t: string) => safeFg("borderMuted", t, "border");
  const cMuted = (t: string) => safeFg("muted", t, "text");
  const cDim = (t: string) => safeFg("dim", t, "muted");
  const cBold = (t: string) => (theme?.bold ? theme.bold(t) : `\x1b[1m${t}\x1b[22m`);

  const formatShortcut = (key: string, action: string): string => {
    return `${cAccent(key)} ${cText(action)}`;
  };

  interface ClickTarget {
    y: number;
    type: "item" | "action";
    index?: number;
    key?: string;
    xStart?: number;
    xEnd?: number;
  }

  interface ShortcutDef {
    keyTag: string;
    label: string;
    key?: string;
  }

  let clickTargets: ClickTarget[] = [];
  let currentBodyStartY = 2;

  const registerItemTarget = (bodyLineIndex: number, itemIndex: number) => {
    clickTargets.push({
      y: currentBodyStartY + bodyLineIndex,
      type: "item",
      index: itemIndex,
    });
  };

  const registerShortcutTarget = (
    bodyLineIndex: number,
    key: string,
    xStart: number,
    xEnd: number
  ) => {
    clickTargets.push({
      y: currentBodyStartY + bodyLineIndex,
      type: "action",
      key,
      xStart,
      xEnd,
    });
  };

  const buildShortcutsLine = (
    bodyLineIndex: number,
    shortcuts: ShortcutDef[],
    width: number
  ): string => {
    const contentStartX = width < 30 ? 0 : 3;
    let currentX = contentStartX;
    const separator = " · ";
    const sepWidth = visibleWidth(separator);
    const parts: string[] = [];

    for (let i = 0; i < shortcuts.length; i++) {
      const s = shortcuts[i];
      const itemFormatted = formatShortcut(s.keyTag, s.label);
      const itemVisibleWidth = visibleWidth(`${s.keyTag} ${s.label}`);

      if (s.key) {
        registerShortcutTarget(bodyLineIndex, s.key, currentX, currentX + itemVisibleWidth);
      }
      parts.push(itemFormatted);
      currentX += itemVisibleWidth + sepWidth;
    }

    return parts.join(cBorderMuted(separator));
  };

  // View: Profiles List
  const renderProfilesList = (width: number): string[] => {
    const maxVisible = 10;
    const clamped = clampList(selectedProfileIndex, profileScrollOffset, profiles.length, maxVisible);
    selectedProfileIndex = clamped.index;
    profileScrollOffset = clamped.scroll;

    const visibleProfiles = profiles.slice(profileScrollOffset, profileScrollOffset + maxVisible);

    const activeProfileObj = activeProfileName ? manager.getProfile(activeProfileName) : null;
    const activeScope = typeof manager.getActiveScope === "function" ? manager.getActiveScope() : null;
    const activeScopeBadge = activeScope === "project" ? cWarning(" (proyecto)") : activeScope === "global" ? cMuted(" (global)") : "";
    const activeOrchestrator = activeProfileObj?.default_model
      ? ` ${cBorderMuted("·")} ${cHeading("Orquestador:")} ${cModel(activeProfileObj.default_model)}`
      : "";

    const isWarningFeedback = feedbackMessage && (
      feedbackMessage.includes("Error") ||
      feedbackMessage.includes("no se puede") ||
      feedbackMessage.includes("No se puede") ||
      feedbackMessage.includes("integrados") ||
      feedbackMessage.includes("vacío") ||
      feedbackMessage.includes("Ya existe")
    );

    const isNarrow = width < 86;
    const shortcutDefs: ShortcutDef[] = [
      { keyTag: "[Enter]", label: "Activar", key: "\r" },
      { keyTag: "[e]", label: isNarrow ? "Edit" : "Editar", key: "e" },
      { keyTag: "[r]", label: isNarrow ? "Renom" : "Renombrar", key: "r" },
      { keyTag: "[n]", label: "Nuevo", key: "n" },
      { keyTag: "[d]", label: "Borrar", key: "d" },
      { keyTag: "[Esc]", label: "Salir", key: "\u001b" },
    ];

    const shortcutsLineIndex = 1 + (feedbackMessage ? 1 : 0);
    const shortcuts = buildShortcutsLine(shortcutsLineIndex, shortcutDefs, width);

    const header = [
      `${cHeading("Estado:")} ${cText("Perfil activo")} → ${activeProfileName ? cSuccess(`● ${activeProfileName}`) + activeScopeBadge : cDim("(ninguno)")}${activeOrchestrator}`,
      ...(feedbackMessage
        ? [isWarningFeedback
            ? cWarning(`⚠️ ${feedbackMessage}`)
            : cSuccess(`✔ ${feedbackMessage}`)]
        : []),
      shortcuts,
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const listStartIndex = header.length;
    const listLines: string[] = [];
    if (profiles.length === 0) {
      listLines.push(cMuted("No hay perfiles disponibles. Presioná 'n' para crear uno nuevo."));
    } else {
      for (const [offset, p] of visibleProfiles.entries()) {
        const idx = profileScrollOffset + offset;
        registerItemTarget(listStartIndex + offset, idx);
        const isSelected = idx === selectedProfileIndex;
        const cursor = isSelected ? cHighlight("› ") : "  ";
        const isActive = p.is_active || (activeProfileName && p.name.toLowerCase() === activeProfileName.toLowerCase());
        const activeMarker = isActive
          ? cSuccess("● ")
          : cDim("○ ");

        const activeScopeNote = (isActive && p.active_scope)
          ? (p.active_scope === "project" ? cSuccess(" (activo en proyecto)") : cMuted(" (activo global)"))
          : "";

        const scopeTag = p.scope === "project" ? cWarning(" [proyecto]") : "";
        const modelStr = p.default_model ? ` ${cBorderMuted("·")} ${cMuted("Orquestador:")} ${cModel(p.default_model)}` : "";
        const agentCount = ` ${cBorderMuted("·")} ${cHeading(String(p.agent_count))} ${cSecondary("subagentes")}`;

        const nameFormatted = isSelected ? cBold(cAccent(p.name)) : cText(p.name);
        const line = `${cursor}${activeMarker}${nameFormatted}${activeScopeNote}${scopeTag}${modelStr}${agentCount}`;
        listLines.push(line);
      }
    }

    const currentP = selectedProfile();
    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      currentP?.description
        ? `${cHeading("Descripción:")} ${cText(currentP.description)}`
        : `${cHeading("Perfil:")} ${cAccent(currentP?.name ?? "ninguno")}`,
    ];

    return frameModal("🤖 SDD Profile Manager · De y para la Comunidad", [...header, ...listLines, ...footer], width, theme);
  };

  // View: Create Profile
  const renderCreateProfile = (width: number): string[] => {
    const header = [
      cHeading("Crear un nuevo perfil de modelos SDD y Orquestador:"),
      cText("Escribí el nombre del nuevo perfil y presioná [Enter] para continuar al editor."),
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const inputLine = `  ${cHeading("Nombre:")} ${cAccent(newProfileInput || "...")}${cHighlight("█")}`;

    const shortcuts = buildShortcutsLine(7, [
      { keyTag: "[Enter]", label: "Crear y Configurar", key: "\r" },
      { keyTag: "[Esc]", label: "Cancelar", key: "\u001b" },
    ], width);

    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      shortcuts,
    ];

    return frameModal("➕ Nuevo Perfil SDD", [...header, "", inputLine, "", ...footer], width, theme);
  };

  // View: Rename Profile
  const renderRenameProfile = (width: number): string[] => {
    const header = [
      `${cHeading("Renombrar perfil:")} ${cAccent(renamingOldName)}`,
      cText("Escribí el nuevo nombre y presioná [Enter] para guardar."),
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const inputLine = `  ${cHeading("Nuevo nombre:")} ${cAccent(renameProfileInput || "...")}${cHighlight("█")}`;
    const errorLine = renameErrorMessage ? cError(`  ✖ ${renameErrorMessage}`) : "";

    const shortcuts = buildShortcutsLine(7, [
      { keyTag: "[Enter]", label: "Guardar Nombre", key: "\r" },
      { keyTag: "[Esc]", label: "Cancelar", key: "\u001b" },
    ], width);

    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      shortcuts,
    ];

    return frameModal("✏️ Renombrar Perfil SDD", [...header, "", inputLine, errorLine, ...footer], width, theme);
  };

  // View: Confirm Delete Profile
  const renderConfirmDelete = (width: number): string[] => {
    const header = [
      cWarning("⚠️ ¿Estás segura de que querés eliminar este perfil?"),
      `${cHeading("Perfil a borrar:")} ${cAccent(deletingProfileName)}`,
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const warningBody = [
      "",
      cText("  Esta acción eliminará el archivo del perfil permanentemente de disco."),
      "",
    ];

    const shortcuts = buildShortcutsLine(7, [
      { keyTag: "[Enter / y]", label: "Confirmar Eliminación", key: "\r" },
      { keyTag: "[Esc / n]", label: "Cancelar", key: "\u001b" },
    ], width);

    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      shortcuts,
    ];

    return frameModal("🗑️ Confirmar Eliminación", [...header, ...warningBody, ...footer], width, theme);
  };

  // View: Choose Scope
  const renderChooseScope = (width: number): string[] => {
    if (!activatingProfile) return ["Error: perfil no seleccionado"];

    const shortcuts = buildShortcutsLine(3, [
      { keyTag: "[1 / p]", label: "Proyecto", key: "1" },
      { keyTag: "[2 / g]", label: "Global", key: "2" },
      { keyTag: "[Enter]", label: "Confirmar", key: "\r" },
      { keyTag: "[Esc]", label: "Cancelar", key: "\u001b" },
    ], width);

    const header = [
      `${cHeading("Activar perfil:")} ${cBold(cAccent(activatingProfile.name))}`,
      cText("¿Dónde querés activar este perfil de modelos?"),
      shortcuts,
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const scopeOptions = [
      {
        num: "[1]",
        title: "Solo en este proyecto",
        badge: "(Local)",
        desc: "Aísla la configuración en .pi/subagents.json para este repositorio.",
      },
      {
        num: "[2]",
        title: "Global para toda la máquina",
        badge: "(Global)",
        desc: "Aplica en ~/.pi/agent/subagents.json para todos tus proyectos.",
      },
    ];

    const listLines: string[] = [""];
    const baseOffset = header.length + 1;
    for (const [idx, opt] of scopeOptions.entries()) {
      registerItemTarget(baseOffset + idx * 2, idx);
      const isSelected = idx === chooseScopeIndex;
      const cursor = isSelected ? cHighlight("› ") : "  ";
      const numLabel = cHeading(opt.num + " ");
      const titleLabel = isSelected ? cBold(cAccent(opt.title)) : cText(opt.title);
      const badgeLabel = ` ${cWarning(opt.badge)}`;
      const descLabel = `    ${cSecondary(opt.desc)}`;
      listLines.push(`${cursor}${numLabel}${titleLabel}${badgeLabel}`);
      listLines.push(descLabel);
    }
    listLines.push("");

    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      cMuted("Presioná [1] o [2] para activar directo, o flechas [↑/↓] + [Enter]"),
    ];

    return frameModal("🚀 Seleccionar Alcance de Activación", [...header, ...listLines, ...footer], width, theme);
  };

  // View: Profile Editor
  const renderProfileEditor = (width: number): string[] => {
    if (!editingProfile) return ["Error: perfil no cargado"];

    const maxVisible = 10;
    const clamped = clampList(selectedAgentIndex, agentScrollOffset, editingAgentsList.length, maxVisible);
    selectedAgentIndex = clamped.index;
    agentScrollOffset = clamped.scroll;

    const visibleAgents = editingAgentsList.slice(agentScrollOffset, agentScrollOffset + maxVisible);

    const dirtyIndicator = isDirty ? cWarning(" (cambios sin guardar*)") : "";

    const shortcuts = buildShortcutsLine(1, [
      { keyTag: "[Enter/m]", label: "Modelo", key: "\r" },
      { keyTag: "[e]", label: "Esfuerzo", key: "e" },
      { keyTag: "[a]", label: "A todos", key: "a" },
      { keyTag: "[c]", label: "Categoría", key: "c" },
      { keyTag: "[s]", label: "Guardar", key: "s" },
      { keyTag: "[Esc]", label: "Volver", key: "\u001b" },
    ], width);

    const header = [
      `${cHeading("Perfil:")} ${cAccent(editingProfile.name)}${dirtyIndicator} ${cBorderMuted("│")} ${cHeading("Orquestador:")} ${cModel(editingProfile.default_model ?? "default")} ${cAccent(`(${editingProfile.default_effort ?? "medium"})`)}`,
      shortcuts,
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const listLines: string[] = [];
    for (const [offset, agentName] of visibleAgents.entries()) {
      const idx = agentScrollOffset + offset;
      registerItemTarget(header.length + offset, idx);
      const isSelected = idx === selectedAgentIndex;
      const cursor = isSelected ? cHighlight("› ") : "  ";

      if (agentName === ORCHESTRATOR_AGENT_KEY) {
        const modelLabel = editingProfile.default_model ? cModel(editingProfile.default_model) : cDim("(no definido)");
        const effortLabel = editingProfile.default_effort ? cAccent(`[${editingProfile.default_effort}]`) : cDim("[default]");
        const nameFormatted = isSelected ? cBold(cAccent(agentName)) : cHeading(agentName);
        const line = `${cursor}${nameFormatted} ${cBorderMuted("→")} ${modelLabel} ${effortLabel}`;
        listLines.push(line);
      } else if (
        agentName === ASSIGN_ALL_SUBAGENTS_KEY ||
        agentName === ASSIGN_ALL_EFFORT_KEY ||
        agentName === ASSIGN_CATEGORY_KEY
      ) {
        const line = `${cursor}${isSelected ? cBold(cHighlight(agentName)) : cWarning(agentName)}`;
        listLines.push(line);
      } else {
        const assignment = editingProfile.model_profiles[agentName];
        const modelLabel = assignment?.model
          ? cModel(assignment.model)
          : `${cMuted("hereda:")} ${cModel(editingProfile.default_model ?? "default")}`;
        const effortLabel = assignment?.effort
          ? cAccent(`[${assignment.effort}]`)
          : cDim(`[${editingProfile.default_effort ?? "default"}]`);
        const nameFormatted = isSelected ? cBold(cAccent(agentName)) : cText(agentName);
        const line = `${cursor}${nameFormatted} ${cBorderMuted("→")} ${modelLabel} ${effortLabel}`;
        listLines.push(line);
      }
    }

    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      `${cHeading("Seleccionado:")} ${cAccent(selectedAgent())}`,
    ];

    return frameModal(`✏️ Editar Perfil: ${editingProfile.name}`, [...header, ...listLines, ...footer], width, theme);
  };

  // View: Model Picker
  const renderModelPicker = (width: number): string[] => {
    const maxVisible = 10;
    const clamped = clampList(pickerIndex, pickerScrollOffset, pickerItems.length, maxVisible);
    pickerIndex = clamped.index;
    pickerScrollOffset = clamped.scroll;

    const visibleItems = pickerItems.slice(pickerScrollOffset, pickerScrollOffset + maxVisible);

    const titleTarget =
      pickerTarget === "all-models"
        ? "TODOS los subagentes"
        : pickerTarget === "category-models"
          ? `Categoría: ${targetCategory}`
          : pickerTarget === "default-model"
            ? "👑 Orquestador (Modelo Base)"
            : `Agente: ${selectedAgent()}`;

    const filterBox = modelFilter
      ? `${cHeading("Filtrar:")} ${cAccent(modelFilter)}${cHighlight("█")} ${cSecondary(`(${pickerItems.length}/${allPickerModels.length} modelos)`)}`
      : `${cHeading("Filtrar:")} ${cMuted("(escribí cualquier texto para filtrar modelos...)")} ${cSecondary(`(${allPickerModels.length} disponibles)`)}`;

    const shortcuts = buildShortcutsLine(2, [
      { keyTag: "[Escribir]", label: "Filtrar" },
      { keyTag: "[↑/↓]", label: "Navegar" },
      { keyTag: "[Enter]", label: "Elegir", key: "\r" },
      { keyTag: "[Backspace]", label: "Borrar" },
      { keyTag: "[Esc]", label: "Volver", key: "\u001b" },
    ], width);

    const header = [
      `${cHeading("Asignar modelo a:")} ${cAccent(titleTarget)}`,
      filterBox,
      shortcuts,
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const listLines: string[] = [];
    if (pickerItems.length === 0) {
      listLines.push(cWarning(`  No se encontraron modelos que coincidan con "${modelFilter}".`));
      listLines.push(cText("  Presioná [Backspace] para borrar el filtro o [Esc] para volver."));
    } else {
      for (const [offset, item] of visibleItems.entries()) {
        const idx = pickerScrollOffset + offset;
        registerItemTarget(header.length + offset, idx);
        const isSelected = idx === pickerIndex;
        const cursor = isSelected ? cHighlight("› ") : "  ";

        const slashIdx = item.indexOf("/");
        const providerPart = slashIdx !== -1 ? cMuted(item.slice(0, slashIdx + 1)) : "";
        const modelPart = slashIdx !== -1 ? item.slice(slashIdx + 1) : item;
        const modelFormatted = isSelected
          ? cBold(cAccent(modelPart))
          : cModel(modelPart);

        const line = `${cursor}${providerPart}${modelFormatted}`;
        listLines.push(line);
      }
    }

    return frameModal("📋 Seleccionar Modelo (con Filtro)", [...header, ...listLines], width, theme);
  };

  // View: Effort Picker
  const renderEffortPicker = (width: number): string[] => {
    const isOrchestrator =
      pickerTarget === "default-model" || selectedAgent() === ORCHESTRATOR_AGENT_KEY;

    const titleTarget =
      pickerTarget === "all-models"
        ? "TODOS los subagentes"
        : pickerTarget === "category-models"
          ? `Categoría: ${targetCategory}`
          : isOrchestrator
            ? "👑 Orquestador (Sesión Principal)"
            : `Agente: ${selectedAgent()}`;

    const modelInfo = stagedModel ? ` ${cBorderMuted("·")} ${cHeading("Modelo asignado:")} ${cModel(stagedModel)}` : "";

    const shortcuts = buildShortcutsLine(1, [
      { keyTag: "[↑/↓]", label: "Navegar" },
      { keyTag: "[Enter]", label: "Confirmar", key: "\r" },
      { keyTag: "[Esc]", label: "Saltear esfuerzo", key: "\u001b" },
    ], width);

    const header = [
      `${cHeading("Elegir nivel de razonamiento para:")} ${cAccent(titleTarget)}${modelInfo}`,
      shortcuts,
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const listLines: string[] = [];
    for (const [idx, item] of EFFORT_OPTIONS.entries()) {
      registerItemTarget(header.length + idx, idx);
      const isSelected = idx === pickerIndex;
      const cursor = isSelected ? cHighlight("› ") : "  ";
      const desc =
        item === "high"
          ? ` ${cMuted("(razonamiento alto)")}`
          : item === "medium"
            ? ` ${cMuted("(balance estándar)")}`
            : item === "low"
              ? ` ${cMuted("(rápido y económico)")}`
              : item === "max"
                ? ` ${cMuted("(máxima profundidad)")}`
                : item === "default"
                  ? isOrchestrator
                    ? ` ${cMuted("(predeterminado del proveedor / sin forzar)")}`
                    : ` ${cMuted("(heredar por defecto del perfil)")}`
                  : "";

      const effortColorFn =
        item === "low" ? cSuccess :
        item === "medium" ? cHeading :
        item === "high" ? cWarning :
        item === "xhigh" || item === "max" ? cError :
        cSecondary;

      const itemFormatted = isSelected ? cBold(cAccent(item)) : effortColorFn(item);
      const line = `${cursor}${itemFormatted}${desc}`;
      listLines.push(line);
    }

    return frameModal("🧠 Nivel de Razonamiento (Effort)", [...header, ...listLines], width, theme);
  };

  // View: Category Picker
  const renderCategoryPicker = (width: number): string[] => {
    const shortcuts = buildShortcutsLine(1, [
      { keyTag: "[↑/↓]", label: "Navegar" },
      { keyTag: "[Enter]", label: "Elegir", key: "\r" },
      { keyTag: "[Esc]", label: "Cancelar", key: "\u001b" },
    ], width);

    const header = [
      cHeading("Elegir qué categoría de agentes configurar en lote:"),
      shortcuts,
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const categoryRows = [
      { name: "👑 Orquestador (Sesión Principal)", count: 1 },
      ...SDD_AGENT_CATEGORIES.map((cat) => ({ name: cat.name, count: cat.agents.length })),
    ];

    const listLines: string[] = [];
    for (const [idx, cat] of categoryRows.entries()) {
      registerItemTarget(header.length + idx, idx);
      const isSelected = idx === pickerIndex;
      const cursor = isSelected ? cHighlight("› ") : "  ";
      const label = isSelected ? cBold(cAccent(cat.name)) : cText(cat.name);
      const countLabel = ` ${cBorderMuted("·")} ${cHeading(String(cat.count))} ${cSecondary("agentes")}`;
      const line = `${cursor}${label}${countLabel}`;
      listLines.push(line);
    }

    return frameModal("📦 Elegir Categoría", [...header, ...listLines], width, theme);
  };

  const modalComponent = {
    render(width: number): string[] {
      clickTargets = [];
      currentBodyStartY = width < 30 ? 1 : 2;
      if (view === "choose-scope") return constrainLines(renderChooseScope(width), width);
      if (view === "create-profile") return constrainLines(renderCreateProfile(width), width);
      if (view === "rename-profile") return constrainLines(renderRenameProfile(width), width);
      if (view === "confirm-delete") return constrainLines(renderConfirmDelete(width), width);
      if (view === "profile-editor") return constrainLines(renderProfileEditor(width), width);
      if (view === "model-picker") return constrainLines(renderModelPicker(width), width);
      if (view === "effort-picker") return constrainLines(renderEffortPicker(width), width);
      if (view === "category-picker") return constrainLines(renderCategoryPicker(width), width);
      return constrainLines(renderProfilesList(width), width);
    },

    handleInput(data: string): void {
      const key = normalizeModalKey(data);

      // --- Sub-View: Choose Scope ---
      if (view === "choose-scope") {
        if (key === "esc") {
          view = "profiles-list";
          activatingProfile = null;
        } else if (key === "up" || key === "k") {
          chooseScopeIndex = Math.max(0, chooseScopeIndex - 1);
        } else if (key === "down" || key === "j") {
          chooseScopeIndex = Math.min(1, chooseScopeIndex + 1);
        } else if (key === "1") {
          chooseScopeIndex = 0;
          executeActivation("project");
        } else if (key === "2") {
          chooseScopeIndex = 1;
          executeActivation("global");
        } else if (key === "p") {
          chooseScopeIndex = 0;
          executeActivation("project");
        } else if (key === "g") {
          chooseScopeIndex = 1;
          executeActivation("global");
        } else if (key === "enter") {
          const scope = chooseScopeIndex === 0 ? "project" : "global";
          executeActivation(scope);
        }
        requestRender();
        return;
      }

      // --- Sub-View: Create Profile ---
      if (view === "create-profile") {
        if (key === "esc") {
          view = "profiles-list";
          newProfileInput = "";
        } else if (key === "backspace") {
          newProfileInput = newProfileInput.slice(0, -1);
        } else if (key === "enter") {
          const trimmed = newProfileInput.trim();
          if (trimmed) {
            const fallbackModel = availableModels[0] ?? "anthropic/claude-sonnet-4-5";
            const created = manager.createProfile({
              name: trimmed,
              description: `Perfil creado el ${new Date().toLocaleDateString()}`,
              default_model: fallbackModel,
              default_effort: "high",
              model_profiles: {},
              scope: "global",
            });
            if (created.success && created.profile) {
              refreshProfiles();
              editingProfile = {
                ...created.profile,
                model_profiles: { ...created.profile.model_profiles },
              };
              selectedAgentIndex = 0;
              agentScrollOffset = 0;
              isDirty = false;
              view = "profile-editor";
              newProfileInput = "";
            }
          }
        } else if (data.length === 1 && /^[\w\-\. ]$/.test(data)) {
          newProfileInput += data;
        }
        requestRender();
        return;
      }

      // --- Sub-View: Rename Profile ---
      if (view === "rename-profile") {
        if (key === "esc") {
          view = "profiles-list";
          renameProfileInput = "";
          renameErrorMessage = null;
        } else if (key === "backspace") {
          renameProfileInput = renameProfileInput.slice(0, -1);
          renameErrorMessage = null;
        } else if (key === "enter") {
          const trimmed = renameProfileInput.trim();
          if (!trimmed) {
            renameErrorMessage = "El nombre no puede estar vacío.";
          } else {
            const res = manager.renameProfile(renamingOldName, trimmed);
            if (res.success) {
              refreshProfiles();
              const newIdx = profiles.findIndex((p) => p.name.toLowerCase() === trimmed.toLowerCase());
              if (newIdx !== -1) selectedProfileIndex = newIdx;
              feedbackMessage = res.message;
              view = "profiles-list";
              renameProfileInput = "";
              renameErrorMessage = null;
            } else {
              renameErrorMessage = res.message;
            }
          }
        } else if (data.length === 1 && /^[\w\-\. ]$/.test(data)) {
          renameProfileInput += data;
          renameErrorMessage = null;
        }
        requestRender();
        return;
      }

      // --- Sub-View: Confirm Delete ---
      if (view === "confirm-delete") {
        if (key === "esc" || key === "n" || key === "N") {
          view = "profiles-list";
          deletingProfileName = "";
        } else if (key === "enter" || key === "y" || key === "Y" || key === "d") {
          manager.deleteProfile(deletingProfileName);
          refreshProfiles();
          feedbackMessage = `Perfil "${deletingProfileName}" eliminado correctamente.`;
          deletingProfileName = "";
          view = "profiles-list";
        }
        requestRender();
        return;
      }

      // --- Sub-View: Model Picker ---
      if (view === "model-picker") {
        if (key === "esc") {
          if (modelFilter) {
            modelFilter = "";
            applyModelFilter();
          } else {
            stagedModel = undefined;
            view = "profile-editor";
          }
        } else if (key === "backspace") {
          if (modelFilter.length > 0) {
            modelFilter = modelFilter.slice(0, -1);
            applyModelFilter();
          }
        } else if (key === "up") {
          pickerIndex = Math.max(0, pickerIndex - 1);
        } else if (key === "down") {
          pickerIndex = Math.min(pickerItems.length - 1, pickerIndex + 1);
        } else if (key === "pageup") {
          pickerIndex = Math.max(0, pickerIndex - 5);
        } else if (key === "pagedown") {
          pickerIndex = Math.min(pickerItems.length - 1, pickerIndex + 5);
        } else if (key === "home") {
          pickerIndex = 0;
        } else if (key === "end") {
          pickerIndex = Math.max(0, pickerItems.length - 1);
        } else if (key === "enter") {
          const chosenModel = pickerItems[pickerIndex];
          if (chosenModel && editingProfile) {
            // Stage model and seamlessly chain to effort-picker!
            stagedModel = chosenModel;
            pickerIndex = 0;
            view = "effort-picker";
          } else if (pickerItems.length === 0 && modelFilter.trim().includes("/")) {
            stagedModel = modelFilter.trim();
            pickerIndex = 0;
            view = "effort-picker";
          } else {
            view = "profile-editor";
          }
        } else if (data.length === 1 && /^[\w\-\.\/ :@+]$/.test(data)) {
          modelFilter += data;
          applyModelFilter();
        }
        requestRender();
        return;
      }

      // --- Sub-View: Effort Picker ---
      if (view === "effort-picker") {
        if (key === "esc" || key === "q") {
          // If a model was staged, apply it without altering effort
          if (stagedModel && editingProfile) {
            isDirty = true;
            if (pickerTarget === "default-model" || selectedAgent() === ORCHESTRATOR_AGENT_KEY) {
              editingProfile.default_model = stagedModel;
            } else if (pickerTarget === "all-models") {
              editingProfile.default_model = stagedModel;
              for (const ag of ALL_KNOWN_AGENTS) {
                editingProfile.model_profiles[ag] = {
                  model: stagedModel,
                  effort: editingProfile.model_profiles[ag]?.effort,
                };
              }
            } else if (pickerTarget === "category-models" && targetCategory) {
              const cat = SDD_AGENT_CATEGORIES.find((c) => c.name === targetCategory);
              if (cat) {
                for (const ag of cat.agents) {
                  editingProfile.model_profiles[ag] = {
                    model: stagedModel,
                    effort: editingProfile.model_profiles[ag]?.effort,
                  };
                }
              }
            } else {
              const currentAgent = selectedAgent();
              editingProfile.model_profiles[currentAgent] = {
                model: stagedModel,
                effort: editingProfile.model_profiles[currentAgent]?.effort,
              };
            }
          }
          stagedModel = undefined;
          view = "profile-editor";
        } else if (key === "up" || key === "k") {
          pickerIndex = Math.max(0, pickerIndex - 1);
        } else if (key === "down" || key === "j") {
          pickerIndex = Math.min(EFFORT_OPTIONS.length - 1, pickerIndex + 1);
        } else if (key === "enter") {
          const chosen = EFFORT_OPTIONS[pickerIndex];
          if (editingProfile) {
            isDirty = true;
            const effortVal = chosen === "default" ? undefined : chosen;

            if (pickerTarget === "default-model" || selectedAgent() === ORCHESTRATOR_AGENT_KEY) {
              if (stagedModel) editingProfile.default_model = stagedModel;
              if (effortVal !== undefined) {
                editingProfile.default_effort = effortVal;
              } else {
                delete editingProfile.default_effort;
              }
            } else if (pickerTarget === "all-models") {
              if (stagedModel) editingProfile.default_model = stagedModel;
              for (const ag of ALL_KNOWN_AGENTS) {
                const entryModel = stagedModel ?? editingProfile.model_profiles[ag]?.model ?? editingProfile.default_model ?? "default";
                if (effortVal !== undefined) {
                  editingProfile.model_profiles[ag] = {
                    model: entryModel,
                    effort: effortVal,
                  };
                } else {
                  editingProfile.model_profiles[ag] = {
                    model: entryModel,
                  };
                }
              }
            } else if (pickerTarget === "category-models" && targetCategory) {
              const cat = SDD_AGENT_CATEGORIES.find((c) => c.name === targetCategory);
              if (cat) {
                for (const ag of cat.agents) {
                  const entryModel = stagedModel ?? editingProfile.model_profiles[ag]?.model ?? editingProfile.default_model ?? "default";
                  if (effortVal !== undefined) {
                    editingProfile.model_profiles[ag] = {
                      model: entryModel,
                      effort: effortVal,
                    };
                  } else {
                    editingProfile.model_profiles[ag] = {
                      model: entryModel,
                    };
                  }
                }
              }
            } else {
              const currentAgent = selectedAgent();
              const currentModel =
                stagedModel ??
                editingProfile.model_profiles[currentAgent]?.model ??
                editingProfile.default_model ??
                "default";
              if (effortVal !== undefined) {
                editingProfile.model_profiles[currentAgent] = {
                  model: currentModel,
                  effort: effortVal,
                };
              } else {
                editingProfile.model_profiles[currentAgent] = {
                  model: currentModel,
                };
              }
            }
          }
          stagedModel = undefined;
          view = "profile-editor";
        }
        requestRender();
        return;
      }

      // --- Sub-View: Category Picker ---
      if (view === "category-picker") {
        if (key === "esc" || key === "q") {
          view = "profile-editor";
        } else if (key === "up" || key === "k") {
          pickerIndex = Math.max(0, pickerIndex - 1);
        } else if (key === "down" || key === "j") {
          pickerIndex = Math.min(SDD_AGENT_CATEGORIES.length, pickerIndex + 1);
        } else if (key === "enter") {
          if (pickerIndex === 0) {
            // Orquestador
            openModelPicker("default-model");
          } else {
            const cat = SDD_AGENT_CATEGORIES[pickerIndex - 1];
            if (cat) {
              openModelPicker("category-models", cat.name);
            }
          }
        }
        requestRender();
        return;
      }

      // --- Sub-View: Profile Editor ---
      if (view === "profile-editor") {
        if (key === "esc" || key === "q") {
          view = "profiles-list";
          refreshProfiles();
        } else if (key === "up" || key === "k") {
          selectedAgentIndex = Math.max(0, selectedAgentIndex - 1);
        } else if (key === "down" || key === "j") {
          selectedAgentIndex = Math.min(editingAgentsList.length - 1, selectedAgentIndex + 1);
        } else if (key === "pageup") {
          selectedAgentIndex = Math.max(0, selectedAgentIndex - 5);
        } else if (key === "pagedown") {
          selectedAgentIndex = Math.min(editingAgentsList.length - 1, selectedAgentIndex + 5);
        } else if (key === "home") {
          selectedAgentIndex = 0;
        } else if (key === "end") {
          selectedAgentIndex = Math.max(0, editingAgentsList.length - 1);
        } else if (key === "enter" || key === "m") {
          const current = selectedAgent();
          stagedModel = undefined;
          if (current === ASSIGN_ALL_SUBAGENTS_KEY) {
            openModelPicker("all-models");
          } else if (current === ASSIGN_ALL_EFFORT_KEY) {
            pickerTarget = "all-models";
            pickerIndex = 0;
            view = "effort-picker";
          } else if (current === ASSIGN_CATEGORY_KEY) {
            pickerIndex = 0;
            view = "category-picker";
          } else if (current === ORCHESTRATOR_AGENT_KEY) {
            openModelPicker("default-model");
          } else {
            // Individual subagent!
            openModelPicker("agent-model");
          }
        } else if (key === "e") {
          const current = selectedAgent();
          stagedModel = undefined;
          if (current === ASSIGN_ALL_SUBAGENTS_KEY || current === ASSIGN_ALL_EFFORT_KEY) {
            pickerTarget = "all-models";
            pickerIndex = 0;
            view = "effort-picker";
          } else if (current === ASSIGN_CATEGORY_KEY) {
            pickerIndex = 0;
            view = "category-picker";
          } else if (current === ORCHESTRATOR_AGENT_KEY) {
            pickerTarget = "default-model";
            pickerIndex = 0;
            view = "effort-picker";
          } else {
            pickerTarget = "agent-model";
            pickerIndex = 0;
            view = "effort-picker";
          }
        } else if (key === "a") {
          // Assign to ALL subagents
          openModelPicker("all-models");
        } else if (key === "c") {
          // Assign by Category
          pickerIndex = 0;
          view = "category-picker";
        } else if (key === "s") {
          // Save Profile
          if (editingProfile) {
            manager.createProfile(editingProfile);
            isDirty = false;
            refreshProfiles();
            feedbackMessage = `Perfil "${editingProfile.name}" guardado correctamente.`;
            view = "profiles-list";
          }
        }
        requestRender();
        return;
      }

      // --- Main View: Profiles List ---
      if (key === "esc" || key === "q") {
        done({ action: "closed" });
        return;
      }

      if (key === "up" || key === "k") {
        selectedProfileIndex = Math.max(0, selectedProfileIndex - 1);
      } else if (key === "down" || key === "j") {
        selectedProfileIndex = Math.min(profiles.length - 1, selectedProfileIndex + 1);
      } else if (key === "pageup") {
        selectedProfileIndex = Math.max(0, selectedProfileIndex - 5);
      } else if (key === "pagedown") {
        selectedProfileIndex = Math.min(profiles.length - 1, selectedProfileIndex + 5);
      } else if (key === "home") {
        selectedProfileIndex = 0;
      } else if (key === "end") {
        selectedProfileIndex = Math.max(0, profiles.length - 1);
      } else if (key === "enter") {
        const target = selectedProfile();
        if (target) {
          activatingProfile = target;
          chooseScopeIndex = 0;
          feedbackMessage = null;
          view = "choose-scope";
        }
      } else if (key === "p") {
        const target = selectedProfile();
        if (target) {
          activatingProfile = target;
          executeActivation("project");
        }
      } else if (key === "n") {
        // Create new profile
        feedbackMessage = null;
        newProfileInput = "";
        view = "create-profile";
      } else if (key === "e") {
        // Edit selected profile
        feedbackMessage = null;
        const target = selectedProfile();
        if (target) {
          const loaded = manager.getProfile(target.name);
          if (loaded) {
            editingProfile = {
              ...loaded,
              model_profiles: { ...loaded.model_profiles },
            };
            selectedAgentIndex = 0;
            agentScrollOffset = 0;
            isDirty = false;
            view = "profile-editor";
          }
        }
      } else if (key === "r") {
        // Rename selected profile
        const target = selectedProfile();
        if (target) {
          renamingOldName = target.name;
          renameProfileInput = target.name;
          renameErrorMessage = null;
          feedbackMessage = null;
          view = "rename-profile";
        }
      } else if (key === "d" || key === "delete") {
        // Delete selected profile
        const target = selectedProfile();
        if (target) {
          deletingProfileName = target.name;
          feedbackMessage = null;
          view = "confirm-delete";
        }
      }

      requestRender();
    },

    handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
      if (event.type === "wheel") {
        const delta = event.wheelDelta ?? 0;
        if (delta > 0) {
          modalComponent.handleInput("\u001b[B"); // down
          return { handled: true, render: true };
        } else if (delta < 0) {
          modalComponent.handleInput("\u001b[A"); // up
          return { handled: true, render: true };
        }
        return undefined;
      }

      if (event.type === "click" && event.button === "left") {
        const { x, y, clickCount = 1 } = event;
        const target = clickTargets.find((t) => {
          if (t.y !== y) return false;
          if (t.type === "action") {
            if (t.xStart !== undefined && t.xEnd !== undefined) {
              return x >= t.xStart && x <= t.xEnd;
            }
          }
          return true;
        });

        if (target) {
          if (target.type === "action" && target.key) {
            modalComponent.handleInput(target.key);
            return { handled: true, render: true };
          }

          if (target.type === "item" && target.index !== undefined) {
            const itemIdx = target.index;
            if (view === "choose-scope") {
              chooseScopeIndex = itemIdx;
              const scope = chooseScopeIndex === 0 ? "project" : "global";
              executeActivation(scope);
              return { handled: true, render: true };
            }

            if (view === "profiles-list") {
              if (itemIdx === selectedProfileIndex || clickCount === 2) {
                selectedProfileIndex = itemIdx;
                modalComponent.handleInput("\r");
              } else {
                selectedProfileIndex = itemIdx;
                requestRender();
              }
              return { handled: true, render: true };
            }

            if (view === "profile-editor") {
              if (itemIdx === selectedAgentIndex || clickCount === 2) {
                selectedAgentIndex = itemIdx;
                modalComponent.handleInput("\r");
              } else {
                selectedAgentIndex = itemIdx;
                requestRender();
              }
              return { handled: true, render: true };
            }

            if (view === "model-picker" || view === "effort-picker" || view === "category-picker") {
              if (itemIdx === pickerIndex || clickCount === 2) {
                pickerIndex = itemIdx;
                modalComponent.handleInput("\r");
              } else {
                pickerIndex = itemIdx;
                requestRender();
              }
              return { handled: true, render: true };
            }
          }
        }
      }

      return undefined;
    },

    invalidate(): void {},
  };

  return modalComponent;
}
