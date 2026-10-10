# 🏛️ Auditoría Técnica, Arquitectónica y de Seguridad Profunda
## Repositorio: `CinloDev/pi-sdd-profiles`

* **Fecha de Auditoría:** 9 de Octubre de 2026
* **Auditor:** el Gentleman — Senior Software Architect & Security Auditor
* **Repositorio Auditado:** [`https://github.com/CinloDev/pi-sdd-profiles`](https://github.com/CinloDev/pi-sdd-profiles)
* **Commit Base Inspeccionado:** `43d3226644ee7271b722bda21a89c6ae4e449c88` (Merge pull request #41)
* **Suite de Pruebas:** 137 tests en Vitest (100% passing) + `tsc --noEmit` limpio

---

## 📑 Tabla de Contenidos
1. [Resumen Ejecutivo & Calificaciones](#1-resumen-ejecutivo--calificaciones)
2. [Arquitectura del Sistema & Flujo de Componentes](#2-arquitectura-del-sistema--flujo-de-componentes)
3. [Hallazgos Críticos y Defectos de Lógica](#3-hallazgos-críticos-y-defectos-de-lógica)
   - [3.1 Desincronización Crítica de Onboarding (Perfiles Estándar Fantasma)](#31-desincronización-crítica-de-onboarding-perfiles-estándar-fantasma)
   - [3.2 Borrado Destructivo en Cascada entre Scopes (`deleteProfile`)](#32-borrado-destructivo-en-cascada-entre-scopes-deleteprofile)
   - [3.3 Pérdida de Subagentes Custom al Activar Perfil (`applyProfileToConfig`)](#33-pérdida-de-subagentes-custom-al-activar-perfil-applyprofiletoconfig)
   - [3.4 Lógica Redundante / Rama Muerta en `saveCurrentAsProfile`](#34-lógica-redundante--rama-muerta-en-savecurrentasprofile)
   - [3.5 Bug de Expansión de Rutas en Windows (`resolvePath`)](#35-bug-de-expansión-de-rutas-en-windows-resolvepath)
   - [3.6 Descubrimiento de Modelos Ignora `.pi/models.json` de Proyecto](#36-descubrimiento-de-modelos-ignora-pimodelsjson-de-proyecto)
   - [3.7 Heurística Restrictiva de Reasoning Effort (Omisión de `off` y `max`)](#37-heurística-restrictiva-de-reasoning-effort-omisión-de-off-y-max)
   - [3.8 Claves Huérfanas Kebab vs CamelCase en `settings.json`](#38-claves-huérfanas-kebab-vs-camelcase-en-settingsjson)
4. [Auditoría Profunda de Seguridad & Threat Modeling](#4-auditoría-profunda-de-seguridad--threat-modeling)
   - [4.1 Sobreescritura Ciega de Archivos en `exportProfile`](#41-sobreescritura-ciega-de-archivos-en-exportprofile)
   - [4.2 Exposición de Tools Destructivas al LLM sin Guardias de Confirmación](#42-exposición-de-tools-destructivas-al-llm-sin-guardias-de-confirmación)
   - [4.3 Prototype Pollution Potencial en Importación](#43-prototype-pollution-potencial-en-importación)
   - [4.4 Sanitización de Nombres y Path Traversal](#44-sanitización-de-nombres-y-path-traversal)
   - [4.5 Superficie de Ejecución Remota (RCE)](#45-superficie-de-ejecución-remota-rce)
   - [4.6 Gestión de Secretos y Credenciales](#46-gestión-de-secretos-y-credenciales)
5. [Experiencia TUI y Evaluación del Monolito `src/modal.ts`](#5-experiencia-tui-y-evaluación-del-monolito-srcmodalts)
6. [Persistencia, Watchers y Concurrencia](#6-persistencia-watchers-y-concurrencia)
7. [Evaluación de Calidad de Código & Testing](#7-evaluación-de-calidad-de-código--testing)
8. [Plan de Remediación Priorizado](#8-plan-de-remediación-priorizado)

---

## 1. Resumen Ejecutivo & Calificaciones

`pi-sdd-profiles` es una extensión nativa para **Pi Coding Agent** diseñada para gobernar, versionar y alternar en caliente perfiles de modelos de IA para subagentes y Spec-Driven Development (SDD), integrándose con `subagents.json`.

| Dimensión Evaluada | Puntuación | Diagnóstico |
|---|:---:|---|
| **Arquitectura & Modularidad** | **8.8 / 10** | Excelente separación de dominios funcionales (Storage, Manager, Sync, Catalog, Resolvers). TypeScript estricto. |
| **Persistencia & Transaccionalidad** | **8.5 / 10** | Patrón atómico de escritura `.tmp` + `renameSync`. Protección de subagentes hijos (`GENTLE_PI_AGENTS_CHILD`). |
| **Seguridad de la Información (OWASP)** | **7.8 / 10** | Cero RCE, cero SQLi/XSS, credenciales no almacenadas. Alerta por sobreescritura ciega en exportación y tools LLM sin confirmación. |
| **Experiencia de Usuario (TUI)** | **8.9 / 10** | Miller columns reactivo, acordeón desplegable, selector de modelos de 2 columnas y soporte integral de mouse. |
| **Integridad Docs vs. Runtime** | **5.5 / 10** | ⚠️ **Crítico**: el README y la Skill prometen 3 perfiles integrados que fueron borrados físicamente del repositorio. |
| **Mantenibilidad del Código UI** | **6.0 / 10** | ⚠️ `src/modal.ts` contiene 2.676 líneas en un único componente con más de 40 estados reactivos en closure. |

---

## 2. Arquitectura del Sistema & Flujo de Componentes

El proyecto sigue una arquitectura desacoplada en capas:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Pi Coding Agent Core                          │
│        (session_start, registerCommand, registerShortcut, registerTool) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │     index.ts     │
                          └─────────┬────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌───────────────────────┐                       ┌───────────────────────┐
│     src/manager.ts    │                       │     src/modal.ts      │
│  (SddProfileManager)  │                       │ (createSddProfiles    │
└───────────┬───────────┘                       │        Modal)         │
            │                                   └───────────┬───────────┘
 ┌──────────┼───────────────┬────────────────┐              │
 ▼          ▼               ▼                ▼              ▼
┌─────────┐┌──────────────┐┌───────────────┐┌────────────┐ ┌─────────────┐
│storage.ts││   sync.ts    ││  catalog.ts  ││resolver.ts │ │modal-form.ts│
│(Archivos││(Reconcilia-  ││(Categorías   ││(Descubrim. │ │ (Miller Col │
│ JSON &  ││ ción atómica ││ de agentes y ││ de modelos │ │  Dividers &  │
│ Scopes) ││ de config)   ││ ODD / SDD)   ││ & efforts) │ │  ANSI width) │
└─────────┘└──────────────┘└───────────────┘└────────────┘ └─────────────┘
```

* **`src/types.ts`:** Define las entidades centrales (`Profile`, `ModelProfileEntry`, `ReasoningEffort`, `ProfileScope`, `SubagentsConfigFile`).
* **`src/storage.ts`:** Responsable del I/O de perfiles. Resuelve la jerarquía de tres alcances: `project` (`.pi/profiles/`), `global` (`~/.pi/agent/profiles/`) y `builtin` (`profiles/`).
* **`src/sync.ts`:** Módulo puramente funcional para reconciliación y cálculo de divergencias entre el archivo de disco `subagents.json` y el perfil activo.
* **`src/manager.ts`:** Fachada de orquestación (`SddProfileManager`). Gestiona el ciclo de vida, descubrimiento dinámico de agentes y activación.
* **`src/watcher.ts`:** Observador del filesystem con debounce de 200 ms que vigila modificaciones no autorizadas en `subagents.json`.
* **`src/catalog.ts`:** Taxonomía de agentes: `odd-core`, `judgment-day`, `reviewers`, `sdd-core` y `custom`.
* **`src/models-resolver.ts`:** Detección de modelos disponibles desde el `modelRegistry` de Pi, `models.json` y metadatos de capacidades de esfuerzo de razonamiento.
* **`src/shortcuts.ts`:** Resolución y persistencia de atajos configurables (`alt+m`, `ctrl+shift+m`).

---

## 3. Hallazgos Críticos y Defectos de Lógica

### 3.1 Desincronización Crítica de Onboarding (Perfiles Estándar Fantasma)
* **Archivos afectados:** `profiles/`, `README.md`, `skills/sdd-profiles/SKILL.md`.
* **Causa Raíz:** En el commit `a0054f3` (PR #41), se eliminaron los tres perfiles JSON estándar (`balanced-default.json`, `deep-reasoning.json`, `speed-economy.json`).
* **Inconsistencia:**
  - `README.md` (línea 26): *"Navegá con las flechas, seleccioná un perfil (por ejemplo `balanced-default` o `deep-reasoning`) y presioná Enter."*
  - `README.md` (línea 114): Describe detalladamente los 3 perfiles estándar incluidos.
  - `SKILL.md` (línea 57): Informa la existencia de los tres perfiles como *"Built-in Templates"*.
* **Impacto en Usuario:** Una instalación limpia arranca sin ningún perfil disponible, mostrando un estado vacío (*"No hay perfiles creados. Presioná [n] para crear tu primer perfil."*), contradiciendo abiertamente la guía rápida de 30 segundos.

### 3.2 Borrado Destructivo en Cascada entre Scopes (`deleteProfile`)
* **Archivo afectado:** `src/storage.ts` -> `deleteProfile(name: string)`
* **Código vulnerable:**
  ```typescript
  deleteProfile(name: string): boolean {
    const key = this.sanitizeName(name);
    let deleted = false;

    // Borra en project
    const projectPath = path.join(this.projectDir, `${key}.json`);
    if (fs.existsSync(projectPath)) { try { fs.unlinkSync(projectPath); deleted = true; } catch {} }

    // Borra en global
    const globalPath = path.join(this.globalDir, `${key}.json`);
    if (fs.existsSync(globalPath)) { try { fs.unlinkSync(globalPath); deleted = true; } catch {} }

    // Registra tombstone en builtins
    const builtinPath = path.join(this.builtinsDir, `${key}.json`);
    if (fs.existsSync(builtinPath) && !this.getDeletedProfiles().has(key)) {
      this.addDeletedProfile(key); deleted = true;
    }
    return deleted;
  }
  ```
* **Impacto:** Si un usuario crea un override local en su proyecto con el mismo nombre de un perfil global (ej: `deep-reasoning`), al borrarlo desde el proyecto se destruye silenciosamente el archivo global del usuario.
* **Solución requerida:** Parametrizar el scope: `deleteProfile(name: string, scope?: "project" | "global")`.

### 3.3 Pérdida de Subagentes Custom al Activar Perfil (`applyProfileToConfig`)
* **Archivo afectado:** `src/sync.ts` -> `applyProfileToConfig()`
* **Mecanismo del Fallo:**
  ```typescript
  const cleanedModelProfiles: Record<string, { model: string; effort?: string }> = {};
  for (const [agentKey, entry] of Object.entries(profile.model_profiles ?? {})) {
    // ... arma cleanedModelProfiles sólo con los agentes del perfil
  }
  nextConfig.model_profiles = cleanedModelProfiles; // <- Sobreescribe pisando todo lo anterior
  ```
* **Impacto:** Si el usuario tiene subagentes definidos en `subagents.json` por otras herramientas (ej: `my-worker`, `tester-army`, `dc-analyst`), activar un perfil elimina todos los agentes no contenidos explícitamente en el perfil activo.
* **Solución requerida:** Preservar los agentes preexistentes no gestionados por el perfil mediante merge de objetos.

### 3.4 Lógica Redundante / Rama Muerta en `saveCurrentAsProfile`
* **Archivo afectado:** `src/manager.ts` (líneas 177-185)
* **Código:**
  ```typescript
  let sourcePath = this.globalSubagentsPath;
  if (scope === "project" && fs.existsSync(this.projectSubagentsPath)) {
    sourcePath = this.projectSubagentsPath;
  } else if (fs.existsSync(this.projectSubagentsPath)) {
    sourcePath = this.projectSubagentsPath;
  }
  ```
* **Diagnóstico:** Si `projectSubagentsPath` existe, siempre se usa esa ruta sin importar si `scope` es `"global"`. La primera condición es código muerto redundante.

### 3.5 Bug de Expansión de Rutas en Windows (`resolvePath`)
* **Archivo afectado:** `src/storage.ts` -> `resolvePath()`
* **Código:**
  ```typescript
  private resolvePath(inputPath: string): string {
    const expanded = inputPath.startsWith("~/") || inputPath === "~"
      ? path.join(os.homedir(), inputPath.slice(1))
      : inputPath;
    return path.resolve(expanded);
  }
  ```
* **Diagnóstico:** En Windows, los separadores con barra invertida (`~\perfil.json` o `~\\perfil.json`) no cumplen `startsWith("~/")`. Como resultado, se crea una carpeta literal `~` en el directorio de trabajo local.

### 3.6 Descubrimiento de Modelos Ignora `.pi/models.json` de Proyecto
* **Archivo afectado:** `src/models-resolver.ts` -> `resolveModelsMetadata()`
* **Diagnóstico:** Solo inspecciona `~/.pi/agent/models.json` y `models-store.json`. En equipos que definen proveedores y modelos locales en `.pi/models.json` dentro de su repositorio, la extensión no los detecta.

### 3.7 Heurística Restrictiva de Reasoning Effort (Omisión de `off` y `max`)
* **Archivo afectado:** `src/models-resolver.ts` -> `getSupportedEffortsForModel()`
* **Diagnóstico:** Para modelos que matchean heurísticas de reasoning (`o3`, `gemini-2.5`, `claude-3-7`, `sonnet-4-5`), retorna estrictamente `["default", "low", "medium", "high"]`.
* **Impacto:** Omite `"off"` (apagar el pensamiento para reducir latencia/costo) y `"max"` (disponible en Claude 3.7 Sonnet y Opus 4.6).

### 3.8 Claves Huérfanas Kebab vs CamelCase en `settings.json`
* **Archivo afectado:** `src/shortcuts.ts` -> `updateShortcutsSettings()`
* **Diagnóstico:** Lee de `sddProfiles` o `sdd-profiles`, pero siempre guarda en `sddProfiles` sin eliminar `sdd-profiles`. Deja claves duplicadas y obsoletas en la configuración.

---

## 4. Auditoría Profunda de Seguridad & Threat Modeling

### 4.1 Sobreescritura Ciega de Archivos en `exportProfile`
* **Severidad:** **Media-Alta**
* **Archivo:** `src/storage.ts` -> `exportProfile()` y `src/modal.ts` (línea 1892)
* **Vulnerabilidad:** `exportProfile` utiliza directamente `fs.writeFileSync(resolvedPath, formatted, "utf-8")` sin verificar `fs.existsSync(resolvedPath)`.
* **Vector:** Si un usuario o script pasa una ruta sensible preexistente (ej: `~/.bashrc`, `~/.ssh/config` o un archivo fuente), se trunca y se pisa de inmediato sin confirmación ni advertencia.

### 4.2 Exposición de Tools Destructivas al LLM sin Guardias de Confirmación
* **Severidad:** **Media**
* **Archivo:** `index.ts` -> `sdd_profile_delete`
* **Vulnerabilidad:** La tool está expuesta globalmente al modelo sin confirmación humana previa.
* **Vector (Prompt Injection Indirecto):** Un contenido malicioso en un issue o diff puede inducir al modelo a llamar `sdd_profile_delete({ profile_name: "balanced-default" })`, borrando la configuración del usuario en caliente.

### 4.3 Prototype Pollution Potencial en Importación
* **Severidad:** **Baja** (Defensa en profundidad)
* **Archivo:** `src/storage.ts` -> `importProfile()`
* **Análisis:** En la asignación iterativa `modelProfiles[k] = ...`, si un archivo JSON malicioso contiene claves como `"__proto__"`, en V8 se altera la instancia local de prototipo. Debe filtrarse explícitamente `k !== "__proto__" && k !== "constructor" && k !== "prototype"`.

### 4.4 Sanitización de Nombres y Path Traversal
* **Estado:** **Seguro**
* **Mecanismo:** `sanitizeName()` reemplaza cualquier caracter que no sea `[a-z0-9_-]` por `-`. Nombres con secuencias `../../etc/passwd` quedan neutralizados a `----------etc-passwd`.

### 4.5 Superficie de Ejecución Remota (RCE)
* **Estado:** **Inexistente (Óptimo)**
* **Mecanismo:** El repositorio no utiliza `child_process`, `exec`, `spawn`, `eval`, `new Function` ni wrappers shell. Toda la lógica es puramente nativa de Node.js.

### 4.6 Gestión de Secretos y Credenciales
* **Estado:** **Óptimo**
* **Mecanismo:** La extensión no almacena ni procesa tokens ni API keys. Delega el despacho de credenciales al `modelRegistry` y a `pi.setModel` del entorno Pi.

---

## 5. Experiencia TUI y Evaluación del Monolito `src/modal.ts`

El componente visual `createSddProfilesModal` es una pieza sofisticada de ingeniería de terminal (2.676 líneas de código), pero sufre de alta densidad cognitiva:

* **Arquitectura de Estado:** Maneja más de 40 variables reactivas `let` en un único closure compartido.
* **Capacidades Sobresalientes:**
  - Navegación Miller Columns de 3 paneles con proporciones matemáticas fijas y auto-clamp adaptativo a la altura del terminal (hasta 15 filas útiles).
  - Árbol de categorías colapsable para agentes (`ODD Core`, `Judgment Day`, `Reviewers`, `SDD On-Demand`, `Custom Agents`).
  - Soporte bidireccional de mouse (scroll wheel y clics con discriminación por coordenadas X/Y para botones y filas).
  - Mini explorador interactivo de archivos para importar perfiles con vista jerárquica de directorios.
  - Diálogo modal de detección y resolución de conflictos de nombres (Sobreescribir vs. Renombrar con sugerencia automática).
* **Deuda Técnica:** Debe modularizarse dividiendo las vistas secundarias (`model-picker`, `import-browser`, `conflict-dialog`) en archivos independientes bajo `src/tui/`.

---

## 6. Persistencia, Watchers y Concurrencia

* **Atomicidad Garantizada:** `applyProfileToFile`, `saveProfile` y `updateShortcutsSettings` implementan escritura transaccional mediante archivos temporales `.tmp` y `fs.renameSync`.
* **Watcher Resiliente:** `SubagentsConfigWatcher` implementa un debounce de 200 ms y un flag de control `isReconciling` que evita que las propias escrituras atómicas de la extensión gatillen bucles infinitos de reconciliación en Linux/macOS.
* **Aislamiento de Procesos Hijos:** La extensión evalúa `process.env.GENTLE_PI_AGENTS_CHILD === "1"`, evitando que los subagentes ejecutados en procesos hijos pisen o alteren el modelo del orquestador principal.

---

## 7. Evaluación de Calidad de Código & Testing

* **Suite de Pruebas:**
  - 137 pruebas unitarias e integración en Vitest distribuidas en 11 archivos de test.
  - Cobertura de tests en: `storage`, `manager`, `modal`, `ui`, `sync`, `extension`, `catalog`, `watcher`, `shortcuts`, `models-resolver`, `types`.
  - Tiempo de ejecución: ~3.5 segundos con 100% de tests pasando.
  - Verificación de tipos TypeScript (`tsc --noEmit`): **0 errores**.
* **Trazabilidad ODD:**
  El repositorio cuenta con especificaciones completas de tareas en `odd/tasks/*.md`, lo que demuestra una rigurosa disciplina de desarrollo guiado por especificaciones.

---

## 8. Plan de Remediación Priorizado

### Fase 1: Corrección Inmediata (Onboarding & Integridad)
1. **Restaurar Plantillas Base:** Incorporar en `profiles/` perfiles por defecto probados (`balanced-default.json`, `deep-reasoning.json`) para restaurar la coherencia prometida en la documentación.
2. **Preservar Agentes Custom:** Modificar `applyProfileToConfig` en `src/sync.ts` para no borrar agentes preexistentes en `subagents.json`.
3. **Corregir `deleteProfile`:** Evitar el borrado en cascada del perfil global cuando se borra un perfil de proyecto con el mismo nombre.

### Fase 2: Seguridad & Robustez de Plataforma
4. **Verificación en `exportProfile`:** Validar existencia previa del archivo de destino y solicitar confirmación interactiva de sobreescritura.
5. **Protección de Tools LLM:** Restringir `sdd_profile_delete` para que opere únicamente bajo scope de proyecto o removerla del catálogo accesible por el modelo autónomo.
6. **Soporte Windows:** Actualizar `resolvePath` para aceptar `~\\` además de `~/`.
7. **Filtrar `__proto__`:** Descartar claves de prototipo en `importProfile()`.

### Fase 3: Mejoras de Arquitectura & UX
8. **Descubrimiento de Modelos Locales:** Agregar lectura de `${cwd}/.pi/models.json` en `models-resolver.ts`.
9. **Reasoning Completo:** Habilitar `"off"` y `"max"` en las opciones dinámicas de reasoning effort.
10. **Refactorización de `modal.ts`:** Descomponer el monolito de 2.676 líneas en submódulos especializados.
