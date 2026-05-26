# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server (HMR). The game runs entirely client-side.
- `npm run build` — `tsc && vite build`. Type errors fail the build.
- `npm run preview` — serve the production build.
- **Type check without building:** `tsc --noEmit` (use this, not `npx tsc`).

There is **no test framework and no lint config** in this repo. Type checking is the only automated gate.

Do **not** commit the `src/img/` directory (source art scratch space).

## Code style

- Put a **blank line before every `if` and `return` statement and after `const` block**.
- Strict TypeScript with `noUnusedLocals` / `noUnusedParameters` — unused symbols fail the build, so delete dead code rather than leaving it.
- Use React functional components only.
- Prefer named exports.
- Use `className`, never `class`.
- Keep components small and composable.
- Follow existing project patterns before introducing new abstractions.
- 
## Big picture

This is "Settlers", a browser RTS/colony game: an isometric tile map with units that gather resources, transport them, and construct/operate buildings. There is no backend — all state lives in a single Zustand store and persists to `localStorage`.

The codebase is split along a **renderer-agnostic boundary** that is the most important thing to understand:

- **Game logic & state** (`src/game/`, `src/store/`) — knows nothing about how anything is drawn.
- **Rendering** (`src/renderer/`) — reads game state and draws it. Two implementations exist (see "Three.js migration").
- **UI** (`src/components/`) — React DOM overlays (HUD, toolbar, panels) on top of the canvas.

### The store is the heart (`src/store/index.ts`)

One large Zustand store (`devtools` + `persist` middleware) holds three slices: `game` (map, units, buildings, resources, tick), `camera`, and `ui`. Plus an `occupants` index (`"col,row" -> unitId`) maintained alongside `units` for fast tile-occupancy lookups.

- **`tick()` is the simulation step** and by far the largest function. It runs the entire unit AI / resource-transport state machine, building construction, production cycles, food consumption, and population growth. When changing gameplay behavior, you are almost always editing `tick()`.
- Persistence: only the `game` slice is persisted, under localStorage key **`settlers-v3`**. If you change the shape of persisted state, bump this key and add migration logic in `loadGameState` (which already back-fills missing fields on load).
- `PLAYER_ID = 'player1'` — resources are keyed per owner; there is currently one player.

### Tick-based simulation (`src/hooks/useGameLoop.ts`)

Fixed 100ms timestep with an accumulator: the loop calls `tick()` zero-or-more times to catch up, then renders once per `requestAnimationFrame`. Simulation rate is decoupled from frame rate. Rendering reads the latest store state via `useStore.getState()` (not React subscriptions) to avoid re-render churn.

### Dual resource tracking (important gotcha)

Resources are tracked in **two places that must stay in sync**:
- `game.resources[PLAYER_ID]` — the global balance shown in the HUD.
- `building.inventory` — physical items actually stored in a specific building (storehouses, production buffers).

When a deposit/withdrawal happens, both are updated together. Consuming resources (e.g. food) must drain from building inventories *and* decrement the global counter, otherwise the HUD and storehouses diverge. See `drainFromStorehouses` in the store.

### Coordinate systems (`src/game/isoMath.ts`)

Three spaces: **grid** `(col,row)` ↔ **world** (isometric, `TILE_W=64`, `TILE_H=32`, 2:1 diamond) ↔ **screen** (camera pan `x,y` + `zoom`). Tiles are stored in `map.tiles` as a flat record keyed `"${col},${row}"`. Map is `MAP_COLS×MAP_ROWS` (120×120). Mouse picking goes screen → world → grid.

### Config-driven buildings (`src/game/buildingConfig.ts`)

Building behavior is data, not code: footprints, construction materials & ticks, per-level worker capacity, production input/output/cycle configs, and upgrade costs are all lookup tables here, with helper functions (`canPlaceBuilding`, `getFootprintTiles`, `getWorkerCapacity`, `getCurrentOutput`, etc.). Add or tune a building by editing these tables.

### Pathfinding (`src/game/pathfinding.ts`)

A* over the tile grid. `findPath(map, ...startend..., blocked?)` takes an optional `blocked` set of `"col,row"` keys (building footprints) so units route around buildings — the destination tile is always permitted even if blocked. `findRoadPath` is a cardinal-only variant for road placement.

### 2D renderer (`src/renderer/`)

`Renderer.ts` applies the camera transform and calls layers in painter's order: tiles → resources → buildings → selection → units → placement preview → debug. Each `layers/*Layer.ts` is a pure draw function. Asset loaders (`*Loader.ts`, `tileTextures.ts`, `roadGen.ts`) preload sprite sheets / bake procedural canvas textures; assets are served from `public/assets/`.

### Three.js migration (in progress, `src/renderer/gl/`)

A WebGL renderer is being built to replace the 2D canvas, **side-by-side behind a flag**: press **`G`** (or add `?gl=1` to the URL) to toggle. `App.tsx` swaps `<GameCanvas>` for `<GameCanvasGL>`. The game logic/store is shared and untouched; only the render + input layer differs. Key points:
- Fixed **dimetric orthographic** camera (30° elevation / 45° azimuth) to match the 2:1 look of the existing sprite art — pan/zoom only, no free rotation.
- Terrain is **one continuous heightmap mesh** (`gl/terrain.ts`) whose visual resolution is decoupled from the gameplay grid via `TERRAIN_SUB` (subdivision factor). Smooth vertex-color interpolation + noise replace the per-tile diamond blending of the 2D renderer.
- The 2D renderer remains the source of truth for feature parity until the GL path catches up; do not delete it.

## Input & interaction (`src/hooks/useCamera.ts`)

All canvas mouse/keyboard handling for the 2D renderer lives here: pan/zoom, unit box-selection and click-selection, building placement preview, road path drawing, and gather/move commands. It does its own hit-testing in world space (units, buildings, resources). The `G`-toggle GL path has its own minimal input handling in `GameCanvasGL.tsx`.
