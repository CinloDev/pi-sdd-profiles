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
  truncateToWidth,
  computeThreeColumnWidths,
  renderThreeColumns,
  renderColumnHeaderDivider,
  type ColumnWidths,
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

export type ActivePane = "profiles" | "agents" | "effort";

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
  let activePane: ActivePane = "profiles";
  let profiles: ProfileSummary[] = manager.listProfiles();
  let activeProfileName = manager.getActiveProfileName();

  // Navigation state for profiles-list (Col 1)
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

  // Editing state for agents (Col 2)
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

  const selectedProfile = (): ProfileSummary | undefined => {
    return profiles[selectedProfileIndex];
  };

  const syncEditingProfile = () => {
    const current = selectedProfile();
    if (current) {
      const loaded = manager.getProfile(current.name);
      if (loaded) {
        editingProfile = {
          ...loaded,
          model_profiles: { ...(loaded.model_profiles || {}) },
        };
      }
    }
  };
  syncEditingProfile();

  // Navigation state for effort (Col 3)
  let selectedEffortIndex = 0;

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

  const selectedAgent = (): string => {
    return editingAgentsList[selectedAgentIndex] ?? editingAgentsList[0];
  };

  const getCurrentAgentEffort = (fullProf: Profile | null, agentName: string): ReasoningEffort | "default" => {
    if (!fullProf) return "default";
    if (agentName === ORCHESTRATOR_AGENT_KEY) {
      return fullProf.default_effort ?? "default";
    }
    return fullProf.model_profiles[agentName]?.effort ?? fullProf.default_effort ?? "default";
  };

  const shortenModel = (modelStr: string, maxLen: number = 22): string => {
    if (!modelStr) return "";
    const slashIdx = modelStr.lastIndexOf("/");
    const id = slashIdx !== -1 ? modelStr.slice(slashIdx + 1) : modelStr;
    if (visibleWidth(id) <= maxLen) return id;
    return truncateToWidth(id, maxLen);
  };

  const applyEffortOption = (effort: ReasoningEffort | "default") => {
    const profSummary = selectedProfile();
    if (!profSummary) return;
    const fullProfile = manager.getProfile(profSummary.name);
    if (!fullProfile) return;

    const effortVal = effort === "default" ? undefined : effort;
    const agent = selectedAgent();

    if (pickerTarget === "all-models") {
      if (effortVal) fullProfile.default_effort = effortVal;
      else delete fullProfile.default_effort;
      for (const ag of ALL_KNOWN_AGENTS) {
        const entryModel = fullProfile.model_profiles[ag]?.model ?? fullProfile.default_model ?? "default";
        if (effortVal) {
          fullProfile.model_profiles[ag] = { model: entryModel, effort: effortVal };
        } else {
          fullProfile.model_profiles[ag] = { model: entryModel };
        }
      }
      pickerTarget = "agent-model";
    } else if (agent === ORCHESTRATOR_AGENT_KEY) {
      if (effortVal) fullProfile.default_effort = effortVal;
      else delete fullProfile.default_effort;
    } else {
      const currentModel = fullProfile.model_profiles[agent]?.model ?? fullProfile.default_model ?? "default";
      if (effortVal) {
        fullProfile.model_profiles[agent] = { model: currentModel, effort: effortVal };
      } else {
        fullProfile.model_profiles[agent] = { model: currentModel };
      }
    }

    manager.createProfile(fullProfile);
    refreshProfiles();
    if (activeProfileName && profSummary.name.toLowerCase() === activeProfileName.toLowerCase()) {
      onProfileActivated?.(fullProfile);
    }
    feedbackMessage = `Esfuerzo "${effort}" guardado para ${agent === ORCHESTRATOR_AGENT_KEY ? "Orquestador" : agent}.`;
  };

  const applyModelOption = (chosenModel: string, effortVal?: ReasoningEffort) => {
    const profSummary = selectedProfile();
    if (!profSummary) return;
    const fullProfile = manager.getProfile(profSummary.name);
    if (!fullProfile) return;

    if (pickerTarget === "category-models" && targetCategory) {
      const cat = SDD_AGENT_CATEGORIES.find((c) => c.name === targetCategory || c.id === targetCategory);
      if (cat) {
        if (!fullProfile.model_profiles) fullProfile.model_profiles = {};
        for (const ag of cat.agents) {
          const eff = effortVal !== undefined ? effortVal : fullProfile.model_profiles[ag]?.effort;
          fullProfile.model_profiles[ag] = {
            model: chosenModel,
            ...(eff ? { effort: eff } : {}),
          };
        }
      }
      targetCategory = undefined;
      pickerTarget = "agent-model";
    } else if (pickerTarget === "all-models") {
      fullProfile.default_model = chosenModel;
      if (effortVal !== undefined) fullProfile.default_effort = effortVal;
      if (!fullProfile.model_profiles) fullProfile.model_profiles = {};
      for (const ag of ALL_KNOWN_AGENTS) {
        const eff = effortVal !== undefined ? effortVal : fullProfile.model_profiles[ag]?.effort;
        fullProfile.model_profiles[ag] = {
          model: chosenModel,
          ...(eff ? { effort: eff } : {}),
        };
      }
      pickerTarget = "agent-model";
    } else if (pickerTarget === "default-model" || (pickerTarget === "agent-model" && selectedAgent() === ORCHESTRATOR_AGENT_KEY)) {
      fullProfile.default_model = chosenModel;
      if (effortVal !== undefined) fullProfile.default_effort = effortVal;
    } else {
      const ag = selectedAgent();
      const eff = effortVal !== undefined ? effortVal : fullProfile.model_profiles[ag]?.effort;
      if (!fullProfile.model_profiles) fullProfile.model_profiles = {};
      fullProfile.model_profiles[ag] = {
        model: chosenModel,
        ...(eff ? { effort: eff } : {}),
      };
    }

    manager.createProfile(fullProfile);
    refreshProfiles();
    syncEditingProfile();
    if (activeProfileName && profSummary.name.toLowerCase() === activeProfileName.toLowerCase()) {
      onProfileActivated?.(fullProfile);
    }
    feedbackMessage = `Modelo "${chosenModel}" guardado.`;
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
    pane?: 0 | 1 | 2;
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

  const registerItemTarget = (bodyLineIndex: number, itemIndex: number, pane?: 0 | 1 | 2, xStart?: number, xEnd?: number) => {
    clickTargets.push({
      y: currentBodyStartY + bodyLineIndex,
      type: "item",
      pane,
      index: itemIndex,
      xStart,
      xEnd,
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

  // View: Main 3-Column Profiles Dashboard
  const renderProfilesDashboard = (width: number): string[] => {
    const maxVisible = 10;
    clickTargets = [];

    const clampedProfiles = clampList(selectedProfileIndex, profileScrollOffset, profiles.length, maxVisible);
    selectedProfileIndex = clampedProfiles.index;
    profileScrollOffset = clampedProfiles.scroll;

    const visibleProfiles = profiles.slice(profileScrollOffset, profileScrollOffset + maxVisible);

    const currentSummary = selectedProfile();
    const currentFullProfile = currentSummary ? manager.getProfile(currentSummary.name) : null;

    const clampedAgents = clampList(selectedAgentIndex, agentScrollOffset, editingAgentsList.length, maxVisible);
    selectedAgentIndex = clampedAgents.index;
    agentScrollOffset = clampedAgents.scroll;

    const curAgent = selectedAgent();
    const currentAgentEffort = currentFullProfile ? getCurrentAgentEffort(currentFullProfile, curAgent) : "default";

    if (activePane !== "effort") {
      const effIdx = EFFORT_OPTIONS.indexOf(currentAgentEffort);
      if (effIdx !== -1) selectedEffortIndex = effIdx;
    }

    const activeProfileObj = activeProfileName ? manager.getProfile(activeProfileName) : null;
    const activeScope = typeof manager.getActiveScope === "function" ? manager.getActiveScope() : null;
    const activeScopeBadge = activeScope === "project" ? cWarning(" (proyecto)") : activeScope === "global" ? cMuted(" (global)") : "";
    const activeOrchestrator = activeProfileObj?.default_model
      ? ` ${cBorderMuted("·")} ${cHeading("Orquestador:")} ${cModel(shortenModel(activeProfileObj.default_model, 26))}`
      : "";

    const isWarningFeedback = feedbackMessage && (
      feedbackMessage.includes("Error") ||
      feedbackMessage.includes("no se puede") ||
      feedbackMessage.includes("No se puede") ||
      feedbackMessage.includes("integrados") ||
      feedbackMessage.includes("vacío") ||
      feedbackMessage.includes("Ya existe")
    );

    const shortcutDefs: ShortcutDef[] = width < 80
      ? [
          { keyTag: "[Enter]", label: activePane === "effort" ? "Elegir" : activePane === "agents" ? "Modelo" : "Activar", key: "\r" },
          { keyTag: "[e]", label: "Edit", key: "e" },
          { keyTag: "[n]", label: "Nuevo", key: "n" },
          { keyTag: "[Esc]", label: "Salir", key: "\u001b" },
        ]
      : [
          { keyTag: "[Enter]", label: activePane === "effort" ? "Elegir" : activePane === "agents" ? "Modelo" : "Activar", key: "\r" },
          { keyTag: "[e]", label: "Edit", key: "e" },
          { keyTag: "[a]", label: "Todos", key: "a" },
          { keyTag: "[n]", label: "Nuevo", key: "n" },
          { keyTag: "[d]", label: "Borrar", key: "d" },
          { keyTag: "[Esc]", label: "Salir", key: "\u001b" },
        ];

    const header = [
      `${cHeading("Estado:")} ${cText("Perfil activo")} → ${activeProfileName ? cSuccess(`● ${activeProfileName}`) + activeScopeBadge : cDim("(ninguno)")}${activeOrchestrator}`,
      ...(feedbackMessage
        ? [isWarningFeedback
            ? cWarning(`⚠️ ${feedbackMessage}`)
            : cSuccess(`✔ ${feedbackMessage}`)]
        : []),
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const paddingX = width < 90 ? 1 : 2;
    const innerWidth = Math.max(1, width - 2);
    const contentWidth = Math.max(1, innerWidth - (paddingX * 2));
    const colWidths = computeThreeColumnWidths(contentWidth);

    // Column Headers
    const col1Header = activePane === "profiles"
      ? `${cHighlight("› Perfiles")} ${cSecondary(`(${selectedProfileIndex + 1}/${profiles.length})`)}`
      : `${cHeading("  Perfiles")} ${cDim(`(${profiles.length})`)}`;

    const profTag = currentSummary ? `[${currentSummary.name}]` : "";
    const col2Header = activePane === "agents"
      ? `${cHighlight(`› ${profTag} Agentes`)} ${cSecondary(`(${selectedAgentIndex + 1}/${editingAgentsList.length})`)}`
      : `${cHeading(`  ${profTag} Agentes`)} ${cDim(`(${editingAgentsList.length})`)}`;

    const col3Header = activePane === "effort"
      ? `${cHighlight("› Effort / Thinking")}`
      : `${cHeading("  Effort / Thinking")}`;

    const col1Lines: string[] = [];
    if (profiles.length === 0) {
      col1Lines.push(cMuted("Sin perfiles. Presioná 'n'"));
    } else {
      for (let offset = 0; offset < maxVisible; offset++) {
        const idx = profileScrollOffset + offset;
        if (idx < profiles.length) {
          const p = profiles[idx];
          const isSelected = idx === selectedProfileIndex;
          const isActive = p.is_active || (activeProfileName && p.name.toLowerCase() === activeProfileName.toLowerCase());
          const cursor = isSelected
            ? (activePane === "profiles" ? cHighlight("› ") : cAccent("▸ "))
            : "  ";
          const marker = isActive ? cSuccess("● ") : cDim("○ ");
          const nameFormatted = isSelected ? cBold(cAccent(p.name)) : cText(p.name);
          const scopeBadge = (isActive && p.active_scope)
            ? (p.active_scope === "project" ? cWarning(" [p]") : cMuted(" [g]"))
            : "";
          col1Lines.push(`${cursor}${marker}${nameFormatted}${scopeBadge}`);
        } else {
          col1Lines.push("");
        }
      }
    }

    const col2Lines: string[] = [];
    for (let offset = 0; offset < maxVisible; offset++) {
      const idx = agentScrollOffset + offset;
      if (idx < editingAgentsList.length) {
        const agName = editingAgentsList[idx];
        const isSelected = idx === selectedAgentIndex;
        const cursor = isSelected
          ? (activePane === "agents" ? cHighlight("› ") : cAccent("▸ "))
          : "  ";

        if (agName === ORCHESTRATOR_AGENT_KEY) {
          const modelRaw = currentFullProfile?.default_model;
          const modelLabel = modelRaw ? cModel(shortenModel(modelRaw, Math.max(8, colWidths.col2 - 18))) : cDim("(no def)");
          const label = isSelected ? cBold(cAccent("👑 Orquestador")) : cHeading("👑 Orquestador");
          col2Lines.push(`${cursor}${label} ${cBorderMuted("·")} ${modelLabel}`);
        } else if (
          agName === ASSIGN_ALL_SUBAGENTS_KEY ||
          agName === ASSIGN_ALL_EFFORT_KEY ||
          agName === ASSIGN_CATEGORY_KEY
        ) {
          const shortAction =
            agName === ASSIGN_ALL_SUBAGENTS_KEY ? "⚡ Asignar un mismo modelo a TODOS" :
            agName === ASSIGN_ALL_EFFORT_KEY ? "🧠 Esfuerzo a todos los subagentes" :
            "📦 Por Categoría...";
          const label = isSelected ? cBold(cHighlight(shortAction)) : cWarning(shortAction);
          col2Lines.push(`${cursor}${label}`);
        } else {
          const assignment = currentFullProfile?.model_profiles[agName];
          const isExplicit = !!assignment?.model;
          const rawModel = assignment?.model ?? currentFullProfile?.default_model ?? "default";
          const maxModelLen = Math.max(8, colWidths.col2 - agName.length - 6);
          const modelLabel = isExplicit
            ? cModel(shortenModel(rawModel, maxModelLen))
            : cDim(shortenModel(rawModel, maxModelLen));
          const label = isSelected ? cBold(cAccent(agName)) : cText(agName);
          col2Lines.push(`${cursor}${label} ${cBorderMuted("·")} ${modelLabel}`);
        }
      } else {
        col2Lines.push("");
      }
    }

    const col3Lines: string[] = [];
    for (let offset = 0; offset < maxVisible; offset++) {
      if (offset < EFFORT_OPTIONS.length) {
        const opt = EFFORT_OPTIONS[offset];
        const isFocused = offset === selectedEffortIndex;
        const isCurrent = opt === currentAgentEffort;
        const cursor = (activePane === "effort" && isFocused)
          ? cHighlight("› ")
          : "  ";
        const radio = isCurrent ? cSuccess("● ") : cDim("○ ");
        const optLabel = isCurrent
          ? cBold(cSuccess(opt))
          : (isFocused ? cAccent(opt) : cText(opt));

        const badge =
          opt === "max" || opt === "high" || opt === "xhigh" ? cAccent(" 🧠") :
          opt === "default" ? cDim(" (auto)") : "";

        col3Lines.push(`${cursor}${radio}${optLabel}${badge}`);
      } else {
        col3Lines.push("");
      }
    }

    const contentStartX = paddingX + 1;
    const col1XStart = contentStartX;
    const col1XEnd = col1XStart + colWidths.col1;
    const col2XStart = col1XEnd + 1;
    const col2XEnd = col2XStart + colWidths.col2;
    const col3XStart = col2XEnd + 1;
    const col3XEnd = col3XStart + colWidths.col3;

    const bodyRowsStartY = header.length + 2;
    for (let offset = 0; offset < maxVisible; offset++) {
      const rowY = bodyRowsStartY + offset;
      const pIdx = profileScrollOffset + offset;
      if (pIdx < profiles.length) {
        clickTargets.push({
          y: currentBodyStartY + rowY,
          type: "item",
          pane: 0,
          index: pIdx,
          xStart: col1XStart,
          xEnd: col1XEnd,
        });
      }
      const aIdx = agentScrollOffset + offset;
      if (aIdx < editingAgentsList.length) {
        clickTargets.push({
          y: currentBodyStartY + rowY,
          type: "item",
          pane: 1,
          index: aIdx,
          xStart: col2XStart,
          xEnd: col2XEnd,
        });
      }
      if (offset < EFFORT_OPTIONS.length) {
        clickTargets.push({
          y: currentBodyStartY + rowY,
          type: "item",
          pane: 2,
          index: offset,
          xStart: col3XStart,
          xEnd: col3XEnd,
        });
      }
    }

    const headerRow = renderThreeColumns(
      [col1Header],
      [col2Header],
      [col3Header],
      colWidths,
      cBorderMuted("│")
    )[0];

    const colHeaderDivider = renderColumnHeaderDivider(colWidths, "─", "┼");
    const bodyRows = renderThreeColumns(
      col1Lines,
      col2Lines,
      col3Lines,
      colWidths,
      cBorderMuted("│")
    );
    const colBottomDivider = renderColumnHeaderDivider(colWidths, "─", "┴");

    const activePaneLabel =
      activePane === "profiles" ? "Perfiles" :
      activePane === "agents" ? "Agentes" : "Effort / Thinking";

    const currentFocusInfo =
      activePane === "profiles"
        ? `${cHeading("Perfil:")} ${cAccent(currentSummary?.name ?? "ninguno")}`
        : activePane === "agents"
          ? `${cHeading("Agente:")} ${cAccent(curAgent)}`
          : `${cHeading("Esfuerzo para:")} ${cAccent(curAgent)} ${cBorderMuted("→")} ${cSuccess(currentAgentEffort)}`;

    const shortcutsLineIndex = header.length + 2 + maxVisible + 3;
    const shortcuts = buildShortcutsLine(shortcutsLineIndex, shortcutDefs, width);

    const footer = [
      cBorderMuted(colBottomDivider),
      `${cHeading("Panel activo:")} ${cHighlight(activePaneLabel)} ${cBorderMuted("│")} ${currentFocusInfo}`,
      "",
      shortcuts,
    ];

    const modalTitle = activePane === "agents"
      ? `✏️ Editar Perfil: ${currentSummary?.name ?? ""}`
      : "🤖 SDD Profile Manager · De y para la Comunidad";

    return frameModal(modalTitle, [...header, headerRow, cBorderMuted(colHeaderDivider), ...bodyRows, ...footer], width, theme, {
      paddingX,
      paddingTop: 1,
      paddingBottom: 0,
    });
  };

  const renderProfilesList = (width: number): string[] => {
    return renderProfilesDashboard(width);
  };

  const renderProfileEditor = (width: number): string[] => {
    activePane = "agents";
    return renderProfilesDashboard(width);
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

    const currentProfileName = selectedProfile()?.name ?? editingProfile?.name ?? "";
    const profBadge = currentProfileName
      ? `${cHeading("Perfil:")} ${cBold(cAccent(currentProfileName))} ${cBorderMuted("│")} `
      : "";

    const filterBox = modelFilter
      ? `${cHeading("Filtrar:")} ${cAccent(modelFilter)}${cHighlight("█")} ${cSecondary(`(${pickerItems.length}/${allPickerModels.length} modelos)`)}`
      : `${cHeading("Filtrar:")} ${cMuted("(escribí cualquier texto para filtrar modelos...)")} ${cSecondary(`(${allPickerModels.length} disponibles)`)}`;

    const header = [
      `${profBadge}${cHeading("Asignar modelo a:")} ${cAccent(titleTarget)}`,
      filterBox,
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

    const shortcutsLineIndex = header.length + listLines.length + 2;
    const shortcuts = buildShortcutsLine(shortcutsLineIndex, [
      { keyTag: "[Escribir]", label: "Filtrar" },
      { keyTag: "[↑/↓]", label: "Navegar" },
      { keyTag: "[Enter]", label: "Elegir", key: "\r" },
      { keyTag: "[Backspace]", label: "Borrar" },
      { keyTag: "[Esc]", label: "Volver", key: "\u001b" },
    ], width);

    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      "",
      shortcuts,
    ];

    const paddingX = width < 90 ? 1 : 2;
    return frameModal("📋 Seleccionar Modelo (con Filtro)", [...header, ...listLines, ...footer], width, theme, {
      paddingX,
      paddingTop: 1,
      paddingBottom: 0,
    });
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

    const currentProfileName = selectedProfile()?.name ?? editingProfile?.name ?? "";
    const profBadge = currentProfileName
      ? `${cHeading("Perfil:")} ${cBold(cAccent(currentProfileName))} ${cBorderMuted("│")} `
      : "";

    const modelInfo = stagedModel ? ` ${cBorderMuted("·")} ${cHeading("Modelo asignado:")} ${cModel(stagedModel)}` : "";

    const header = [
      `${profBadge}${cHeading("Elegir razonamiento para:")} ${cAccent(titleTarget)}${modelInfo}`,
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

    const shortcutsLineIndex = header.length + listLines.length + 2;
    const shortcuts = buildShortcutsLine(shortcutsLineIndex, [
      { keyTag: "[↑/↓]", label: "Navegar" },
      { keyTag: "[Enter]", label: "Confirmar", key: "\r" },
      { keyTag: "[Esc]", label: "Saltear esfuerzo", key: "\u001b" },
    ], width);

    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      "",
      shortcuts,
    ];

    const paddingX = width < 90 ? 1 : 2;
    return frameModal("🧠 Nivel de Razonamiento (Effort)", [...header, ...listLines, ...footer], width, theme, {
      paddingX,
      paddingTop: 1,
      paddingBottom: 0,
    });
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

      // Register global top-right [ x ] close button
      clickTargets.push({
        y: 0,
        type: "action",
        key: "close",
        xStart: Math.max(0, width - 9),
        xEnd: width,
      });

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

      // Instant global close via [ x ] action or Ctrl+Q
      if (key === "close" || key === "ctrl+q") {
        done({ action: "closed" });
        return;
      }

      // --- Sub-View: Choose Scope ---
      if (view === "choose-scope") {
        if (key === "esc") {
          view = "profiles-list";
          activatingProfile = null;
        } else if (key === "q") {
          done({ action: "closed" });
          return;
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
              const newIdx = profiles.findIndex((p) => p.name.toLowerCase() === trimmed.toLowerCase());
              if (newIdx !== -1) selectedProfileIndex = newIdx;
              syncEditingProfile();
              selectedAgentIndex = 0;
              agentScrollOffset = 0;
              activePane = "agents";
              view = "profile-editor";
              newProfileInput = "";
              feedbackMessage = `Perfil "${trimmed}" creado correctamente.`;
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
        if (key === "q") {
          done({ action: "closed" });
          return;
        }
        if (key === "esc") {
          // If a model was staged, apply it without altering effort
          if (stagedModel) {
            applyModelOption(stagedModel);
          }
          stagedModel = undefined;
          view = "profiles-list";
        } else if (key === "up" || key === "k") {
          pickerIndex = Math.max(0, pickerIndex - 1);
        } else if (key === "down" || key === "j") {
          pickerIndex = Math.min(EFFORT_OPTIONS.length - 1, pickerIndex + 1);
        } else if (key === "enter") {
          const chosen = EFFORT_OPTIONS[pickerIndex];
          const effortVal = chosen === "default" ? undefined : chosen;
          if (stagedModel) {
            applyModelOption(stagedModel, effortVal);
          } else {
            applyEffortOption(chosen);
          }
          stagedModel = undefined;
          view = "profiles-list";
        }
        requestRender();
        return;
      }

      // --- Sub-View: Category Picker ---
      if (view === "category-picker") {
        if (key === "esc" || key === "q") {
          view = "profiles-list";
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

      // --- Main 3-Column Dashboard / Profile Editor View ---
      // Tab / Shift-Tab cycle panels
      if (key === "tab") {
        if (activePane === "profiles") activePane = "agents";
        else if (activePane === "agents") activePane = "effort";
        else activePane = "profiles";
        requestRender();
        return;
      }
      if (key === "backtab") {
        if (activePane === "effort") activePane = "agents";
        else if (activePane === "agents") activePane = "profiles";
        else activePane = "effort";
        requestRender();
        return;
      }

      // Left / Right arrow navigation between panels
      if (key === "left" || key === "h") {
        if (activePane === "effort") activePane = "agents";
        else if (activePane === "agents") activePane = "profiles";
        requestRender();
        return;
      }
      if (key === "right" || key === "l") {
        if (activePane === "profiles") activePane = "agents";
        else if (activePane === "agents") activePane = "effort";
        requestRender();
        return;
      }

      // Up / Down navigation within active panel
      if (key === "up" || key === "k") {
        if (activePane === "profiles") {
          selectedProfileIndex = Math.max(0, selectedProfileIndex - 1);
        } else if (activePane === "agents") {
          selectedAgentIndex = Math.max(0, selectedAgentIndex - 1);
        } else {
          selectedEffortIndex = Math.max(0, selectedEffortIndex - 1);
        }
        requestRender();
        return;
      }
      if (key === "down" || key === "j") {
        if (activePane === "profiles") {
          selectedProfileIndex = Math.min(profiles.length - 1, selectedProfileIndex + 1);
        } else if (activePane === "agents") {
          selectedAgentIndex = Math.min(editingAgentsList.length - 1, selectedAgentIndex + 1);
        } else {
          selectedEffortIndex = Math.min(EFFORT_OPTIONS.length - 1, selectedEffortIndex + 1);
        }
        requestRender();
        return;
      }

      // PageUp / PageDown navigation
      if (key === "pageup") {
        if (activePane === "profiles") {
          selectedProfileIndex = Math.max(0, selectedProfileIndex - 5);
        } else if (activePane === "agents") {
          selectedAgentIndex = Math.max(0, selectedAgentIndex - 5);
        }
        requestRender();
        return;
      }
      if (key === "pagedown") {
        if (activePane === "profiles") {
          selectedProfileIndex = Math.min(profiles.length - 1, selectedProfileIndex + 5);
        } else if (activePane === "agents") {
          selectedAgentIndex = Math.min(editingAgentsList.length - 1, selectedAgentIndex + 5);
        }
        requestRender();
        return;
      }
      if (key === "home") {
        if (activePane === "profiles") selectedProfileIndex = 0;
        else if (activePane === "agents") selectedAgentIndex = 0;
        else selectedEffortIndex = 0;
        requestRender();
        return;
      }
      if (key === "end") {
        if (activePane === "profiles") selectedProfileIndex = Math.max(0, profiles.length - 1);
        else if (activePane === "agents") selectedAgentIndex = Math.max(0, editingAgentsList.length - 1);
        else selectedEffortIndex = EFFORT_OPTIONS.length - 1;
        requestRender();
        return;
      }

      // Enter contextual
      if (key === "enter") {
        if (activePane === "profiles") {
          const target = selectedProfile();
          if (target) {
            activatingProfile = target;
            chooseScopeIndex = 0;
            feedbackMessage = null;
            view = "choose-scope";
          }
        } else if (activePane === "agents") {
          const current = selectedAgent();
          stagedModel = undefined;
          if (current === ASSIGN_ALL_SUBAGENTS_KEY) {
            openModelPicker("all-models");
          } else if (current === ASSIGN_ALL_EFFORT_KEY) {
            activePane = "effort";
            pickerTarget = "all-models";
          } else if (current === ASSIGN_CATEGORY_KEY) {
            pickerIndex = 0;
            view = "category-picker";
          } else if (current === ORCHESTRATOR_AGENT_KEY) {
            openModelPicker("default-model");
          } else {
            openModelPicker("agent-model");
          }
        } else if (activePane === "effort") {
          const chosen = EFFORT_OPTIONS[selectedEffortIndex];
          if (chosen) {
            applyEffortOption(chosen);
          }
        }
        requestRender();
        return;
      }

      // Space contextual
      if (key === "space") {
        if (activePane === "effort") {
          const chosen = EFFORT_OPTIONS[selectedEffortIndex];
          if (chosen) {
            applyEffortOption(chosen);
          }
        } else if (activePane === "profiles") {
          const target = selectedProfile();
          if (target) {
            activatingProfile = target;
            chooseScopeIndex = 0;
            feedbackMessage = null;
            view = "choose-scope";
          }
        }
        requestRender();
        return;
      }

      // Action shortcuts
      if (key === "e") {
        if (activePane === "profiles") activePane = "agents";
        else if (activePane === "agents") activePane = "effort";
        else activePane = "agents";
        requestRender();
        return;
      }
      if (key === "m") {
        const current = selectedAgent();
        stagedModel = undefined;
        if (current === ORCHESTRATOR_AGENT_KEY) {
          openModelPicker("default-model");
        } else if (current === ASSIGN_ALL_SUBAGENTS_KEY) {
          openModelPicker("all-models");
        } else {
          openModelPicker("agent-model");
        }
        requestRender();
        return;
      }
      if (key === "a") {
        openModelPicker("all-models");
        requestRender();
        return;
      }
      if (key === "c") {
        pickerIndex = 0;
        view = "category-picker";
        requestRender();
        return;
      }
      if (key === "n") {
        feedbackMessage = null;
        newProfileInput = "";
        view = "create-profile";
        requestRender();
        return;
      }
      if (key === "r") {
        const target = selectedProfile();
        if (target) {
          renamingOldName = target.name;
          renameProfileInput = target.name;
          renameErrorMessage = null;
          feedbackMessage = null;
          view = "rename-profile";
        }
        requestRender();
        return;
      }
      if (key === "d" || key === "delete") {
        const target = selectedProfile();
        if (target) {
          deletingProfileName = target.name;
          feedbackMessage = null;
          view = "confirm-delete";
        }
        requestRender();
        return;
      }
      if (key === "p") {
        const target = selectedProfile();
        if (target) {
          activatingProfile = target;
          executeActivation("project");
        }
        requestRender();
        return;
      }
      if (key === "g") {
        const target = selectedProfile();
        if (target) {
          activatingProfile = target;
          executeActivation("global");
        }
        requestRender();
        return;
      }

      // Close modal with Esc (step-back) or q (instant close)
      if (key === "esc") {
        if (view === "profile-editor" || activePane !== "profiles") {
          view = "profiles-list";
          activePane = "profiles";
          requestRender();
          return;
        }
        done({ action: "closed" });
        return;
      }
      if (key === "q") {
        done({ action: "closed" });
        return;
      }

      requestRender();
    },

    handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
      if (event.type === "wheel") {
        const delta = event.wheelDelta ?? 0;
        if (!delta) return undefined;
        const { x } = event;

        if (view === "profiles-list" || view === "profile-editor") {
          const paddingX = 2;
          const contentWidth = Math.max(1, (event.width || 80) - 2 - paddingX * 2);
          const colWidths = computeThreeColumnWidths(contentWidth);
          const col1End = paddingX + 1 + colWidths.col1;
          const col2End = col1End + 1 + colWidths.col2;

          if (activePane === "agents" || (x > col1End && x <= col2End)) {
            activePane = "agents";
            if (delta > 0) selectedAgentIndex = Math.min(editingAgentsList.length - 1, selectedAgentIndex + 1);
            else if (delta < 0) selectedAgentIndex = Math.max(0, selectedAgentIndex - 1);
          } else if (activePane === "effort" || x > col2End) {
            activePane = "effort";
            if (delta > 0) selectedEffortIndex = Math.min(EFFORT_OPTIONS.length - 1, selectedEffortIndex + 1);
            else if (delta < 0) selectedEffortIndex = Math.max(0, selectedEffortIndex - 1);
          } else {
            activePane = "profiles";
            if (delta > 0) selectedProfileIndex = Math.min(profiles.length - 1, selectedProfileIndex + 1);
            else if (delta < 0) selectedProfileIndex = Math.max(0, selectedProfileIndex - 1);
            syncEditingProfile();
          }
          requestRender();
          return { handled: true, render: true };
        }

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
        const modalWidth = event.width || 80;

        // Instant top-right [ x ] close button click
        if (y === 0 && x >= modalWidth - 9) {
          done({ action: "closed" });
          return { handled: true, render: true };
        }

        const target = clickTargets.find((t) => {
          if (t.y !== y) return false;
          if (t.type === "action") {
            if (t.xStart !== undefined && t.xEnd !== undefined) {
              return x >= t.xStart && x <= t.xEnd;
            }
          }
          if (t.type === "item" && t.xStart !== undefined && t.xEnd !== undefined) {
            return x >= t.xStart && x <= t.xEnd;
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

            if (view === "profiles-list" || view === "profile-editor") {
              if (target.pane === 0) {
                activePane = "profiles";
                if (itemIdx === selectedProfileIndex && clickCount === 2) {
                  modalComponent.handleInput("\r");
                } else {
                  selectedProfileIndex = itemIdx;
                  requestRender();
                }
                return { handled: true, render: true };
              }

              if (target.pane === 1) {
                activePane = "agents";
                if (itemIdx === selectedAgentIndex && clickCount === 2) {
                  modalComponent.handleInput("\r");
                } else {
                  selectedAgentIndex = itemIdx;
                  requestRender();
                }
                return { handled: true, render: true };
              }

              if (target.pane === 2) {
                activePane = "effort";
                selectedEffortIndex = itemIdx;
                const chosen = EFFORT_OPTIONS[itemIdx];
                if (chosen) {
                  applyEffortOption(chosen);
                }
                requestRender();
                return { handled: true, render: true };
              }

              if (itemIdx === selectedProfileIndex || clickCount === 2) {
                selectedProfileIndex = itemIdx;
                modalComponent.handleInput("\r");
              } else {
                selectedProfileIndex = itemIdx;
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
