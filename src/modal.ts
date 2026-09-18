import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ModelProfileEntry, Profile, ProfileSummary, ReasoningEffort } from "./types.js";
import type { TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import { ALL_KNOWN_AGENTS, SDD_AGENT_CATEGORIES, type AgentCategory } from "./catalog.js";
import type { SddProfileManager } from "./manager.js";
import {
  type ModelMetadata,
  getSupportedEffortsForModel,
  DEFAULT_EFFORT_OPTIONS,
} from "./models-resolver.js";
import {
  constrainLines,
  frameModal,
  normalizeModalKey,
  padToVisibleWidth,
  visibleWidth,
  truncateToWidth,
  computeThreeColumnWidths,
  renderThreeColumns,
  renderTwoColumns,
  renderColumnHeaderDivider,
  type ColumnWidths,
} from "./modal-formatting.js";

export type ModalView =
  | "profiles-list"
  | "choose-scope"
  | "create-profile"
  | "rename-profile"
  | "confirm-delete"
  | "export-profile"
  | "import-profile"
  | "import-conflict"
  | "profile-editor"
  | "model-picker"
  | "effort-picker"
  | "category-picker";

export type ActivePane = "profiles" | "agents" | "effort";

export interface ModalInput {
  manager: SddProfileManager;
  availableModels: string[];
  modelsMetadata?: Record<string, ModelMetadata>;
  theme?: any;
  tui?: { requestRender?: () => void; height?: number };
  onProfileActivated?: (profile: Profile) => Promise<void> | void;
  done: (result?: { action: "activated" | "saved" | "closed"; profileName?: string }) => void;
}

export const ORCHESTRATOR_AGENT_KEY = "👑 Orquestador (Sesión Principal)";
export const ASSIGN_ALL_SUBAGENTS_KEY = "⚡ [Asignar un mismo modelo a TODOS los subagentes...]";
export const ASSIGN_ALL_EFFORT_KEY = "🧠 [Asignar un mismo nivel de esfuerzo a TODOS los subagentes...]";
export const ASSIGN_CATEGORY_KEY = "📦 [Asignar modelo por Categoría...]";

export const EFFORT_OPTIONS: Array<ReasoningEffort | "default"> = DEFAULT_EFFORT_OPTIONS;

export interface TreeItem {
  type: "orchestrator" | "all-subagents" | "all-effort" | "category" | "agent";
  id: string;
  name: string;
  category?: AgentCategory;
  depth: number;
}

export function createSddProfilesModal(input: ModalInput) {
  const { manager, theme, tui, done, onProfileActivated } = input;
  const availableModels = input.availableModels;
  const modelsMetadata = input.modelsMetadata;

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

  // State for export & import views
  let exportingProfileName = "";
  let exportPathInput = "";
  let exportErrorMessage: string | null = null;

  let importScope: "project" | "global" = "project";
  let importErrorMessage: string | null = null;
  let browserCurrentDir = os.homedir();
  let browserEntries: Array<{ name: string; isDir: boolean; fullPath: string }> = [];
  let browserIndex = 0;
  let browserScrollOffset = 0;
  let manualPathInput = "";
  let isManualPathMode = false;

  // Conflict resolution state on import
  let pendingImportPath = "";
  let pendingImportOriginalName = "";
  let pendingImportSuggestedName = "";
  let conflictRenameInput = "";
  let conflictRenameMode = false;
  let conflictErrorMessage: string | null = null;

  const loadBrowserEntries = (dir: string) => {
    try {
      const dirents = fs.readdirSync(dir, { withFileTypes: true });
      const entries: Array<{ name: string; isDir: boolean; fullPath: string }> = [];

      // Add parent directory navigation if not at root
      const parentDir = path.dirname(dir);
      if (parentDir !== dir) {
        entries.push({ name: ".. (Subir de nivel)", isDir: true, fullPath: parentDir });
      }

      // Collect directories and .json files
      const dirs: Array<{ name: string; isDir: boolean; fullPath: string }> = [];
      const files: Array<{ name: string; isDir: boolean; fullPath: string }> = [];

      for (const d of dirents) {
        // Skip hidden files/dirs except standard parent
        if (d.name.startsWith(".")) continue;
        const full = path.join(dir, d.name);
        try {
          if (d.isDirectory()) {
            dirs.push({ name: d.name, isDir: true, fullPath: full });
          } else if (d.isFile() && d.name.toLowerCase().endsWith(".json")) {
            files.push({ name: d.name, isDir: false, fullPath: full });
          }
        } catch {
          // Ignore permission denied or inaccessible entries
        }
      }

      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));

      browserEntries = [...entries, ...dirs, ...files];
      browserIndex = 0;
      browserScrollOffset = 0;
      importErrorMessage = null;
    } catch (err: any) {
      importErrorMessage = `No se puede leer la carpeta: ${err.message || String(err)}`;
      browserEntries = [
        { name: ".. (Subir de nivel)", isDir: true, fullPath: path.dirname(dir) },
      ];
      browserIndex = 0;
      browserScrollOffset = 0;
    }
  };

  // Editing state for agents (Col 2)
  let editingProfile: Profile | null = null;
  let expandedCategories = new Set<string>(["sdd-core"]);
  let selectedAgentIndex = 0;
  let agentScrollOffset = 0;
  let isDirty = false;

  const selectedProfile = (): ProfileSummary | undefined => {
    return profiles[selectedProfileIndex];
  };

  const getVisibleTreeItems = (): TreeItem[] => {
    const items: TreeItem[] = [
      {
        type: "orchestrator",
        id: ORCHESTRATOR_AGENT_KEY,
        name: "👑 Orquestador",
        depth: 0,
      },
      {
        type: "all-subagents",
        id: ASSIGN_ALL_SUBAGENTS_KEY,
        name: "⚡ Asignar un mismo modelo a TODOS",
        depth: 0,
      },
      {
        type: "all-effort",
        id: ASSIGN_ALL_EFFORT_KEY,
        name: "🧠 Esfuerzo a todos los subagentes",
        depth: 0,
      },
    ];

    const categories = manager.getCategories
      ? manager.getCategories(editingProfile ?? undefined)
      : SDD_AGENT_CATEGORIES;

    for (const cat of categories) {
      const isExpanded = expandedCategories.has(cat.id);
      items.push({
        type: "category",
        id: cat.id,
        name: cat.name,
        category: cat,
        depth: 0,
      });

      if (isExpanded) {
        for (const ag of cat.agents) {
          items.push({
            type: "agent",
            id: ag,
            name: ag,
            category: cat,
            depth: 1,
          });
        }
      }
    }

    return items;
  };

  const selectedTreeItem = (): TreeItem => {
    const items = getVisibleTreeItems();
    if (selectedAgentIndex >= items.length) {
      selectedAgentIndex = Math.max(0, items.length - 1);
    }
    return items[selectedAgentIndex] ?? items[0];
  };

  const selectedAgent = (): string => {
    const item = selectedTreeItem();
    if (!item) return ORCHESTRATOR_AGENT_KEY;
    if (item.type === "agent") return item.id;
    if (item.type === "category") return item.name;
    return item.id;
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

  // Two-column Model Picker state
  let pickerActivePane: "providers" | "models" = "models";
  let pickerProviders: string[] = [];
  let selectedProviderIndex = 0;
  let providerScrollOffset = 0;
  // Map of provider -> array of model IDs
  let modelsByProvider: Map<string, string[]> = new Map();

  // Feedback and model search filter state
  let feedbackMessage: string | null = null;
  let modelFilter = "";
  let allPickerModels: string[] = [];

  const extractProvider = (modelId: string): string => {
    const parts = modelId.split("/");
    if (parts.length >= 3 && parts[0] === "cpamc") {
      // e.g. cpamc/cin82/gemini-3.8-flash-high -> show account cleanly as "cin82"
      return parts[1];
    }
    if (parts.length >= 2) {
      // e.g. anthropic/claude-3-7-sonnet -> "anthropic"
      return parts[0];
    }
    return "otros";
  };

  const rebuildProviderGroups = () => {
    modelsByProvider.clear();
    const query = modelFilter.trim().toLowerCase();
    const tokens = query ? query.split(/\s+/).filter(Boolean) : [];

    // Filter matching models
    const filtered = allPickerModels.filter((model) => {
      if (tokens.length === 0) return true;
      const lower = model.toLowerCase();
      return tokens.every((token) => lower.includes(token));
    });

    for (const model of filtered) {
      const prov = extractProvider(model);
      if (!modelsByProvider.has(prov)) {
        modelsByProvider.set(prov, []);
      }
      modelsByProvider.get(prov)!.push(model);
    }

    pickerProviders = Array.from(modelsByProvider.keys()).sort((a, b) => {
      // Prioritize personal accounts (cin82, cinlo, etc.) before standard providers
      const aIsCin = a.startsWith("cin");
      const bIsCin = b.startsWith("cin");
      if (aIsCin && !bIsCin) return -1;
      if (!aIsCin && bIsCin) return 1;
      return a.localeCompare(b);
    });

    if (selectedProviderIndex >= pickerProviders.length) {
      selectedProviderIndex = Math.max(0, pickerProviders.length - 1);
    }

    const currentProvider = pickerProviders[selectedProviderIndex];
    pickerItems = currentProvider ? (modelsByProvider.get(currentProvider) ?? []) : [];

    if (pickerIndex >= pickerItems.length) {
      pickerIndex = Math.max(0, pickerItems.length - 1);
    }
  };

  const applyModelFilter = () => {
    rebuildProviderGroups();
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
    pickerActivePane = "models";
    selectedProviderIndex = 0;
    providerScrollOffset = 0;
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

  const getCurrentAgentEffort = (fullProf: Profile | null, _agentName?: string): ReasoningEffort | "default" => {
    if (!fullProf) return "default";
    const item = selectedTreeItem();
    if (!item || item.type === "orchestrator" || item.type === "all-subagents" || item.type === "all-effort") {
      return fullProf.default_effort ?? "default";
    }
    if (item.type === "category" && item.category) {
      const efforts = item.category.agents.map(
        (ag) => fullProf.model_profiles[ag]?.effort ?? fullProf.default_effort ?? "default"
      );
      if (efforts.length > 0 && efforts.every((e) => e === efforts[0])) {
        return efforts[0];
      }
      return "default";
    }
    return fullProf.model_profiles[item.id]?.effort ?? fullProf.default_effort ?? "default";
  };

  const getCurrentTargetModel = (): string | undefined => {
    const prof = editingProfile ?? (selectedProfile() ? manager.getProfile(selectedProfile()!.name) : null);
    if (!prof) return undefined;

    const item = selectedTreeItem();
    if (!item || item.type === "orchestrator") {
      return prof.default_model;
    }
    if (item.type === "agent") {
      return prof.model_profiles[item.id]?.model ?? prof.default_model;
    }
    if (item.type === "category" && item.category) {
      const models = item.category.agents
        .map((ag) => prof.model_profiles[ag]?.model ?? prof.default_model)
        .filter(Boolean);
      if (models.length > 0 && models.every((m) => m === models[0])) {
        return models[0];
      }
      return undefined;
    }
    return undefined;
  };

  const getCol3EffortOptions = (): Array<ReasoningEffort | "default"> => {
    const model = getCurrentTargetModel();
    const supported = getSupportedEffortsForModel(model, modelsMetadata);
    const prof = editingProfile ?? (selectedProfile() ? manager.getProfile(selectedProfile()!.name) : null);
    const currentEffort = getCurrentAgentEffort(prof);
    if (currentEffort !== "default" && !supported.includes(currentEffort)) {
      return [...supported, currentEffort];
    }
    return supported;
  };

  const getPickerEffortOptions = (): Array<ReasoningEffort | "default"> => {
    const model = stagedModel ?? getCurrentTargetModel();
    return getSupportedEffortsForModel(model, modelsMetadata);
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
    const item = selectedTreeItem();

    if (pickerTarget === "all-models" || item.type === "all-subagents" || item.type === "all-effort") {
      if (effortVal) fullProfile.default_effort = effortVal;
      else delete fullProfile.default_effort;
      const allAgents = manager.getAllAgents
        ? manager.getAllAgents(fullProfile)
        : ALL_KNOWN_AGENTS;
      for (const ag of allAgents) {
        const entryModel = fullProfile.model_profiles[ag]?.model ?? fullProfile.default_model ?? "default";
        if (effortVal) {
          fullProfile.model_profiles[ag] = { model: entryModel, effort: effortVal };
        } else {
          fullProfile.model_profiles[ag] = { model: entryModel };
        }
      }
      pickerTarget = "agent-model";
      feedbackMessage = `Esfuerzo "${effort}" guardado para todos los subagentes.`;
    } else if (item.type === "orchestrator") {
      if (effortVal) fullProfile.default_effort = effortVal;
      else delete fullProfile.default_effort;
      feedbackMessage = `Esfuerzo "${effort}" guardado para Orquestador.`;
    } else if (item.type === "category") {
      const categories = manager.getCategories
        ? manager.getCategories(fullProfile)
        : SDD_AGENT_CATEGORIES;
      const cat = categories.find((c) => c.name === item.name || c.id === item.id) ?? item.category;
      const agents = cat?.agents ?? [];
      for (const ag of agents) {
        const currentModel = fullProfile.model_profiles[ag]?.model ?? fullProfile.default_model ?? "default";
        if (effortVal) {
          fullProfile.model_profiles[ag] = { model: currentModel, effort: effortVal };
        } else {
          fullProfile.model_profiles[ag] = { model: currentModel };
        }
      }
      feedbackMessage = `Esfuerzo "${effort}" guardado para categoría ${item.name}.`;
    } else {
      const currentModel = fullProfile.model_profiles[item.id]?.model ?? fullProfile.default_model ?? "default";
      if (effortVal) {
        fullProfile.model_profiles[item.id] = { model: currentModel, effort: effortVal };
      } else {
        fullProfile.model_profiles[item.id] = { model: currentModel };
      }
      feedbackMessage = `Esfuerzo "${effort}" guardado para ${item.name}.`;
    }

    manager.createProfile(fullProfile);
    refreshProfiles();
    syncEditingProfile();
    if (activeProfileName && profSummary.name.toLowerCase() === activeProfileName.toLowerCase()) {
      onProfileActivated?.(fullProfile);
    }
  };

  const applyModelOption = (chosenModel: string, effortVal?: ReasoningEffort) => {
    const profSummary = selectedProfile();
    if (!profSummary) return;
    const fullProfile = manager.getProfile(profSummary.name);
    if (!fullProfile) return;

    if (!fullProfile.model_profiles) fullProfile.model_profiles = {};

    if (pickerTarget === "category-models" && targetCategory) {
      const categories = manager.getCategories
        ? manager.getCategories(fullProfile)
        : SDD_AGENT_CATEGORIES;
      const cat = categories.find((c) => c.name === targetCategory || c.id === targetCategory);
      if (cat) {
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
      const allAgents = manager.getAllAgents
        ? manager.getAllAgents(fullProfile)
        : ALL_KNOWN_AGENTS;
      for (const ag of allAgents) {
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

  /**
   * Computes the adaptive max visible items for lists and columns.
   * Defaults to 15 rows, but gracefully bounds down on small terminal heights.
   */
  const computeMaxVisible = (defaultTarget = 15, reservedRows = 12): number => {
    const termRows = (typeof tui?.height === "number" && tui.height > 0)
      ? tui.height
      : (process.stdout?.rows && process.stdout.rows > 0 ? process.stdout.rows : 0);

    if (termRows > 0) {
      // Allow up to defaultTarget, but ensure it fits within terminal height minus reserved header/footer rows
      const available = Math.max(6, termRows - reservedRows);
      return Math.min(defaultTarget, available);
    }
    return defaultTarget;
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
    const maxVisible = computeMaxVisible(15, 12);
    clickTargets = [];

    const clampedProfiles = clampList(selectedProfileIndex, profileScrollOffset, profiles.length, maxVisible);
    selectedProfileIndex = clampedProfiles.index;
    profileScrollOffset = clampedProfiles.scroll;

    const visibleProfiles = profiles.slice(profileScrollOffset, profileScrollOffset + maxVisible);

    const currentSummary = selectedProfile();
    const currentFullProfile = currentSummary ? manager.getProfile(currentSummary.name) : null;

    const visibleTreeItems = getVisibleTreeItems();
    const clampedAgents = clampList(selectedAgentIndex, agentScrollOffset, visibleTreeItems.length, maxVisible);
    selectedAgentIndex = clampedAgents.index;
    agentScrollOffset = clampedAgents.scroll;

    const curTreeItem = selectedTreeItem();
    const currentAgentEffort = currentFullProfile ? getCurrentAgentEffort(currentFullProfile, curTreeItem.id) : "default";
    const col3Options = getCol3EffortOptions();

    if (activePane !== "effort") {
      const effIdx = col3Options.indexOf(currentAgentEffort);
      selectedEffortIndex = effIdx !== -1 ? effIdx : 0;
    } else {
      selectedEffortIndex = Math.min(Math.max(0, selectedEffortIndex), Math.max(0, col3Options.length - 1));
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

    const shortcutDefs: ShortcutDef[] = width < 90
      ? [
          { keyTag: "[Enter]", label: activePane === "effort" ? "Elegir" : activePane === "agents" ? "Modelo" : "Activar", key: "\r" },
          { keyTag: "[e]", label: "Edit", key: "e" },
          { keyTag: "[n]", label: "Nuevo", key: "n" },
          ...(activePane === "profiles"
            ? [
                { keyTag: "[x]", label: "Export", key: "x" },
                { keyTag: "[i]", label: "Import", key: "i" },
              ]
            : []),
          { keyTag: "[Esc]", label: "Salir", key: "\u001b" },
        ]
      : [
          { keyTag: "[Enter]", label: activePane === "effort" ? "Elegir" : activePane === "agents" ? "Modelo" : "Activar", key: "\r" },
          { keyTag: "[e]", label: "Edit", key: "e" },
          ...(activePane === "agents" ? [{ keyTag: "[a]", label: "Todos", key: "a" }] : []),
          { keyTag: "[n]", label: "Nuevo", key: "n" },
          ...(activePane === "profiles"
            ? [
                { keyTag: "[x]", label: "Export", key: "x" },
                { keyTag: "[i]", label: "Import", key: "i" },
              ]
            : []),
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
      ? `${cHighlight(`› ${profTag} Agentes`)} ${cSecondary(`(${selectedAgentIndex + 1}/${visibleTreeItems.length})`)}`
      : `${cHeading(`  ${profTag} Agentes`)} ${cDim(`(${visibleTreeItems.length})`)}`;

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
      if (idx < visibleTreeItems.length) {
        const item = visibleTreeItems[idx];
        const isSelected = idx === selectedAgentIndex;
        const cursor = isSelected
          ? (activePane === "agents" ? cHighlight("› ") : cAccent("▸ "))
          : "  ";

        if (item.type === "orchestrator") {
          const modelRaw = currentFullProfile?.default_model;
          const modelLabel = modelRaw ? cModel(shortenModel(modelRaw, Math.max(8, colWidths.col2 - 18))) : cDim("(no def)");
          const label = isSelected ? cBold(cAccent("👑 Orquestador")) : cHeading("👑 Orquestador");
          col2Lines.push(`${cursor}${label} ${cBorderMuted("·")} ${modelLabel}`);
        } else if (item.type === "all-subagents") {
          const shortAction = "⚡ Asignar un mismo modelo a TODOS";
          const label = isSelected ? cBold(cHighlight(shortAction)) : cWarning(shortAction);
          col2Lines.push(`${cursor}${label}`);
        } else if (item.type === "all-effort") {
          const shortAction = "🧠 Esfuerzo a todos los subagentes";
          const label = isSelected ? cBold(cHighlight(shortAction)) : cWarning(shortAction);
          col2Lines.push(`${cursor}${label}`);
        } else if (item.type === "category") {
          const cat = item.category!;
          const isExpanded = expandedCategories.has(cat.id);
          const foldIcon = isExpanded ? "▼" : "►";
          let sharedModel: string | null = null;
          if (currentFullProfile) {
            const models = cat.agents.map(
              (ag) => currentFullProfile.model_profiles[ag]?.model ?? currentFullProfile.default_model ?? "default"
            );
            if (models.length > 0 && models.every((m) => m === models[0])) {
              sharedModel = models[0];
            }
          }
          const badge = sharedModel
            ? ` ${cBorderMuted("·")} ${cModel(shortenModel(sharedModel, Math.max(6, colWidths.col2 - item.name.length - 12)))}`
            : ` ${cSecondary(`(${cat.agents.length})`)}`;
          const label = isSelected
            ? cBold(cHighlight(`${foldIcon} 📦 ${item.name}`))
            : cAccent(`${foldIcon} 📦 ${item.name}`);
          col2Lines.push(`${cursor}${label}${badge}`);
        } else {
          const assignment = currentFullProfile?.model_profiles[item.id];
          const isExplicit = !!assignment?.model;
          const rawModel = assignment?.model ?? currentFullProfile?.default_model ?? "default";
          const maxModelLen = Math.max(8, colWidths.col2 - item.name.length - 8);
          const modelLabel = isExplicit
            ? cModel(shortenModel(rawModel, maxModelLen))
            : cDim(shortenModel(rawModel, maxModelLen));
          const label = isSelected ? cBold(cText(`  ${item.name}`)) : cMuted(`  ${item.name}`);
          col2Lines.push(`${cursor}${label} ${cBorderMuted("·")} ${modelLabel}`);
        }
      } else {
        col2Lines.push("");
      }
    }

    const col3Lines: string[] = [];
    for (let offset = 0; offset < maxVisible; offset++) {
      if (offset < col3Options.length) {
        const opt = col3Options[offset];
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
      } else if (offset === col3Options.length && col3Options.length === 1 && col3Options[0] === "default") {
        col3Lines.push(cDim("  (sin razonamiento)"));
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
      if (aIdx < visibleTreeItems.length) {
        clickTargets.push({
          y: currentBodyStartY + rowY,
          type: "item",
          pane: 1,
          index: aIdx,
          xStart: col2XStart,
          xEnd: col2XEnd,
        });
      }
      if (offset < col3Options.length) {
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

    const curAgent = selectedAgent();
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
      cDim("─".repeat(contentWidth)),
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

  // View: Export Profile
  const renderExportProfile = (width: number): string[] => {
    const header = [
      cHeading("📦 Exportar perfil SDD:"),
      `${cHeading("Perfil:")} ${cBold(cAccent(exportingProfileName))}`,
      cText("Escribí la ruta del archivo de destino (.json) y presioná [Enter]."),
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const inputLine = `  ${cHeading("Ruta destino:")} ${cAccent(exportPathInput || "...")}${cHighlight("█")}`;
    const errorLine = exportErrorMessage ? cError(`  ✖ ${exportErrorMessage}`) : "";

    const shortcuts = buildShortcutsLine(7, [
      { keyTag: "[Enter]", label: "Exportar Archivo", key: "\r" },
      { keyTag: "[Esc]", label: "Cancelar", key: "\u001b" },
    ], width);

    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      shortcuts,
    ];

    return frameModal("📦 Exportar Perfil SDD", [...header, "", inputLine, errorLine, ...footer], width, theme);
  };

  // View: Import Profile (Universal File Browser)
  const renderImportProfile = (width: number): string[] => {
    const scopeProj = importScope === "project" ? cBold(cSuccess("● [1] Proyecto (.pi/profiles/)")) : cDim("○ [1] Proyecto (.pi/profiles/)");
    const scopeGlob = importScope === "global" ? cBold(cSuccess("● [2] Global (~/.pi/agent/profiles/)")) : cDim("○ [2] Global (~/.pi/agent/profiles/)");
    const scopeLine = `  ${cHeading("Ámbito destino:")} ${scopeProj}   ${scopeGlob}`;
    const errorLine = importErrorMessage ? cError(`  ✖ ${importErrorMessage}`) : "";

    if (isManualPathMode) {
      const header = [
        cHeading("📥 Importar perfil SDD (Ruta manual):"),
        cText("Escribí o pegá la ruta completa del archivo .json y presioná [Enter]."),
        cBorderMuted("═".repeat(Math.max(10, width - 6))),
      ];

      const inputLine = `  ${cHeading("Ruta archivo:")} ${cAccent(manualPathInput || "...")}${cHighlight("█")}`;

      const shortcuts = buildShortcutsLine(8, [
        { keyTag: "[1/2/Tab]", label: "Ámbito", key: "\t" },
        { keyTag: "[Enter]", label: "Importar", key: "\r" },
        { keyTag: "[Esc]", label: "Volver al explorador", key: "\u001b" },
      ], width);

      const footer = [
        cBorderMuted("═".repeat(Math.max(10, width - 6))),
        shortcuts,
      ];

      return frameModal("📥 Importar Perfil SDD", [...header, "", inputLine, "", scopeLine, errorLine, ...footer], width, theme);
    }

    const maxVisible = computeMaxVisible(15, 10);
    const clamped = clampList(browserIndex, browserScrollOffset, browserEntries.length, maxVisible);
    browserIndex = clamped.index;
    browserScrollOffset = clamped.scroll;

    // Display home directory as '~' for aesthetics
    const displayDir = browserCurrentDir.startsWith(os.homedir())
      ? "~" + browserCurrentDir.slice(os.homedir().length)
      : browserCurrentDir;

    const header = [
      cHeading("📥 Importar perfil SDD (Explorador de archivos):"),
      `${cHeading("Carpeta actual:")} ${cAccent(displayDir || "/")}`,
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const listLines: string[] = [];
    const baseOffset = header.length + 1;

    if (browserEntries.length === 0) {
      listLines.push(cDim("  (No hay carpetas ni archivos .json en esta ubicación)"));
    } else {
      const visibleEntries = browserEntries.slice(browserScrollOffset, browserScrollOffset + maxVisible);
      for (const [vIdx, entry] of visibleEntries.entries()) {
        const actualIdx = browserScrollOffset + vIdx;
        registerItemTarget(baseOffset + vIdx, actualIdx);

        const isSelected = actualIdx === browserIndex;
        const cursor = isSelected ? cHighlight("› ") : "  ";
        const icon = entry.isDir ? "📁 " : "📄 ";
        const nameStyled = entry.isDir
          ? (isSelected ? cBold(cHeading(entry.name)) : cText(entry.name))
          : (isSelected ? cBold(cSuccess(entry.name)) : cSuccess(entry.name));

        const badge = entry.isDir ? cDim(" [Carpeta]") : cSecondary(" [Perfil JSON]");
        listLines.push(`${cursor}${icon}${nameStyled}${badge}`);
      }
    }

    const shortcuts = buildShortcutsLine(8, [
      { keyTag: "[Enter]", label: "Abrir / Seleccionar", key: "\r" },
      { keyTag: "[1/2/Tab]", label: "Ámbito", key: "\t" },
      { keyTag: "[m]", label: "Ruta Manual", key: "m" },
      { keyTag: "[Esc]", label: "Cancelar", key: "\u001b" },
    ], width);

    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      scopeLine,
      errorLine,
      shortcuts,
    ];

    return frameModal("📥 Importar Perfil SDD", [...header, ...listLines, ...footer], width, theme);
  };

  // View: Import Conflict Resolution View
  const renderImportConflict = (width: number): string[] => {
    const header = [
      cWarning("⚠️ Conflicto al importar perfil SDD"),
      `${cHeading("El perfil ya existe:")} ${cBold(cAccent(pendingImportOriginalName))}`,
      `${cHeading("Origen:")} ${cDim(pendingImportPath)}`,
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    if (conflictRenameMode) {
      const renameHeader = [
        cText("  Escribí un nuevo nombre para el perfil importado y presioná [Enter]:"),
        "",
        `    ${cHeading("Nuevo nombre:")} ${cAccent(conflictRenameInput || "...")}${cHighlight("█")}`,
        conflictErrorMessage ? cError(`    ✖ ${conflictErrorMessage}`) : "",
        "",
      ];

      const shortcuts = buildShortcutsLine(6, [
        { keyTag: "[Enter]", label: "Guardar e Importar", key: "\r" },
        { keyTag: "[Esc]", label: "Volver", key: "\u001b" },
      ], width);

      const footer = [
        cBorderMuted("═".repeat(Math.max(10, width - 6))),
        shortcuts,
      ];

      return frameModal("✏️ Renombrar Perfil Importado", [...header, ...renameHeader, ...footer], width, theme);
    }

    const body = [
      "",
      cText("  Ya existe un perfil con este nombre en tu configuración."),
      cText("  ¿Cómo deseás proceder?"),
      "",
      `  ${cHeading("[1 / o]")} ${cBold(cWarning("Sobreescribir"))} ${cDim("Reemplazar el perfil existente con el del archivo")}`,
      `  ${cHeading("[2 / r]")} ${cBold(cSuccess("Renombrar"))}     ${cDim(`Importar con otro nombre (sugerido: "${pendingImportSuggestedName}")`)}`,
      `  ${cHeading("[Esc]")}   ${cBold(cText("Cancelar"))}      ${cDim("Descartar importación y volver")}`,
      "",
    ];

    const shortcuts = buildShortcutsLine(6, [
      { keyTag: "[1 / o]", label: "Sobreescribir", key: "1" },
      { keyTag: "[2 / r]", label: "Renombrar", key: "2" },
      { keyTag: "[Esc]", label: "Cancelar", key: "\u001b" },
    ], width);

    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      shortcuts,
    ];

    return frameModal("⚠️ Conflicto de Perfil", [...header, ...body, ...footer], width, theme);
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

  // View: Model Picker (Two-Column Master-Detail)
  const renderModelPicker = (width: number): string[] => {
    const maxVisible = computeMaxVisible(15, 10);

    // Make sure provider groups are up to date
    if (pickerProviders.length === 0 && allPickerModels.length > 0) {
      rebuildProviderGroups();
    }

    const currentProvider = pickerProviders[selectedProviderIndex] ?? "";
    pickerItems = currentProvider ? (modelsByProvider.get(currentProvider) ?? []) : [];

    const clampedProv = clampList(selectedProviderIndex, providerScrollOffset, pickerProviders.length, maxVisible);
    selectedProviderIndex = clampedProv.index;
    providerScrollOffset = clampedProv.scroll;

    const clampedModel = clampList(pickerIndex, pickerScrollOffset, pickerItems.length, maxVisible);
    pickerIndex = clampedModel.index;
    pickerScrollOffset = clampedModel.scroll;

    const visibleProviders = pickerProviders.slice(providerScrollOffset, providerScrollOffset + maxVisible);
    const visibleModels = pickerItems.slice(pickerScrollOffset, pickerScrollOffset + maxVisible);

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

    // Resolve currently assigned model for the target agent/orchestrator/category
    const fullProfile = currentProfileName ? manager.getProfile(currentProfileName) : null;
    let currentAssignedModel = "";
    if (fullProfile) {
      if (pickerTarget === "default-model" || (pickerTarget === "agent-model" && selectedAgent() === ORCHESTRATOR_AGENT_KEY)) {
        currentAssignedModel = fullProfile.default_model ?? "";
      } else if (pickerTarget === "category-models" && targetCategory) {
        const categories = manager.getCategories
          ? manager.getCategories(fullProfile)
          : SDD_AGENT_CATEGORIES;
        const cat = categories.find((c) => c.name === targetCategory || c.id === targetCategory);
        if (cat && cat.agents.length > 0) {
          const models = cat.agents.map((ag) => fullProfile.model_profiles?.[ag]?.model ?? fullProfile.default_model ?? "");
          if (models.every((m) => m === models[0] && m)) {
            currentAssignedModel = models[0];
          } else {
            currentAssignedModel = "(mixto / varios modelos)";
          }
        }
      } else if (pickerTarget === "all-models") {
        const allAgents = manager.getAllAgents
          ? manager.getAllAgents(fullProfile)
          : ALL_KNOWN_AGENTS;
        const models = allAgents.map((ag) => fullProfile.model_profiles?.[ag]?.model ?? fullProfile.default_model ?? "");
        if (models.every((m) => m === models[0] && m)) {
          currentAssignedModel = models[0];
        } else {
          currentAssignedModel = "(mixto / varios modelos)";
        }
      } else if (pickerTarget === "agent-model") {
        const ag = selectedAgent();
        currentAssignedModel = fullProfile.model_profiles?.[ag]?.model ?? fullProfile.default_model ?? "";
      }
    }

    const currentLine = currentAssignedModel
      ? `${cHeading("Actual:")} ${cModel(currentAssignedModel)}`
      : "";

    const filterBox = modelFilter
      ? `${cHeading("Filtrar:")} ${cAccent(modelFilter)}${cHighlight("█")} ${cSecondary(`(${pickerItems.length} en proveedor · ${allPickerModels.length} total)`)}`
      : `${cHeading("Filtrar:")} ${cMuted("(escribí para filtrar proveedores o modelos...)")} ${cSecondary(`(${allPickerModels.length} disponibles)`)}`;

    const header = [
      `${profBadge}${cHeading("Asignar modelo a:")} ${cAccent(titleTarget)}`,
      ...(currentLine ? [currentLine] : []),
      filterBox,
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
    ];

    const paddingX = width < 90 ? 1 : 2;
    const innerWidth = Math.max(1, width - 2);
    const contentWidth = Math.max(1, innerWidth - (paddingX * 2));

    // Two-column widths: Left (Providers) ~35-40%, Right (Models) remainder
    const leftColWidth = Math.max(22, Math.min(34, Math.floor(contentWidth * 0.38)));
    const rightColWidth = Math.max(20, contentWidth - leftColWidth - 1); // 1 for divider

    // Column Headers
    const col1Header = pickerActivePane === "providers"
      ? `${cHighlight("› Proveedores")} ${cSecondary(`(${selectedProviderIndex + 1}/${pickerProviders.length})`)}`
      : `${cHeading("  Proveedores")} ${cDim(`(${pickerProviders.length})`)}`;

    const col2Header = pickerActivePane === "models"
      ? `${cHighlight("› Modelos disponibles")} ${cSecondary(`(${selectedProviderIndex >= 0 ? pickerItems.length : 0})`)}`
      : `${cHeading("  Modelos disponibles")} ${cDim(`(${pickerItems.length})`)}`;

    const col1Lines: string[] = [col1Header];
    const col2Lines: string[] = [col2Header];

    const headerDivider = `${cBorderMuted("─".repeat(leftColWidth))}┼${cBorderMuted("─".repeat(rightColWidth))}`;

    const baseOffset = header.length + 2; // header + col headers + divider

    // Left Column: Providers
    if (pickerProviders.length === 0) {
      col1Lines.push(cDim("  (Sin proveedores)"));
    } else {
      for (const [offset, prov] of visibleProviders.entries()) {
        const actualIdx = providerScrollOffset + offset;
        const isSelected = actualIdx === selectedProviderIndex;
        const count = modelsByProvider.get(prov)?.length ?? 0;

        const cursor = isSelected ? (pickerActivePane === "providers" ? cHighlight("› ") : cDim("› ")) : "  ";
        const provFormatted = isSelected
          ? (pickerActivePane === "providers" ? cBold(cAccent(prov)) : cAccent(prov))
          : cHeading(prov);
        const countBadge = ` ${cDim(`(${count})`)}`;

        col1Lines.push(`${cursor}${provFormatted}${countBadge}`);
      }
    }

    // Right Column: Models of current provider
    if (pickerItems.length === 0) {
      if (modelFilter) {
        col2Lines.push(cWarning("  Ningún modelo coincide"));
      } else {
        col2Lines.push(cDim("  (Seleccioná un proveedor)"));
      }
    } else {
      for (const [offset, modelId] of visibleModels.entries()) {
        const actualIdx = pickerScrollOffset + offset;
        const isSelected = actualIdx === pickerIndex;

        // Clean model name: strip provider prefix if matches
        let cleanName = modelId;
        if (currentProvider && modelId.startsWith(currentProvider + "/")) {
          cleanName = modelId.slice(currentProvider.length + 1);
        } else {
          const lastSlash = modelId.lastIndexOf("/");
          if (lastSlash !== -1) {
            cleanName = modelId.slice(lastSlash + 1);
          }
        }

        const cursor = isSelected ? (pickerActivePane === "models" ? cHighlight("› ") : cDim("› ")) : "  ";
        const isCurrent = currentAssignedModel && (modelId === currentAssignedModel || cleanName === currentAssignedModel);
        const currentBadge = isCurrent ? ` ${cSuccess("● (actual)")}` : "";

        const modelFormatted = isSelected
          ? (pickerActivePane === "models" ? cBold(cAccent(cleanName)) : cAccent(cleanName))
          : cModel(cleanName);

        col2Lines.push(`${cursor}${modelFormatted}${currentBadge}`);
      }
    }

    // Equalize lines to maxVisible + 1 (header)
    while (col1Lines.length < maxVisible + 1) col1Lines.push("");
    while (col2Lines.length < maxVisible + 1) col2Lines.push("");

    // Cut off header to render separately above horizontal divider
    const c1Head = col1Lines[0]!;
    const c2Head = col2Lines[0]!;
    const c1Body = col1Lines.slice(1);
    const c2Body = col2Lines.slice(1);

    const headRow = `${padToVisibleWidth(c1Head, leftColWidth)}│${padToVisibleWidth(c2Head, rightColWidth)}`;
    const bodyRows = renderTwoColumns(c1Body, c2Body, leftColWidth, rightColWidth, "│");

    const shortcuts = buildShortcutsLine(baseOffset + maxVisible + 1, [
      { keyTag: "[Tab / ←/→]", label: "Alternar Panel" },
      { keyTag: "[↑/↓]", label: "Navegar" },
      { keyTag: "[Enter]", label: "Elegir", key: "\r" },
      { keyTag: "[Escribir]", label: "Filtrar" },
      { keyTag: "[Backspace]", label: "Borrar" },
      { keyTag: "[Esc]", label: "Volver", key: "\u001b" },
    ], width);

    const footer = [
      cBorderMuted("═".repeat(Math.max(10, width - 6))),
      shortcuts,
    ];

    return frameModal("📋 Seleccionar Modelo (Proveedores y Modelos)", [...header, headRow, headerDivider, ...bodyRows, ...footer], width, theme, {
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

    const pickerEffortOptions = getPickerEffortOptions();
    pickerIndex = Math.min(Math.max(0, pickerIndex), Math.max(0, pickerEffortOptions.length - 1));

    const listLines: string[] = [];
    for (const [idx, item] of pickerEffortOptions.entries()) {
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
                  ? pickerEffortOptions.length === 1
                    ? ` ${cMuted("(este modelo no utiliza niveles de razonamiento)")}`
                    : isOrchestrator
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

    const categories = manager.getCategories
      ? manager.getCategories(editingProfile ?? undefined)
      : SDD_AGENT_CATEGORIES;

    const categoryRows = [
      { name: "👑 Orquestador (Sesión Principal)", count: 1 },
      ...categories.map((cat) => ({ name: cat.name, count: cat.agents.length })),
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

    // Helper to attempt import and trigger conflict resolution if name already exists
    const tryImportWithConflictCheck = (filePath: string) => {
      let candidateName = "";
      try {
        const expanded = filePath.startsWith("~/") || filePath === "~"
          ? path.join(os.homedir(), filePath.slice(1))
          : filePath;
        const resolved = path.resolve(expanded);
        if (fs.existsSync(resolved)) {
          const parsed = JSON.parse(fs.readFileSync(resolved, "utf-8"));
          if (parsed && typeof parsed.name === "string" && parsed.name.trim()) {
            candidateName = parsed.name.trim();
          }
        }
      } catch {
        // Let manager.importProfile handle parsing and validation errors
      }

      if (candidateName) {
        // Check if profile with candidateName already exists
        const existing = manager.getProfile(candidateName);
        if (existing) {
          // Name collision! Prompt user for resolution
          pendingImportPath = filePath;
          pendingImportOriginalName = candidateName;

          // Suggest alternative name based on filename or suffix
          const baseFileName = path.basename(filePath, path.extname(filePath));
          let suggested = baseFileName && baseFileName !== candidateName ? baseFileName : `${candidateName}-imported`;
          let counter = 2;
          while (manager.getProfile(suggested)) {
            suggested = `${candidateName}-imported-${counter++}`;
          }
          pendingImportSuggestedName = suggested;
          conflictRenameInput = suggested;
          conflictRenameMode = false;
          conflictErrorMessage = null;
          view = "import-conflict";
          return;
        }
      }

      // No collision or file to be validated by manager: perform direct import
      executeImport(filePath, undefined);
    };

    const executeImport = (filePath: string, overrideName?: string) => {
      const res = manager.importProfile({ sourceFilePath: filePath, scope: importScope, overrideName });
      if (res.success && res.profile) {
        refreshProfiles();
        const newIdx = profiles.findIndex((p) => p.name.toLowerCase() === res.profile!.name.toLowerCase());
        if (newIdx !== -1) selectedProfileIndex = newIdx;
        syncEditingProfile();
        feedbackMessage = `Perfil "${res.profile.name}" importado con éxito en ${importScope}.`;
        view = "profiles-list";
        manualPathInput = "";
        isManualPathMode = false;
        importErrorMessage = null;
        pendingImportPath = "";
      } else {
        importErrorMessage = res.message;
        if (view === "import-conflict") {
          conflictErrorMessage = res.message;
        }
      }
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
      if (view === "export-profile") return constrainLines(renderExportProfile(width), width);
      if (view === "import-profile") return constrainLines(renderImportProfile(width), width);
      if (view === "import-conflict") return constrainLines(renderImportConflict(width), width);
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

      // --- Sub-View: Export Profile ---
      if (view === "export-profile") {
        if (key === "esc") {
          view = "profiles-list";
          exportPathInput = "";
          exportErrorMessage = null;
        } else if (key === "backspace") {
          exportPathInput = exportPathInput.slice(0, -1);
          exportErrorMessage = null;
        } else if (key === "enter") {
          const trimmed = exportPathInput.trim();
          if (!trimmed) {
            exportErrorMessage = "La ruta de destino no puede estar vacía.";
          } else {
            const res = manager.exportProfile(exportingProfileName, trimmed);
            if (res.success) {
              feedbackMessage = `Perfil "${exportingProfileName}" exportado con éxito a "${trimmed}".`;
              view = "profiles-list";
              exportPathInput = "";
              exportErrorMessage = null;
            } else {
              exportErrorMessage = res.message;
            }
          }
        } else if (data.length === 1 && /^[\w\-\.\/ ~:@+]$/.test(data)) {
          exportPathInput += data;
          exportErrorMessage = null;
        }
        requestRender();
        return;
      }

      // --- Sub-View: Import Profile (Universal File Browser & Manual Mode) ---
      if (view === "import-profile") {
        if (isManualPathMode) {
          if (key === "esc") {
            isManualPathMode = false;
            manualPathInput = "";
            importErrorMessage = null;
          } else if (key === "backspace") {
            manualPathInput = manualPathInput.slice(0, -1);
            importErrorMessage = null;
          } else if (key === "1") {
            importScope = "project";
          } else if (key === "2") {
            importScope = "global";
          } else if (key === "tab") {
            importScope = importScope === "project" ? "global" : "project";
          } else if (key === "enter") {
            const trimmed = manualPathInput.trim();
            if (!trimmed) {
              importErrorMessage = "La ruta del archivo no puede estar vacía.";
            } else {
              tryImportWithConflictCheck(trimmed);
            }
          } else if (data.length === 1 && /^[\w\-\.\/ ~:@+]$/.test(data)) {
            manualPathInput += data;
            importErrorMessage = null;
          }
          requestRender();
          return;
        }

        // Browser mode
        if (key === "esc") {
          view = "profiles-list";
          importErrorMessage = null;
        } else if (key === "1") {
          importScope = "project";
        } else if (key === "2") {
          importScope = "global";
        } else if (key === "tab") {
          importScope = importScope === "project" ? "global" : "project";
        } else if (key === "m") {
          isManualPathMode = true;
          manualPathInput = "";
          importErrorMessage = null;
        } else if (key === "up") {
          browserIndex = Math.max(0, browserIndex - 1);
        } else if (key === "down") {
          browserIndex = Math.min(browserEntries.length - 1, browserIndex + 1);
        } else if (key === "pageup") {
          browserIndex = Math.max(0, browserIndex - 5);
        } else if (key === "pagedown") {
          browserIndex = Math.min(browserEntries.length - 1, browserIndex + 5);
        } else if (key === "home") {
          browserIndex = 0;
        } else if (key === "end") {
          browserIndex = Math.max(0, browserEntries.length - 1);
        } else if (key === "enter") {
          const selected = browserEntries[browserIndex];
          if (selected) {
            if (selected.isDir) {
              browserCurrentDir = selected.fullPath;
              loadBrowserEntries(browserCurrentDir);
            } else {
              // It is a .json file, attempt import with conflict check
              tryImportWithConflictCheck(selected.fullPath);
            }
          }
        }
        requestRender();
        return;
      }

      // --- Sub-View: Import Conflict Resolution ---
      if (view === "import-conflict") {
        if (conflictRenameMode) {
          if (key === "esc") {
            conflictRenameMode = false;
            conflictErrorMessage = null;
          } else if (key === "backspace") {
            conflictRenameInput = conflictRenameInput.slice(0, -1);
            conflictErrorMessage = null;
          } else if (key === "enter") {
            const trimmed = conflictRenameInput.trim();
            if (!trimmed) {
              conflictErrorMessage = "El nombre no puede estar vacío.";
            } else if (manager.getProfile(trimmed)) {
              conflictErrorMessage = `Ya existe un perfil con el nombre "${trimmed}".`;
            } else {
              executeImport(pendingImportPath, trimmed);
            }
          } else if (data.length === 1 && /^[\w\-\. ]$/.test(data)) {
            conflictRenameInput += data;
            conflictErrorMessage = null;
          }
          requestRender();
          return;
        }

        // Choice mode: Overwrite [1/o], Rename [2/r], Cancel [Esc]
        if (key === "esc") {
          view = "import-profile";
          pendingImportPath = "";
          conflictErrorMessage = null;
        } else if (key === "1" || key === "o" || key === "O") {
          // Overwrite existing profile
          executeImport(pendingImportPath, pendingImportOriginalName);
        } else if (key === "2" || key === "r" || key === "R") {
          // Open Rename sub-mode
          conflictRenameMode = true;
          conflictRenameInput = pendingImportSuggestedName;
          conflictErrorMessage = null;
        }
        requestRender();
        return;
      }

      // --- Sub-View: Model Picker (Two-Column Interactive Master-Detail) ---
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
        } else if (key === "tab" || key === "left" || key === "right") {
          pickerActivePane = pickerActivePane === "providers" ? "models" : "providers";
        } else if (key === "up") {
          if (pickerActivePane === "providers") {
            selectedProviderIndex = Math.max(0, selectedProviderIndex - 1);
            const prov = pickerProviders[selectedProviderIndex] ?? "";
            pickerItems = prov ? (modelsByProvider.get(prov) ?? []) : [];
            pickerIndex = 0;
            pickerScrollOffset = 0;
          } else {
            pickerIndex = Math.max(0, pickerIndex - 1);
          }
        } else if (key === "down") {
          if (pickerActivePane === "providers") {
            selectedProviderIndex = Math.min(pickerProviders.length - 1, selectedProviderIndex + 1);
            const prov = pickerProviders[selectedProviderIndex] ?? "";
            pickerItems = prov ? (modelsByProvider.get(prov) ?? []) : [];
            pickerIndex = 0;
            pickerScrollOffset = 0;
          } else {
            pickerIndex = Math.min(pickerItems.length - 1, pickerIndex + 1);
          }
        } else if (key === "pageup") {
          if (pickerActivePane === "providers") {
            selectedProviderIndex = Math.max(0, selectedProviderIndex - 5);
            const prov = pickerProviders[selectedProviderIndex] ?? "";
            pickerItems = prov ? (modelsByProvider.get(prov) ?? []) : [];
            pickerIndex = 0;
            pickerScrollOffset = 0;
          } else {
            pickerIndex = Math.max(0, pickerIndex - 5);
          }
        } else if (key === "pagedown") {
          if (pickerActivePane === "providers") {
            selectedProviderIndex = Math.min(pickerProviders.length - 1, selectedProviderIndex + 5);
            const prov = pickerProviders[selectedProviderIndex] ?? "";
            pickerItems = prov ? (modelsByProvider.get(prov) ?? []) : [];
            pickerIndex = 0;
            pickerScrollOffset = 0;
          } else {
            pickerIndex = Math.min(pickerItems.length - 1, pickerIndex + 5);
          }
        } else if (key === "home") {
          if (pickerActivePane === "providers") {
            selectedProviderIndex = 0;
            const prov = pickerProviders[selectedProviderIndex] ?? "";
            pickerItems = prov ? (modelsByProvider.get(prov) ?? []) : [];
            pickerIndex = 0;
            pickerScrollOffset = 0;
          } else {
            pickerIndex = 0;
          }
        } else if (key === "end") {
          if (pickerActivePane === "providers") {
            selectedProviderIndex = Math.max(0, pickerProviders.length - 1);
            const prov = pickerProviders[selectedProviderIndex] ?? "";
            pickerItems = prov ? (modelsByProvider.get(prov) ?? []) : [];
            pickerIndex = 0;
            pickerScrollOffset = 0;
          } else {
            pickerIndex = Math.max(0, pickerItems.length - 1);
          }
        } else if (key === "enter") {
          if (pickerActivePane === "providers") {
            // Enter on provider moves focus to models
            pickerActivePane = "models";
          } else {
            const chosenModel = pickerItems[pickerIndex] || (pickerItems.length === 0 && modelFilter.trim().includes("/") ? modelFilter.trim() : undefined);
            if (chosenModel) {
              // Apply model directly without disruptive screen jump
              applyModelOption(chosenModel);
              stagedModel = undefined;
              view = "profile-editor";
              activePane = "agents";
            } else {
              view = "profile-editor";
            }
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
        const pickerEffortOptions = getPickerEffortOptions();
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
          pickerIndex = Math.min(pickerEffortOptions.length - 1, pickerIndex + 1);
        } else if (key === "enter") {
          const chosen = pickerEffortOptions[pickerIndex] ?? "default";
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
        const categories = manager.getCategories
          ? manager.getCategories(editingProfile ?? undefined)
          : SDD_AGENT_CATEGORIES;
        if (key === "esc" || key === "q") {
          view = "profiles-list";
        } else if (key === "up" || key === "k") {
          pickerIndex = Math.max(0, pickerIndex - 1);
        } else if (key === "down" || key === "j") {
          pickerIndex = Math.min(categories.length, pickerIndex + 1);
        } else if (key === "enter") {
          if (pickerIndex === 0) {
            // Orquestador
            openModelPicker("default-model");
          } else {
            const cat = categories[pickerIndex - 1];
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
        if (activePane === "effort") {
          activePane = "agents";
        } else if (activePane === "agents") {
          const item = selectedTreeItem();
          if (item && item.type === "category" && item.category && expandedCategories.has(item.category.id)) {
            expandedCategories.delete(item.category.id);
          } else {
            activePane = "profiles";
          }
        }
        requestRender();
        return;
      }
      if (key === "right" || key === "l") {
        if (activePane === "profiles") {
          activePane = "agents";
        } else if (activePane === "agents") {
          const item = selectedTreeItem();
          if (item && item.type === "category" && item.category && !expandedCategories.has(item.category.id)) {
            expandedCategories.add(item.category.id);
          } else {
            activePane = "effort";
          }
        }
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
          selectedAgentIndex = Math.min(getVisibleTreeItems().length - 1, selectedAgentIndex + 1);
        } else {
          const col3Opts = getCol3EffortOptions();
          selectedEffortIndex = Math.min(col3Opts.length - 1, selectedEffortIndex + 1);
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
          selectedAgentIndex = Math.min(getVisibleTreeItems().length - 1, selectedAgentIndex + 5);
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
        else if (activePane === "agents") selectedAgentIndex = Math.max(0, getVisibleTreeItems().length - 1);
        else {
          const col3Opts = getCol3EffortOptions();
          selectedEffortIndex = Math.max(0, col3Opts.length - 1);
        }
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
          const item = selectedTreeItem();
          stagedModel = undefined;
          if (item.type === "orchestrator") {
            openModelPicker("default-model");
          } else if (item.type === "all-subagents") {
            openModelPicker("all-models");
          } else if (item.type === "all-effort") {
            activePane = "effort";
            pickerTarget = "all-models";
          } else if (item.type === "category" && item.category) {
            openModelPicker("category-models", item.category.name);
          } else if (item.type === "agent") {
            openModelPicker("agent-model");
          }
        } else if (activePane === "effort") {
          const col3Opts = getCol3EffortOptions();
          const chosen = col3Opts[selectedEffortIndex];
          if (chosen) {
            applyEffortOption(chosen);
          }
        }
        requestRender();
        return;
      }

      // Space contextual
      if (key === "space") {
        if (activePane === "agents") {
          const item = selectedTreeItem();
          if (item && item.type === "category" && item.category) {
            if (expandedCategories.has(item.category.id)) {
              expandedCategories.delete(item.category.id);
            } else {
              expandedCategories.add(item.category.id);
            }
            requestRender();
            return;
          }
        }
        if (activePane === "effort") {
          const col3Opts = getCol3EffortOptions();
          const chosen = col3Opts[selectedEffortIndex];
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
        const item = selectedTreeItem();
        stagedModel = undefined;
        if (item.type === "orchestrator") {
          openModelPicker("default-model");
        } else if (item.type === "all-subagents") {
          openModelPicker("all-models");
        } else if (item.type === "category" && item.category) {
          openModelPicker("category-models", item.category.name);
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
        const items = getVisibleTreeItems();
        const nextCatIdx = items.findIndex((it, idx) => idx > selectedAgentIndex && it.type === "category");
        if (nextCatIdx !== -1) {
          selectedAgentIndex = nextCatIdx;
        } else {
          const firstCatIdx = items.findIndex((it) => it.type === "category");
          if (firstCatIdx !== -1) selectedAgentIndex = firstCatIdx;
        }
        activePane = "agents";
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
      if (key === "x") {
        const target = selectedProfile();
        if (target) {
          exportingProfileName = target.name;
          exportPathInput = `~/${target.name}.json`;
          exportErrorMessage = null;
          feedbackMessage = null;
          view = "export-profile";
        }
        requestRender();
        return;
      }
      if (key === "i") {
        importScope = "project";
        importErrorMessage = null;
        feedbackMessage = null;
        isManualPathMode = false;
        manualPathInput = "";
        browserCurrentDir = os.homedir();
        loadBrowserEntries(browserCurrentDir);
        view = "import-profile";
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
            if (delta > 0) selectedAgentIndex = Math.min(getVisibleTreeItems().length - 1, selectedAgentIndex + 1);
            else if (delta < 0) selectedAgentIndex = Math.max(0, selectedAgentIndex - 1);
          } else if (activePane === "effort" || x > col2End) {
            activePane = "effort";
            const col3Opts = getCol3EffortOptions();
            if (delta > 0) selectedEffortIndex = Math.min(col3Opts.length - 1, selectedEffortIndex + 1);
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
                const items = getVisibleTreeItems();
                const item = items[itemIdx];

                if (item && item.type === "category" && item.category) {
                  selectedAgentIndex = itemIdx;
                  if (clickCount === 2) {
                    openModelPicker("category-models", item.category.name);
                  } else {
                    if (expandedCategories.has(item.category.id)) {
                      expandedCategories.delete(item.category.id);
                    } else {
                      expandedCategories.add(item.category.id);
                    }
                  }
                  requestRender();
                  return { handled: true, render: true };
                }

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
                const col3Opts = getCol3EffortOptions();
                const chosen = col3Opts[itemIdx];
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
