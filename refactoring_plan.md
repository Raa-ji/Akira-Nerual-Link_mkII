# Refactoring Plan: Akira - Neural Link (v1.11)

## Objective
Refactor the single-file, vanilla JavaScript game (`Akira_Implants_v10.html`) into a modular, class-based ES6 architecture. The goal is to preserve **exact** gameplay behavior while improving code maintainability, readability, and separation of concerns.

**Critical Constraint:** Do not alter game mechanics, rule timings, or visual effects until the refactoring is complete. This is a *structural* rewrite, not a feature update.

---

## 1. File Structure & Architecture

We will decompose the single script into the following modules:

| File | Responsibility |
| :--- | :--- |
| `index.html` | Minimal shell. Loads `styles.css` and `main.js` as an ES module. |
| `styles.css` | All CSS extracted from the HTML `<style>` block. Includes CRT effects, HUD styling, and responsiveness. |
| `main.js` | Entry point. Imports all modules, initializes the game engine, and starts the loop. |
| `config.js` | **Constants only.** All configuration objects (`RULES`, `TILE`, `COLORS`, etc.) and hard-coded data. |
| `mapData.js` | The 64x64 grid array (`levelMap`). Exports a function or constant to prevent accidental mutation during load. |
| `player.js` | **Player Class.** Holds position, health, speed, and state flags (e.g., `isCleaningNode`). Contains movement logic. |
| `rulesManager.js` | **Rules Manager Class.** Manages rule states, cooldowns, timers, and the "Neural Link" delay system. |
| `virus.js` | **Virus Class/Manager.** Handles virus AI, movement, infection logic, and state flags (e.g., `isStopped`). |
| `node.js` | **Node Manager.** Manages system nodes, their infection status, and healing properties. |
| `renderer.js` | **Raycaster & Renderer.** Contains all Canvas drawing logic: `castRays()`, `renderSprites()`, floor rendering, and infection visual effects. |
| `gameEngine.js` | **Game Loop & State.** The core `update(dt)` and `render()` loop. Orchestrates calls between Player, AI, Rules, and Renderer. Handles Win/Lose conditions. |

---

## 2. Step-by-Step Refactoring Execution Plan

Execute these steps in order. Each step should be validated before proceeding to the next to ensure no behavioral drift.

### Phase 1: Foundation & Constants
1. **Create `index.html`**: Minimal HTML with `<canvas id="gameCanvas">`, HUD divs (hidden initially or static), and `<script type="module" src="main.js"></script>`.
2. **Create `styles.css`**: Move all CSS from the original file. Ensure IDs like `#hud`, `#healthFill`, `#miniMapCanvas` are preserved.
3. **Create `config.js`**: Extract all constant definitions.
    - `TILE` object (EMPTY, WALL, FIREWALL, etc.)
    - `COLORS` object
    - `RULES` array
    - Configuration objects: `VIRUS_DAMAGE_CONFIG`, `CAPTURE_CONFIG`, `CLEANING_CONFIG`, `INFECTION_EFFECTS_CONFIG`, `HEALING_CONFIG`.
    - **Note:** Do not include game state variables here. Only static configuration.

### Phase 2: Data Layer
4. **Create `mapData.js`**: Export the `levelMap` 64x64 array. Ensure it is immutable during gameplay (use a deep copy or read-only export if possible, though initial load can be mutable for simplicity if needed).

### Phase 3: Game Entities (Player & Enemies)
5. **Create `player.js`**: Define a `Player` class.
    - Properties: `x`, `y`, `angle`, `health`, `speed`, `speedMultiplier`, `infectionStates`, etc.
    - Methods: `move(dt)`, `checkCollision(tileX, tileY)`, `applyInfectionEffects(dt)`, `tryHeal(dt)`.
    - **Key:** Move `handleInput` logic here, but keep input *listening* in the engine or a separate input handler if preferred. For now, bind keyboard events to Player methods.

