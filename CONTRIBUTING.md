# Guía de Contribución 🤝 · *pi-sdd-profiles*

¡Gracias por tu interés en contribuir a **pi-sdd-profiles**! Este es un proyecto de código abierto desarrollado **de y para la comunidad** de usuarios de [Pi Coding Agent](https://github.com/badlogic/pi-mono). 

Todas las contribuciones son bienvenidas: desde corrección de errores, nuevos perfiles preconfigurados, mejoras en la interfaz de usuario (TUI), optimizaciones de rendimiento, hasta mejoras en la documentación.

---

## 📋 Tabla de Contenidos

- [Filosofía del Proyecto](#-filosofía-del-proyecto)
- [Requisitos Previos](#-requisitos-previos)
- [Configuración del Entorno de Desarrollo](#-configuración-del-entorno-de-desarrollo)
- [Ejecutar Tests](#-ejecutar-tests)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Pautas de Desarrollo y Buenas Prácticas](#-pautas-de-desarrollo-y-buenas-prácticas)
  - [1. Tests y TDD](#1-tests-y-tdd)
  - [2. Atajos de Teclado y Compatibilidad](#2-atajos-de-teclado-y-compatibilidad)
  - [3. Experiencia en Terminal (TUI) y Fallbacks](#3-experiencia-en-terminal-tui-y-fallbacks)
  - [4. Escritura Atómica y Seguridad de Datos](#4-escritura-atómica-y-seguridad-de-datos)
  - [5. Mensajes de Commit](#5-mensajes-de-commit)
- [Cómo Proponer Nuevos Perfiles Estándar](#-cómo-proponer-nuevos-perfiles-estándar)
- [Flujo de Pull Requests](#-flujo-de-pull-requests)
- [Código de Conducta](#-código-de-conducta)

---

## 💡 Filosofía del Proyecto

1. **Cero fricción out-of-the-box**: El usuario debe poder instalar el plugin y que funcione inmediatamente sin configuraciones complejas ni choques de atajos.
2. **Seguridad y Resiliencia**: Nunca corromper archivos existentes (como `subagents.json`). Respetar configuraciones ajenas y fallar de forma segura.
3. **Fluidez interactiva**: Las acciones frecuentes deben ser rápidas y cómodas (filtros en tiempo real, navegación ágil por teclado, confirmación visual sin cierres abruptos).

---

## 🛠️ Requisitos Previos

- **Node.js**: versión `>= 20.0.0` (recomendado v22+)
- **pnpm**: versión `>= 9` (`corepack enable pnpm` o `npm i -g pnpm`)
- **Git**
- **Pi Coding Agent**: instalado y configurado globalmente en tu máquina.

---

## 💻 Configuración del Entorno de Desarrollo

1. **Hacé un Fork y Cloná el repositorio:**
   ```bash
   git clone https://github.com/TU_USUARIO/pi-sdd-profiles.git
   cd pi-sdd-profiles
   ```

2. **Instalá las dependencias:**
   ```bash
   pnpm install
   ```

3. **Vinculá la extensión a tu Pi local:**
   Podés crear un enlace simbólico en tu carpeta global de extensiones de Pi para probar los cambios en vivo:
   ```bash
   mkdir -p ~/.pi/agent/extensions
   ln -s "$(pwd)" ~/.pi/agent/extensions/pi-sdd-profiles
   ```
   *(En Windows puedes usar `mklink /D "%USERPROFILE%\.pi\agent\extensions\pi-sdd-profiles" "%CD%"`)*

   Una vez vinculada, al abrir cualquier sesión de `pi` la extensión se cargará automáticamente.

---

## 🧪 Ejecutar Tests

Utilizamos **Vitest** para garantizar calidad y estabilidad. Antes de enviar un cambio, asegurate de que todos los tests pasen:

```bash
# Correr la suite completa una vez
pnpm test

# Correr en modo watch durante desarrollo
pnpm exec vitest

# Verificar tipos de TypeScript
pnpm exec tsc --noEmit
```

---

## 📂 Estructura del Proyecto

```text
pi-sdd-profiles/
├── index.ts               # Punto de entrada de la extensión Pi (comandos, tools, atajos)
├── src/
│   ├── types.ts           # Definiciones de tipos (Profile, ProfileSummary, ReasoningEffort, etc.)
│   ├── catalog.ts         # Catálogo de agentes SDD reconocidos y sus categorías
│   ├── manager.ts         # Lógica de negocio (SddProfileManager): listar, activar, crear, borrar
│   ├── storage.ts         # Persistencia atómica en disco (~/.pi/agent/profiles y .pi/profiles)
│   ├── sync.ts            # Sincronización atómica con subagents.json preservando configuración extra
│   ├── models-resolver.ts # Descubrimiento dinámico de modelos de IA en Pi
│   ├── modal.ts           # Ventana flotante interactiva TUI (@earendil-works/pi-tui)
│   ├── modal-formatting.ts# Formato visual, caja violeta oscuro, truncado seguro de texto
│   └── ui.ts              # Flujos interactivos por prompts CLI (fallback cuando no hay TUI)
├── test/                  # Tests unitarios con Vitest
├── profiles/              # Perfiles estándar incluidos de fábrica (built-in)
├── skills/                # Definición de la skill para el orquestador Pi
└── README.md              # Documentación principal para usuarios
```

---

## 📏 Pautas de Desarrollo y Buenas Prácticas

### 1. Tests y TDD
Cualquier funcionalidad nueva, ajuste en atajos o corrección de bugs debe acompañarse de su correspondiente test en `test/`. Priorizamos tests rápidos y determinísticos sin dependencias externas de red.

### 2. Atajos de Teclado y Compatibilidad
El atajo por defecto para abrir la ventana modal es **`Alt + M`** (Model / Modal). 
- **Regla**: Nunca agregues un atajo por defecto que colisione con atajos nativos de Pi (como `Alt+P` en Windows/WSL) o de paquetes estándar como Gentle Pi (`Alt+S`, `Alt+A`, `Alt+G`).

### 3. Experiencia en Terminal (TUI) y Fallbacks
- El modal interactivo se renderiza en una sola vista flotante limpia sobre la terminal.
- Cuando una acción se complete (como activar un perfil con `Enter`), **mantené la ventana abierta con feedback visual claro**, permitiendo al usuario cerrar con `Esc` o `q` solo cuando haya terminado su configuración.
- Siempre mantené funcionando el fallback CLI interactivo en `src/ui.ts` para entornos sin TUI completa (`ctx.ui.select`).

### 4. Escritura Atómica y Seguridad de Datos
Al modificar archivos de perfiles o `subagents.json`:
- Escribí primero a un archivo temporal (`.tmp.<timestamp>`).
- Renombrá de forma atómica con `fs.renameSync`.
- **Nunca** borres campos adicionales que el usuario o extensiones como `pi-subagents-j0k3r` hayan configurado en `subagents.json`.

### 5. Mensajes de Commit
Utilizamos la convención de [Conventional Commits](https://www.conventionalcommits.org/):
- `feat: ...` para nuevas funcionalidades.
- `fix: ...` para correcciones de bugs.
- `docs: ...` para documentación y guías.
- `test: ...` para añadir o corregir tests.
- `refactor: ...` para cambios de código que no alteran comportamiento.
- `chore: ...` para mantenimiento de dependencias o tareas de build.

---

## 📦 Cómo Proponer Nuevos Perfiles Estándar

Si diseñaste una combinación de modelos eficiente para una fase o flujo de trabajo (por ejemplo: perfiles orientados a modelos locales vía Ollama, perfiles para refactor masivo o perfiles para auditoría de seguridad):
1. Creá el archivo JSON correspondiente en la carpeta `profiles/<nombre-del-perfil>.json`.
2. Asegurate de que cumpla con el schema `Profile` (`name`, `description`, `default_model`, `default_effort`, `model_profiles`).
3. Creá un PR explicando por qué ese perfil beneficia a la comunidad y en qué casos de uso destaca.

---

## 🚀 Flujo de Pull Requests

1. Creá una rama descriptiva para tu cambio:
   ```bash
   git checkout -b feat/nombre-de-tu-mejora
   # o
   git checkout -b fix/descripcion-del-bug
   ```
2. Realizá tus cambios y corré los tests:
   ```bash
   pnpm test
   ```
3. Hacé commit con un mensaje claro y pusheá a tu fork:
   ```bash
   git add .
   git commit -m "feat(modal): add real-time model search filter"
   git push origin feat/nombre-de-tu-mejora
   ```
4. Abrí un Pull Request hacia la rama `main` del repositorio principal describiendo:
   - ¿Qué problema resuelve o qué valor aporta?
   - Pasos para probarlo.
   - Capturas de pantalla o gifs si modifica la interfaz TUI.

---

## 💖 Código de Conducta

Este proyecto fomenta un ambiente abierto, respetuoso, empático y colaborativo. Tratamos a todos los participantes con amabilidad, paciencia y profesionalismo. Cualquier conducta hostil, discriminatoria o irrespetuosa no es aceptada.

---

*¡Gracias por hacer de **pi-sdd-profiles** una herramienta cada día más potente para la comunidad! 🚀*
