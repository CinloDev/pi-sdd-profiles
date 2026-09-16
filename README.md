# pi-sdd-profiles 🤖 · *De y para la Comunidad*

Extensión nativa para **Pi Coding Agent** para crear, guardar, versionar y alternar perfiles de modelos de IA para **Spec-Driven Development (SDD)** y subagentes en caliente.

Se integra de forma transparente y atómica con [`pi-subagents-j0k3r`](https://github.com/j0k3r-dev-rgl/pi-subagents-j0k3r), actualizando las asignaciones de modelos en `subagents.json` sin alterar timeouts, atajos de teclado ni herramientas configuradas.

<p align="center">
  <img src="public/1.png" alt="SDD Profile Manager — Ventana Flotante Modal" width="850" />
</p>

---

## 🚀 Inicio Rápido (30 segundos)

1. **Instalá el paquete en Pi:**
   ```bash
   pi install https://github.com/CinloDev/pi-sdd-profiles
   ```
2. **Abrí tu terminal Pi:**
   ```bash
   pi
   ```
3. **Abrí el gestor de perfiles:**
   Presioná `Alt + M` (o `Ctrl + Shift + M`, o escribí `/sdd-profile`).
4. **Elegí y activá:**
   Navegá con las flechas, seleccioná un perfil (por ejemplo `balanced-default` o `deep-reasoning`) y presioná `Enter`. ¡Listo! Tus modelos se sincronizan en caliente sin reiniciar Pi.

---

## 📦 Instalación y Gestión

Pi Coding Agent incluye un gestor nativo de paquetes (`pi install / update / remove`) que registra automáticamente tanto las **extensiones** (`index.ts`) como las **skills** (`skills/sdd-profiles`).

### 1. Instalación Global (Recomendada)
Para tener `pi-sdd-profiles` disponible en todas tus sesiones y proyectos de Pi:

```bash
pi install https://github.com/CinloDev/pi-sdd-profiles
```
*(También podés usar la sintaxis abreviada `pi install git:github.com/CinloDev/pi-sdd-profiles`)*.

### 2. Instalación solo para el Proyecto Actual
Si querés registrar la extensión únicamente dentro del directorio de trabajo actual (escribe en `.pi/settings.json`):

```bash
pi install -l https://github.com/CinloDev/pi-sdd-profiles
```

### 3. Probar sin instalar (sesión temporal)
Si querés probar la extensión en una sola ejecución sin modificar tu configuración permanente:

```bash
pi -e https://github.com/CinloDev/pi-sdd-profiles
```

### 4. Instalación Local / Para Desarrollo
Si clonaste o descargaste el repositorio en tu máquina:

```bash
git clone https://github.com/CinloDev/pi-sdd-profiles.git
cd pi-sdd-profiles

# Instalarlo en Pi como paquete local:
pi install .
```

O si preferís vincularlo mediante un enlace simbólico para reflejar cambios de código en tiempo real:

```bash
mkdir -p ~/.pi/agent/extensions
ln -s "$(pwd)" ~/.pi/agent/extensions/pi-sdd-profiles
```
*(En Windows: `mklink /D "%USERPROFILE%\.pi\agent\extensions\pi-sdd-profiles" "%CD%"`)*.

### 5. Actualización
Para actualizar a la última versión disponible del repositorio:

```bash
pi update https://github.com/CinloDev/pi-sdd-profiles
```
O para actualizar todos los paquetes instalados en tu Pi:
```bash
pi update --all
```

### 6. Desinstalación
Si en algún momento querés remover el paquete:

```bash
pi remove https://github.com/CinloDev/pi-sdd-profiles
```

---

## ⚙️ Requisitos y Compatibilidad

- **Pi Coding Agent**: v0.50.0 o superior (`node >= 20`).
- **Subagentes / SDD**: Diseñado para trabajar en armonía con [`pi-subagents-j0k3r`](https://github.com/j0k3r-dev-rgl/pi-subagents-j0k3r) o cualquier entorno que lea `subagents.json`.
- **Creación automática de configuración**: Si aún no tenés un archivo `subagents.json` en tu sistema (`~/.pi/agent/subagents.json` o `.pi/subagents.json`), la extensión lo crea automáticamente y de forma segura al activar tu primer perfil.

---

## ✨ Características

- 🪟 **Ventana Flotante Modal Interactiva**: Se abre centrada en la terminal (`alt+m`, `ctrl+shift+m` o `/sdd-profile`) sin borrar el historial ni salir del contexto.
- 🖱️ **Soporte Completo de Mouse (Ruedita y Clics)**: Hacé scroll con la rueda del mouse por listas largas, seleccioná filas con un clic, activá perfiles o abrí selectores con doble clic, y clickeá directamente los botones de acción (`[Activar]`, `[Editar]`, `[Nuevo]`, `[Guardar]`, `[Salir]`) en modo fullscreen.
- ⚡ **Cambio en caliente**: Alterná perfiles y sincronizá el modelo de sesión y los subagentes al instante.
- 📦 **Perfiles Estándar Incluidos**:
  - `balanced-default`: Equilibrio entre calidad y costo con Claude Sonnet 4.5 y Claude Haiku 4.5.
  - `deep-reasoning`: Máximo nivel de razonamiento (`max`/`high`) con OpenAI o3-mini en fases críticas de diseño y revisión.
  - `speed-economy`: Velocidad y costo mínimo para tareas ligeras e iteraciones directas.
- 🎨 **Cockpit Visual y Editor en Pantalla**: Navegá con flechas (`↑`/`↓`), activá con `Enter`, editá con `e`, asigná modelos por lote con `a` o `c`, y guardá con `s`.
- 📋 **Descubrimiento Automático de Modelos**: Despliega todos los modelos configurados en tu Pi (`cpamc/...`, `opencode-go/...`, locales o remotos) sin escribir nada a mano.
- 🛡️ **Escritura Atómica y Protección de Perfil Activo**: Preserva 100% de la configuración de `subagents.json` (`timeout_ms`, `history_panel_shortcut`, `default_tools`, etc.) mediante renombrado atómico. Si una herramienta externa (como `gentle-pi` al arrancar o recargar sesión) pisa `model_profiles`, el plugin detecta la divergencia y re-afirma automáticamente las asignaciones del perfil activo sin bucles ni sobreescrituras innecesarias.
- 🌐 **Soporte Global y por Proyecto**: Tus perfiles personalizados se guardan localmente en `~/.pi/agent/profiles/` (globales) o en `.pi/profiles/` (del proyecto).
- 🧠 **Skill Incluida**: Provee la skill `sdd-profiles` para que el orquestador y los agentes sepan gobernar y sugerir perfiles.
- 🤖 **Herramientas para el Orquestador**: Expone `sdd_profile_list`, `sdd_profile_switch`, `sdd_profile_rename` y `sdd_profile_delete` como tools para que el orquestador pueda conmutar o administrar perfiles programáticamente.

---

## 🎛️ Controles en la Ventana Flotante (`alt+m` / `ctrl+shift+m`)

### 🖱️ Navegación con Mouse (Modo Fullscreen)
Si utilizás Pi en modo fullscreen (`--tui-mode fullscreen` o en `/settings` con `tuiMode: "fullscreen"`), tenés soporte de puntero completo:
- **Rueda del mouse**: Navegá fluidamente hacia arriba o abajo en cualquier lista (perfiles, subagentes, buscador de modelos, categorías, esfuerzos).
- **Clic izquierdo**: Selecciona de inmediato el ítem o fila clickeada. Si hacés clic sobre un ítem ya seleccionado, lo activa o abre su configuración.
- **Doble clic**: Activa el perfil en la lista principal, abre el selector de modelos en el editor o confirma la opción seleccionada.
- **Clic en botones de acción**: Podés clickear directamente los atajos de la barra superior o inferior (`[Enter] Activar`, `[e] Editar`, `[r] Renombrar`, `[n] Nuevo`, `[d] Borrar`, `[s] Guardar`, `[Esc] Salir/Volver`, `Confirmar`, `Cancelar`).

### Vista Principal (Lista de Perfiles)
- `↑` / `↓` o `j` / `k`: Moverse entre los perfiles disponibles.
- `Enter`: Activar el perfil seleccionado en caliente (permanece abierto con confirmación visual para que puedas seguir configurando o explorando).
- `e`: Abrir el editor de modelos del perfil seleccionado.
- `r`: Renombrar el perfil seleccionado (abre una pantalla rápida para editar el nombre).
- `n`: Crear un nuevo perfil personalizado.
- `d` / `Supr` (`Delete`): Borrar perfil personalizado (con diálogo de confirmación para evitar pérdidas accidentales). 
- `Esc` o `q`: Cerrar la ventana flotante.

### Vista de Edición (`e` dentro de un perfil)
- `↑` / `↓`: Navegar por la lista de agentes.
- `Enter` o `m`: Abrir selector flotante de modelos para el agente seleccionado.
- `e`: Cambiar el nivel de esfuerzo de razonamiento.
- `a`: Asignar un modelo a **TODOS** los agentes del perfil en un solo paso.
- `c`: Asignar un modelo a una **Categoría** entera (Núcleo SDD, Judgment Day, Revisores).
- `s`: Guardar los cambios del perfil.
- `Esc`: Volver a la lista de perfiles.

<p align="center">
  <img src="public/2.png" alt="SDD Profile Manager — Editor de Perfil" width="850" />
</p>

---

### Selector Desplegable de Modelos (con Filtro en Tiempo Real)
Al asignar un modelo a cualquier agente o categoría, se abre la lista flotante con todos los modelos disponibles en tu entorno:
- **Buscador/Filtro reactivo**: Escribí cualquier término (ej: `flash`, `sonnet`, `gemini`, `o3`) para filtrar al instante entre 50+ modelos.
- `Backspace`: Borra caracteres del filtro de búsqueda.
- `↑` / `↓`: Navegar únicamente entre los modelos coincidentes.
- `Enter`: Confirmar y pasar a la selección de nivel de razonamiento (`effort`).
- `Esc`: Limpiar filtro o volver al editor.

<p align="center">
  <img src="public/3.png" alt="SDD Profile Manager — Selector de Modelos" width="850" />
</p>

---

## ⌨️ Comandos

| Comando | Descripción |
|---|---|
| `/sdd-profile` | Abre el selector interactivo nativo en terminal. Incluye la opción para crear nuevos perfiles. |
| `/sdd-profile apply <nombre>` | Activa directamente un perfil por su nombre. Agregá `--project` para aplicarlo solo localmente. |
| `/sdd-profile shortcut [disable-alt\|enable-alt\|set\|reset]` | Inspecciona o personaliza los atajos de teclado para evitar conflictos con otras extensiones. |
| `/sdd-profile unset [--global]` | Elimina el override de perfil activo local del proyecto (o global con `--global`), volviendo a heredar la configuración base. |
| `/sdd-profile clear-local` | Alias equivalente a `unset`, limpia el perfil activo local del proyecto. |
| `/sdd-profile create <nombre> [modelo] [effort]` | Crea un nuevo perfil. Si omitís los argumentos, inicia el asistente guiado. |
| `/sdd-profile save <nombre> [desc]` | Captura la configuración actual de `subagents.json` y la guarda como un nuevo perfil reutilizable. |
| `/sdd-profile set <perfil> <agente> <modelo> [effort]` | Asigna o modifica el modelo de un agente específico dentro de un perfil. |
| `/sdd-profile list` | Muestra en el chat el listado completo de perfiles disponibles y sus scopes. |
| `/sdd-profile show <nombre>` | Muestra el desglose detallado de modelos asignados por categoría (Núcleo SDD, Judgment Day, Revisores, etc.). |
| `/sdd-profile rename <nombre> <nuevo>` | Renombra un perfil personalizado existente y actualiza el puntero activo si estaba seleccionado. |
| `/sdd-profile delete <nombre>` | Elimina un perfil personalizado creado por el usuario. |

### Atajos de teclado y Personalización
- **`Ctrl + Shift + M`**: Atajo principal universal (recomendado, sin colisiones en Linux, macOS y Windows).
- **`Alt + M`**: Atajo alternativo rápido (compatible con instalaciones estándar).
- `/sdd-profile`: Comando equivalente para abrir la interfaz desde cualquier entorno o terminal.

#### 🔧 Evitar conflictos con otras extensiones (ej. `pi-intercom`)
Si utilizás extensiones como `pi-intercom` que también reclaman `Alt + M`, podés desactivar fácilmente el registro de `Alt + M` para dejar libre ese atajo:
- Desde la terminal de Pi:
  ```bash
  /sdd-profile shortcut disable-alt
  ```
- O configurándolo directamente en tu `~/.pi/agent/settings.json` (o `.pi/settings.json`):
  ```json
  {
    "sddProfiles": {
      "disableAltShortcut": true
    }
  }
  ```
  O definiendo tus atajos personalizados:
  ```json
  {
    "sddProfiles": {
      "shortcuts": ["ctrl+shift+m", "alt+o"]
    }
  }
  ```

> 💡 **Nota para usuarios de macOS:**
> En macOS, por defecto terminales como Terminal.app o iTerm2 utilizan la tecla `Option` para componer caracteres tipográficos especiales (por ejemplo, `Option + M` emite el caracter `µ`).
> - Podés usar directamente **`Ctrl + Shift + M`** o el comando `/sdd-profile` sin configurar nada adicional.
> - Si preferís usar `Option + M`, activá *"Use Option as Meta key"* en las preferencias de tu terminal (*Terminal.app: Settings → Profiles → Keyboard → Use Option as Meta key*; *iTerm2: Settings → Profiles → Keys → Left Option Key: Esc+*).

---

## 📄 Estructura de un Perfil (`*.json`)

Los perfiles se guardan como archivos JSON limpios e intuitivos en `~/.pi/agent/profiles/` o `.pi/profiles/`:

```json 
{
  "name": "mi-perfil",
  "description": "Configuración personalizada para desarrollo rápido",
  "default_model": "anthropic/claude-sonnet-4-5",
  "default_effort": "high",
  "model_profiles": {
    "sdd-explore": { "model": "anthropic/claude-haiku-4-5", "effort": "low" },
    "sdd-propose": { "model": "anthropic/claude-sonnet-4-5", "effort": "high" },
    "sdd-apply": { "model": "anthropic/claude-sonnet-4-5", "effort": "high" },
    "jd-judge-a": { "model": "anthropic/claude-sonnet-4-5", "effort": "high" },
    "jd-judge-b": { "model": "openai/o3-mini", "effort": "high" }
  }
}
```

---

## 🧪 Tests

El proyecto cuenta con suite completa de tests unitarios y verificación estricta de tipos:

```bash
pnpm test
pnpm typecheck
```

---

## 🤝 Contribuir

¡Las contribuciones son más que bienvenidas! Si querés reportar un bug, sugerir un nuevo perfil o sumar código, leé nuestra [Guía de Contribución](CONTRIBUTING.md) para conocer las pautas de arquitectura, atajos y tests.

---

## 📜 Licencia
MIT