6. **Create `virus.js`**: Define a `Virus` class or Manager.
    - Properties: `id`, `x`, `y`, `speed`, `isStopped`, `isSlowed`.
    - Methods: `updateAI(dt, player)`, `tryDamagePlayer(player)`, `infectNode(node)`.
    - Include helper methods for line-of-sight checks (`hasLineOfSight`).

7. **Create `node.js`**: Define a `SystemNode` class or Manager.
    - Properties: `id`, `name`, `x`, `y`, `infected`.
    - Methods: `getInfectionEffect()`, `isSecure()`.

### Phase 4: Systems Logic
8. **Create `rulesManager.js`**: Define a `RulesManager` class.
    - Properties: `toggleStates`, `durationTimers`, `pendingToggleRules`, `toggleDelayTimers`.
    - Methods: `activateRule(ruleId, activator)`, `update(dt)`, `applyEffects()`.
    - **Crucial:** Preserve the complex logic for "Neural Link" delays and Rule 2 (Locking Nodes).

9. **Create `mapData.js`**: Ensure it exports the map grid.

### Phase 5: Rendering & Visuals
10. **Create `renderer.js`**: Define a `Renderer` class.
    - Properties: Reference to `ctx` and `canvas`.
    - Methods:
        - `render(player, viruses, nodes)`: Main render call.
        - `castRays(player)`: Raycasting logic (`castRays`, `getWallColor`).
        - `renderSprites(viruses, nodes, player)`: Sprite rendering (`renderSprites`, `projectToScreen`).
        - `renderMiniMap(player, map)`: Mini-map radar logic.
        - `applyVisualInfectionEffects(infectionStates)`: Screen shake, RGB static.
        - `renderVaporwaveFloor()`: Floor grid rendering.

### Phase 6: Game Loop & Integration
11. **Create `gameEngine.js`**: The central orchestrator.
    - Methods: `startGame()`, `update(dt)`, `render()`, `checkWinLoseConditions()`.
    - Logic: Call `player.update()`, `virusManager.update()`, `rulesManager.update()`, then `renderer.render()`.
    - Handle Win/Lose states and game over overlays.

12. **Update `main.js`**: Entry point.
    - Import all modules.
    - Initialize instances of `Player`, `Virus`, `Node`, `RulesManager`, `Renderer`.
    - Set up the event listeners (Keyboard/Mouse if added later).
    - Start the `requestAnimationFrame` loop.

---

## 3. Critical Code Translation Guidelines

### A. State Management Refactoring
- **Current:** Global variables like `player`, `viruses`, `systemNodes`, `ruleBlocks` are mutated directly.
- **Target:** Encapsulate these in classes or manager objects. Access state via getters/setters or method calls to enforce consistency.
    - *Example:* Instead of `player.health -= damage`, use `player.takeDamage(damage)`.

### B. Rule Logic Preservation
- The rule system is complex with toggles, durations, and dependencies (e.g., Rule 2 affects Node infection effects).
- **Action:** Move all rule logic into `RulesManager`. Ensure `node.js` and `virus.js` query the manager for current rule states instead of checking global flags directly.

### C. Infection Effects
- The "Infection Effects" (screen shake, speed reduction) are currently calculated in a global function.
- **Action:** Move this logic into `Player` (for self-effects like speed/health) and `Renderer` (for visual effects like screen shake). `RulesManager` should inform the player of relevant infection states.

### D. Input Handling
- Keep keyboard input handling simple for now. Bind `keydown`/`keyup` in `main.js` or a dedicated `InputHandler` module.
- **Note:** Mouse pointer lock is out of scope. Focus on WASD + Arrow keys/Q/E.

### E. Raycasting & Rendering
- The raycaster uses hardcoded constants like `FOV`, `RAY_COUNT`, `MAX_DEPTH`. Move these to `config.js`.
- Ensure `projectToScreen` and `castRays` are clean, well-commented functions within `renderer.js`.
- **Preserve:** All visual quirks (e.g., the specific way the floor grid is drawn, the exact RGB static effect) must remain unchanged.

