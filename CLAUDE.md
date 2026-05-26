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
- Do not use magic string or magic numbers - put everything into constants
- Follow existing project patterns before introducing new abstractions.

## Big picture

This is "Settlers", a browser RTS/colony game: an isometric tile map with units that gather resources, transport them, and construct/operate buildings. There is no backend — all state lives in a single Zustand store and persists to `localStorage`.

The codebase is split along a **renderer-agnostic boundary** that is the most important thing to understand:

- **Game logic & state** (`src/game/`, `src/store/`) — knows nothing about how anything is drawn.
- **Rendering** (`src/renderer/`) — reads game state and draws it. Two implementations exist (see "Three.js migration").
- **UI** (`src/components/`) — React DOM overlays (HUD, toolbar, panels) on top of the canvas.

### The store is the heart (`src/store/index.ts`)

One large Zustand store (`devtools` + `persist` middleware) holds three slices: `game` (map, units, buildings, resources, tick), `camera`, and `ui`. Plus an `occupants` index (`"col,row" -> unitId`) maintained alongside `units` for fast tile-occupancy lookups.

- **`tick()` is the simulation step** and by far the largest function. It runs the entire unit AI / resource-transport state machine, building construction, production cycles, food consumption, and population growth. When changing gameplay behavior, you are almost always editing `tick()`.
- Persistence: only the `game` slice is persisted, under localStorage key **`settlers-v7`**. If you change the shape of persisted state, bump this key and add migration logic in `loadGameState` (which already back-fills missing fields on load).
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

### WebGL renderer (`src/renderer/gl/`) — now the default

The Three.js renderer is the default; press **`G`** (or add `?2d` to the URL) to fall back to the 2D canvas. `App.tsx` swaps `<GameCanvas>` for `<GameCanvasGL>`. Game logic/store is shared and untouched — only the render + input layer differs. The 2D renderer is kept as a fallback; don't delete it.

Pieces:
- **`GLScene`** — owns the renderer, the fixed **dimetric orthographic** camera (low tilt matching the sprite-art angle, pan/zoom only), lights, water plane, hover/selection tile highlights, raycast picking, and the per-frame loop hooks. Holds `GLWorld` + `GLEntities`.
- **`GLWorld`** — streams the world. Terrain + forest are built as **chunks** (`TERRAIN_CHUNK_TILES`) only around the camera and freed when they leave range, so cost scales with the *view*, not the 840² map. Per-chunk **LOD** (distant chunks coarser), **manual AABB frustum culling**, and **terrain LOD rebuilds** as the camera moves.
- **`terrain.ts`** — builds a single chunk's heightmap mesh from a shared height/color field (so chunks tile seamlessly); analytic normals from the field (no LOD-seam cracks). Tile types are read from a precomputed `Int8Array` grid (no per-vertex allocation → cheap builds). `createHeightSampler` gives picking/entities the same heights.
- **`GLForest`** — builds a chunk's trees as one `InstancedMesh` per variant (pine/oak/bush; models loaded once in `glModels.ts`). Trees only render within a small radius of the camera; a shader (`glModels` `injectSway`) adds per-instance wind sway and a **periphery shrink** (trees scale to nothing toward the draw-distance edge instead of popping). Material is `MeshLambertMaterial` (cheap shading).
- **`GLEntities`** — units (animated settler GLB) + buildings (placeholder boxes) synced from the store each frame.
- **`dayNightCycle.ts` / `worldClock.ts`** — sun direction/color/intensity + sky from the game tick (real Wrocław sunrise/sunset per season); bottom-right clock.

#### Performance levers (most impactful first)

The on-screen HUD shows `FPS · calls · tris · trees` (`FpsIndicator`) — use it to find the bottleneck (high `tris` = geometry/culling; low `tris` but low FPS = CPU/build churn).

- **`terrainSub`** (`glParams.ts`, live in the dev panel) — terrain mesh density. The single biggest vertex lever.
- **`MAP_COLS/ROWS`** (`constants.ts`) — map size. Bump the persist key (`settlers-vN` in `store/index.ts`) when changed so a fresh map regenerates (tiles aren't persisted — only the seed).
- **`MAX_RADIUS_CHUNKS`, `BUILD_BUDGET`, `lodSubFor`** (`GLWorld.ts`) — how far terrain streams (memory/zoom-out cost), chunks built per frame (fill speed vs. hitch), and the distance→LOD tiers.
- **`FOREST_DENSITY`, `SCALE_MIN/MAX`** (`GLForest.ts`) — tree count and height spread (fewer + taller still reads as dense).
- **`TREE_RADIUS_CHUNKS`, `FADE_START/FADE_END`** (`GLWorld.ts`) — tree draw distance + the periphery fade range.
- **`TREE_HIDE_ZOOM`** (`GLScene.ts`) — hides trees entirely when zoomed far out.
- **`MIN_ZOOM`** (`GLScene.ts`) — lower = zoom out further (bigger footprint = more chunks = heavier).
- Trees are instanced + use a cheap Lambert material; the tile-type grid keeps chunk building allocation-free. These were the fixes that took it from ~15 to 80–100+ FPS on the 840² map.

## Input & interaction (`src/hooks/useCamera.ts`)

All canvas mouse/keyboard handling for the 2D renderer lives here: pan/zoom, unit box-selection and click-selection, building placement preview, road path drawing, and gather/move commands. It does its own hit-testing in world space (units, buildings, resources). The `G`-toggle GL path has its own minimal input handling in `GameCanvasGL.tsx`.
