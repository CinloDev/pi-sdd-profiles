import type { ModelProfileEntry, Profile, ProfileSummary, ReasoningEffort } from "./types.js";
import { ALL_KNOWN_AGENTS, SDD_AGENT_CATEGORIES } from "./catalog.js";
import type { SddProfileManager } from "./manager.js";
import {
  constrainLines,
  frameModal,
  normalizeModalKey,
  visibleWidth,
} from "./modal-formatting.js";

export type ModalView =
  | "profiles-list"
  | "create-profile"
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

export const EFFORT_OPTIONS: Array<ReasoningEffort | "heredar"> = [
  "heredar",
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

  // State for new profile creation view
  let newProfileInput = "";

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

  // Clamp selection helper
  const clampList = (index: number, scroll: number, total: number, maxVisible: number) => {
    const newIndex = Math.min(Math.max(index, 0), Math.max(0, total - 1));
    let newScroll = scroll;
    if (newIndex < newScroll) newScroll = newIndex;
    if (newIndex >= newScroll + maxVisible) newScroll = newIndex - maxVisible + 1;
    newScroll = Math.max(0, Math.min(newScroll, Math.max(0, total - 1)));
    return { index: newIndex, scroll: newScroll };
  };

  // View: Profiles List
  const renderProfilesList = (width: number): string[] => {
    const maxVisible = 10;
    const clamped = clampList(selectedProfileIndex, profileScrollOffset, profiles.length, maxVisible);
    selectedProfileIndex = clamped.index;
    profileScrollOffset = clamped.scroll;

    const visibleProfiles = profiles.slice(profileScrollOffset, profileScrollOffset + maxVisible);

    const cAccent = (t: string) => (theme?.fg ? theme.fg("accent", t) : t);
    const cMuted = (t: string) => (theme?.fg ? theme.fg("muted", t) : t);
    const cSuccess = (t: string) => (theme?.fg ? theme.fg("success", t) : t);
    const cDim = (t: string) => (theme?.fg ? theme.fg("dim", t) : t);

    const activeProfileObj = activeProfileName ? manager.getProfile(activeProfileName) : null;
    const activeOrchestrator = activeProfileObj?.default_model ? ` · Orquestador: ${activeProfileObj.default_model}` : "";

    const header = [
      `Estado: Perfil activo → ${activeProfileName ? cSuccess(`● ${activeProfileName}`) : cDim("(ninguno)")}${cDim(activeOrchestrator)}`,
      cMuted("Atajos: [Enter] Activar · [e] Editar · [n] Nuevo Perfil · [d] Borrar · [Esc] Salir"),
      cDim("═".repeat(Math.max(10, width - 6))),
    ];

    const listLines: string[] = [];
    if (profiles.length === 0) {
      listLines.push("No hay perfiles disponibles. Presioná 'n' para crear uno nuevo.");
    } else {
      for (const [offset, p] of visibleProfiles.entries()) {
        const idx = profileScrollOffset + offset;
        const isSelected = idx === selectedProfileIndex;
        const cursor = isSelected ? cAccent("› ") : "  ";
        const activeMarker = p.is_active || (activeProfileName && p.name.toLowerCase() === activeProfileName.toLowerCase())
          ? cSuccess("● ")
          : cDim("○ ");

        const scopeTag = cDim(`[${p.scope}]`);
        const modelStr = p.default_model ? cMuted(` (Orquestador: ${p.default_model})`) : "";
        const agentCount = cDim(` · ${p.agent_count} subagentes`);

        const line = `${cursor}${activeMarker}${isSelected ? cAccent(p.name) : p.name} ${scopeTag}${modelStr}${agentCount}`;
        listLines.push(line);
      }
    }

    const currentP = selectedProfile();
    const footer = [
      cDim("═".repeat(Math.max(10, width - 6))),
      currentP?.description ? `Descripción: ${cDim(currentP.description)}` : `Perfil: ${currentP?.name ?? "ninguno"}`,
    ];

    return frameModal("🎛️ SDD Profile Manager · De y para la Comunidad", [...header, ...listLines, ...footer], width, theme);
  };

  // View: Create Profile
  const renderCreateProfile = (width: number): string[] => {
    const cAccent = (t: string) => (theme?.fg ? theme.fg("accent", t) : t);
    const cMuted = (t: string) => (theme?.fg ? theme.fg("muted", t) : t);
    const cDim = (t: string) => (theme?.fg ? theme.fg("dim", t) : t);

    const header = [
      "Crear un nuevo perfil de modelos SDD y Orquestador:",
      cMuted("Escribí el nombre del nuevo perfil y presioná [Enter] para continuar al editor."),
      cDim("═".repeat(Math.max(10, width - 6))),
    ];

    const inputLine = `  Nombre: ${cAccent(newProfileInput || "...")}${cAccent("█")}`;

    const footer = [
      cDim("═".repeat(Math.max(10, width - 6))),
      cMuted("Atajos: [Enter] Crear y Configurar · [Esc] Cancelar"),
    ];

    return frameModal("➕ Nuevo Perfil SDD", [...header, "", inputLine, "", ...footer], width, theme);
  };

  // View: Profile Editor
  const renderProfileEditor = (width: number): string[] => {
    if (!editingProfile) return ["Error: perfil no cargado"];

    const maxVisible = 10;
    const clamped = clampList(selectedAgentIndex, agentScrollOffset, editingAgentsList.length, maxVisible);
    selectedAgentIndex = clamped.index;
    agentScrollOffset = clamped.scroll;

    const visibleAgents = editingAgentsList.slice(agentScrollOffset, agentScrollOffset + maxVisible);

    const cAccent = (t: string) => (theme?.fg ? theme.fg("accent", t) : t);
    const cMuted = (t: string) => (theme?.fg ? theme.fg("muted", t) : t);
    const cSuccess = (t: string) => (theme?.fg ? theme.fg("success", t) : t);
    const cDim = (t: string) => (theme?.fg ? theme.fg("dim", t) : t);
    const cWarning = (t: string) => (theme?.fg ? theme.fg("warning", t) : t);

    const dirtyIndicator = isDirty ? cWarning(" (cambios sin guardar*)") : "";

    const header = [
      `Perfil: ${cAccent(editingProfile.name)}${dirtyIndicator} · Orquestador: ${cMuted(editingProfile.default_model ?? "default")} (${editingProfile.default_effort ?? "medium"})`,
      cMuted("Atajos: [Enter/m] Cambiar modelo · [e] Esfuerzo · [a] A TODOS · [c] Categoría · [s] Guardar · [Esc] Volver"),
      cDim("═".repeat(Math.max(10, width - 6))),
    ];

    const listLines: string[] = [];
    for (const [offset, agentName] of visibleAgents.entries()) {
      const idx = agentScrollOffset + offset;
      const isSelected = idx === selectedAgentIndex;
      const cursor = isSelected ? cAccent("› ") : "  ";

      if (agentName === ORCHESTRATOR_AGENT_KEY) {
        const modelLabel = editingProfile.default_model ? editingProfile.default_model : cDim("(no definido)");
        const effortLabel = editingProfile.default_effort ? cAccent(`[${editingProfile.default_effort}]`) : cDim("[default]");
        listLines.push(`${cursor}${isSelected ? cAccent(agentName) : agentName} → ${cSuccess(modelLabel)} ${effortLabel}`);
      } else if (
        agentName === ASSIGN_ALL_SUBAGENTS_KEY ||
        agentName === ASSIGN_ALL_EFFORT_KEY ||
        agentName === ASSIGN_CATEGORY_KEY
      ) {
        listLines.push(`${cursor}${isSelected ? cAccent(agentName) : cWarning(agentName)}`);
      } else {
        const assignment = editingProfile.model_profiles[agentName];
        const modelLabel = assignment?.model ? assignment.model : cDim(`(hereda: ${editingProfile.default_model ?? "default"})`);
        const effortLabel = assignment?.effort ? cAccent(`[${assignment.effort}]`) : cDim(`[${editingProfile.default_effort ?? "default"}]`);
        listLines.push(`${cursor}${isSelected ? cAccent(agentName) : agentName} → ${modelLabel} ${effortLabel}`);
      }
    }

    const footer = [
      cDim("═".repeat(Math.max(10, width - 6))),
      `Seleccionado: ${cAccent(selectedAgent())}`,
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

    const cAccent = (t: string) => (theme?.fg ? theme.fg("accent", t) : t);
    const cMuted = (t: string) => (theme?.fg ? theme.fg("muted", t) : t);
    const cDim = (t: string) => (theme?.fg ? theme.fg("dim", t) : t);

    const titleTarget =
      pickerTarget === "all-models"
        ? "TODOS los subagentes"
        : pickerTarget === "category-models"
          ? `Categoría: ${targetCategory}`
          : pickerTarget === "default-model"
            ? "👑 Orquestador (Modelo Base)"
            : `Agente: ${selectedAgent()}`;

    const header = [
      `Asignar modelo a: ${cAccent(titleTarget)}`,
      cMuted("Atajos: [↑/↓] Navegar · [Enter] Seleccionar · [Esc] Cancelar"),
      cDim("═".repeat(Math.max(10, width - 6))),
    ];

    const listLines: string[] = [];
    for (const [offset, item] of visibleItems.entries()) {
      const idx = pickerScrollOffset + offset;
      const isSelected = idx === pickerIndex;
      const cursor = isSelected ? cAccent("› ") : "  ";
      listLines.push(`${cursor}${isSelected ? cAccent(item) : item}`);
    }

    return frameModal("📋 Seleccionar Modelo", [...header, ...listLines], width, theme);
  };

  // View: Effort Picker
  const renderEffortPicker = (width: number): string[] => {
    const cAccent = (t: string) => (theme?.fg ? theme.fg("accent", t) : t);
    const cMuted = (t: string) => (theme?.fg ? theme.fg("muted", t) : t);
    const cSuccess = (t: string) => (theme?.fg ? theme.fg("success", t) : t);
    const cDim = (t: string) => (theme?.fg ? theme.fg("dim", t) : t);

    const titleTarget =
      pickerTarget === "all-models"
        ? "TODOS los subagentes"
        : pickerTarget === "category-models"
          ? `Categoría: ${targetCategory}`
          : pickerTarget === "default-model" || selectedAgent() === ORCHESTRATOR_AGENT_KEY
            ? "👑 Orquestador (Sesión Principal)"
            : `Agente: ${selectedAgent()}`;

    const modelInfo = stagedModel ? ` · Modelo asignado: ${cSuccess(stagedModel)}` : "";

    const header = [
      `Elegir nivel de razonamiento para: ${cAccent(titleTarget)}${modelInfo}`,
      cMuted("Atajos: [↑/↓] Navegar · [Enter] Confirmar · [Esc] Saltear esfuerzo"),
      cDim("═".repeat(Math.max(10, width - 6))),
    ];

    const listLines: string[] = [];
    for (const [idx, item] of EFFORT_OPTIONS.entries()) {
      const isSelected = idx === pickerIndex;
      const cursor = isSelected ? cAccent("› ") : "  ";
      const desc =
        item === "high"
          ? cDim(" (razonamiento alto)")
          : item === "medium"
            ? cDim(" (balance estándar)")
            : item === "low"
              ? cDim(" (rápido y económico)")
              : item === "max"
                ? cDim(" (máxima profundidad)")
                : item === "heredar"
                  ? cDim(" (heredar por defecto)")
                  : "";
      listLines.push(`${cursor}${isSelected ? cAccent(item) : item}${desc}`);
    }

    return frameModal("🧠 Nivel de Razonamiento (Effort)", [...header, ...listLines], width, theme);
  };

  // View: Category Picker
  const renderCategoryPicker = (width: number): string[] => {
    const cAccent = (t: string) => (theme?.fg ? theme.fg("accent", t) : t);
    const cMuted = (t: string) => (theme?.fg ? theme.fg("muted", t) : t);
    const cDim = (t: string) => (theme?.fg ? theme.fg("dim", t) : t);

    const header = [
      "Elegir qué categoría de agentes configurar en lote:",
      cMuted("Atajos: [↑/↓] Navegar · [Enter] Elegir · [Esc] Cancelar"),
      cDim("═".repeat(Math.max(10, width - 6))),
    ];

    const categoryRows = [
      "👑 Orquestador (Sesión Principal)",
      ...SDD_AGENT_CATEGORIES.map((cat) => `${cat.name} (${cat.agents.length} agentes)`),
    ];

    const listLines: string[] = [];
    for (const [idx, item] of categoryRows.entries()) {
      const isSelected = idx === pickerIndex;
      const cursor = isSelected ? cAccent("› ") : "  ";
      listLines.push(`${cursor}${isSelected ? cAccent(item) : item}`);
    }

    return frameModal("📦 Elegir Categoría", [...header, ...listLines], width, theme);
  };

  return {
    render(width: number): string[] {
      if (view === "create-profile") return constrainLines(renderCreateProfile(width), width);
      if (view === "profile-editor") return constrainLines(renderProfileEditor(width), width);
      if (view === "model-picker") return constrainLines(renderModelPicker(width), width);
      if (view === "effort-picker") return constrainLines(renderEffortPicker(width), width);
      if (view === "category-picker") return constrainLines(renderCategoryPicker(width), width);
      return constrainLines(renderProfilesList(width), width);
    },

    handleInput(data: string): void {
      const key = normalizeModalKey(data);

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

      // --- Sub-View: Model Picker ---
      if (view === "model-picker") {
        if (key === "esc" || key === "q") {
          stagedModel = undefined;
          view = "profile-editor";
        } else if (key === "up" || key === "k") {
          pickerIndex = Math.max(0, pickerIndex - 1);
        } else if (key === "down" || key === "j") {
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
          } else {
            view = "profile-editor";
          }
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
            const effortVal = chosen === "heredar" ? undefined : chosen;

            if (pickerTarget === "default-model" || selectedAgent() === ORCHESTRATOR_AGENT_KEY) {
              if (stagedModel) editingProfile.default_model = stagedModel;
              editingProfile.default_effort = effortVal;
            } else if (pickerTarget === "all-models") {
              if (stagedModel) editingProfile.default_model = stagedModel;
              for (const ag of ALL_KNOWN_AGENTS) {
                editingProfile.model_profiles[ag] = {
                  model: stagedModel ?? editingProfile.model_profiles[ag]?.model ?? editingProfile.default_model ?? "default",
                  effort: effortVal,
                };
              }
            } else if (pickerTarget === "category-models" && targetCategory) {
              const cat = SDD_AGENT_CATEGORIES.find((c) => c.name === targetCategory);
              if (cat) {
                for (const ag of cat.agents) {
                  editingProfile.model_profiles[ag] = {
                    model: stagedModel ?? editingProfile.model_profiles[ag]?.model ?? editingProfile.default_model ?? "default",
                    effort: effortVal,
                  };
                }
              }
            } else {
              const currentAgent = selectedAgent();
              const currentModel =
                stagedModel ??
                editingProfile.model_profiles[currentAgent]?.model ??
                editingProfile.default_model ??
                "default";
              editingProfile.model_profiles[currentAgent] = {
                model: currentModel,
                effort: effortVal,
              };
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
            pickerTarget = "default-model";
            pickerItems = [...availableModels];
            pickerIndex = 0;
            pickerScrollOffset = 0;
            view = "model-picker";
          } else {
            const cat = SDD_AGENT_CATEGORIES[pickerIndex - 1];
            if (cat) {
              targetCategory = cat.name;
              pickerTarget = "category-models";
              pickerItems = [...availableModels];
              pickerIndex = 0;
              pickerScrollOffset = 0;
              view = "model-picker";
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
            pickerTarget = "all-models";
            pickerItems = [...availableModels];
            pickerIndex = 0;
            pickerScrollOffset = 0;
            view = "model-picker";
          } else if (current === ASSIGN_ALL_EFFORT_KEY) {
            pickerTarget = "all-models";
            pickerIndex = 0;
            view = "effort-picker";
          } else if (current === ASSIGN_CATEGORY_KEY) {
            pickerIndex = 0;
            view = "category-picker";
          } else if (current === ORCHESTRATOR_AGENT_KEY) {
            pickerTarget = "default-model";
            pickerItems = [...availableModels];
            pickerIndex = 0;
            pickerScrollOffset = 0;
            view = "model-picker";
          } else {
            // Individual subagent!
            pickerTarget = "agent-model";
            pickerItems = [...availableModels];
            pickerIndex = 0;
            pickerScrollOffset = 0;
            view = "model-picker";
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
          pickerTarget = "all-models";
          pickerItems = [...availableModels];
          pickerIndex = 0;
          pickerScrollOffset = 0;
          view = "model-picker";
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
        // Activate selected profile
        const target = selectedProfile();
        if (target) {
          const res = manager.activateProfile(target.name, "global");
          if (res.success && res.profile) {
            onProfileActivated?.(res.profile);
            refreshProfiles();
            done({ action: "activated", profileName: target.name });
            return;
          }
        }
      } else if (key === "n") {
        // Create new profile
        newProfileInput = "";
        view = "create-profile";
      } else if (key === "e") {
        // Edit selected profile
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
      } else if (key === "d") {
        // Delete selected profile
        const target = selectedProfile();
        if (target && target.scope !== "builtin") {
          manager.deleteProfile(target.name);
          refreshProfiles();
        }
      }

      requestRender();
    },

    invalidate(): void {
      requestRender();
    },
  };
}