---

## 4. Specific Refactoring Notes for LLM Agents

### When Creating `config.js`:
- Include all `const` definitions from the top of the HTML file.
- Ensure `TILE` IDs match exactly (0=EMPTY, 1=WALL, 2=FIREWALL, etc.).
- Keep `RULES` array intact, including cooldowns and durations.

### When Creating `player.js`:
- Convert the `player` object into a class: `class Player`.
- Methods to extract:
    - `move(dt)`: Forward/backward/strafe movement.
    - `handleInput(keys)`: Read from a key state dictionary.
    - `applyInfectionEffects(dt)`: Speed reduction, health drain.
    - `tryHeal(dt)`: Life Support and Coolant healing logic.
    - `cleanNode(node, dt)`: Infection cleaning logic (standing still for 8s).

### When Creating `rulesManager.js`:
- This is critical. It must handle:
    - `TOGGLE` rules (Rule 1, Rule 2): Persistent state with cooldowns.
    - `DURATION` rules (Rule 3, 4, 5): Timers that decay, then enter cooldown.
    - **Neural Link Delay:** If Node 3 is infected, toggle rules have a 1.5s delay. This logic must be preserved exactly.

### When Creating `virus.js`:
- Convert `viruses` array elements into `Virus` instances.
- Methods:
    - `updateAI(dt, player)`: Hunt mode, targeting nodes, interacting with rule blocks.
    - `tryDamagePlayer(player)`: Damage application with cooldowns.
    - `infectNode(node)`: Mark node as infected.

### When Creating `node.js`:
- Convert `systemNodes` array into `SystemNode` instances or a manager.
- Properties: `infected`, `health` (if applicable, currently just boolean infection), `effectName`.

### When Creating `renderer.js`:
- This file will be large. Split it internally if needed, but keep it as one module for cohesion.
- Methods to extract:
    - `castRays(player)`: The main raycasting loop.
    - `renderSprites(viruses, nodes, player)`: Drawing entities.
    - `applyVisualInfectionEffects(infectionStates)`: Screen shake and RGB static.
    - `drawMiniMap(player)`: Radar rendering.

### When Creating `gameEngine.js`:
- This is the `update(dt)` and `render()` loop holder.
- It will orchestrate:
    1. `player.update(dt)`
    2. `rulesManager.update(dt)`
    3. `virusManager.update(dt, player)`
    4. `checkWinLoseConditions()`
    5. `renderer.render(player, viruses, nodes)`

---

## 5. Validation Checklist

After each module creation, verify:
1. **No Behavioral Drift:** Playtest the game. Does it feel identical? Do rules trigger correctly? Does infection spread?
2. **No Broken References:** Ensure all global variables (`player`, `viruses`, etc.) are replaced with class instances or method calls.
3. **Preserved Constants:** Verify tile IDs, rule timings, and map data are unchanged.
4. **Visual Fidelity:** Ensure CRT effects, scanlines, and HUD styling are identical.

---

## 6. Final Deliverables

1. `index.html`: Clean, minimal shell.
2. `styles.css`: All CSS from original file.
3. `config.js`: All constants and configuration objects.
4. `mapData.js`: The 64x64 grid.
5. `player.js`: Player class with movement, health, and infection effects.
6. `rulesManager.js`: Centralized rule management (timers, cooldowns, delays).
7. `virus.js`: Virus AI and behavior.
8. `node.js`: System node management.
9. `renderer.js`: All rendering logic (raycasting, sprites, effects).
10. `gameEngine.js`: Game loop and state orchestration.
11. `main.js`: Entry point.

This plan ensures a clean, modular architecture while preserving the exact gameplay experience of the original monolithic file. Proceed with execution following these steps.