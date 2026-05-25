import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { generateMap } from '../game/mapGenerator';
import { ResourceType, UnitType, UnitState, Direction, BuildingType, TileType, GatherTier } from '../game/types';
import type { GameState, CameraState, UIState, Unit, Tile, Building } from '../game/types';
import { canPlaceBuilding, getWorkerCapacity, BUILDING_PRODUCTION } from '../game/buildingConfig';
import { CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM, UNIT_MOVE_TICKS, MAP_COLS, MAP_ROWS, GATHER_TIER_CONFIG, DEPOSIT_TICKS, STOREHOUSE_MAX_ITEMS, RESOURCE_REGROW_TICKS, RESOURCE_REGROW_AMOUNT } from '../game/constants';
import { createCamera } from '../renderer/Camera';
import { findPath } from '../game/pathfinding';
import { getDirection } from '../game/directionUtils';
import { worldToGrid } from '../game/isoMath';

export const PLAYER_ID = 'player1';

type HarvestableResource = Exclude<ResourceType, ResourceType.None>;

interface Store {
  game: GameState;
  camera: CameraState;
  ui: UIState;
  occupants: Record<string, string>;

  generateNewMap: (seed?: number) => void;
  loadGameState: (state: GameState) => void;
  saveTimestamp: () => void;

  panCamera: (dx: number, dy: number) => void;
  zoomCamera: (factor: number, pivotX: number, pivotY: number) => void;
  setScreenSize: (width: number, height: number) => void;

  toggleDebug: () => void;
  selectTile: (col: number | null, row: number | null) => void;
  selectUnits: (ids: string[]) => void;
  selectBuildingType: (type: BuildingType | null) => void;
  selectBuilding: (id: string | null) => void;
  setSelectionBox: (box: { x1: number; y1: number; x2: number; y2: number } | null) => void;
  spawnUnit: (col: number, row: number) => string;
  moveUnitTo: (id: string, col: number, row: number, delayTicks?: number) => void;
  commandGather: (ids: string[], col: number, row: number) => void;
  commandReport: (ids: string[], buildingId: string) => void;
  assignWorker: (buildingId: string) => void;
  dismissWorker: (buildingId: string) => void;
  placeBuilding: (type: BuildingType, col: number, row: number) => void;
  placeRoadPath: (positions: Array<{ col: number; row: number }>) => void;
  tick: () => void;
  rebuildOccupants: () => void;
}

const storehouseTotal = (b: Building): number =>
  Object.values(b.inventory).reduce((s, v) => s + (v ?? 0), 0);

// Prefers non-full storehouses; falls back to nearest full one if all are full.
const findNearestStorehouse = (
  buildings: Record<string, Building>,
  col: number,
  row: number,
): Building | null => {
  let best: Building | null = null;
  let bestDist = Infinity;
  let fallback: Building | null = null;
  let fallbackDist = Infinity;

  for (const b of Object.values(buildings)) {
    if (b.type !== BuildingType.Storehouse) continue;
    const dist = Math.abs(b.col - col) + Math.abs(b.row - row);

    if (storehouseTotal(b) < STOREHOUSE_MAX_ITEMS) {
      if (dist < bestDist) { bestDist = dist; best = b; }
    } else {
      if (dist < fallbackDist) { fallbackDist = dist; fallback = b; }
    }
  }

  return best ?? fallback;
};

const findStorehouseWithResource = (
  buildings: Record<string, Building>,
  resource: ResourceType,
  col: number,
  row: number,
): Building | null => {
  let best: Building | null = null;
  let bestDist = Infinity;

  for (const b of Object.values(buildings)) {
    if (b.type !== BuildingType.Storehouse) continue;
    if ((b.inventory[resource] ?? 0) <= 0) continue;
    const dist = Math.abs(b.col - col) + Math.abs(b.row - row);

    if (dist < bestDist) { bestDist = dist; best = b; }
  }

  return best;
};

const ADJACENT_DIRS = [
  { dc: -1, dr:  0 }, { dc:  1, dr:  0 },
  { dc:  0, dr: -1 }, { dc:  0, dr:  1 },
  { dc: -1, dr: -1 }, { dc:  1, dr: -1 },
  { dc: -1, dr:  1 }, { dc:  1, dr:  1 },
];

const findAdjacentFreeTile = (
  col: number,
  row: number,
  mapTiles: Record<string, Tile>,
  occupants: Record<string, string>,
): { col: number; row: number } | null => {
  for (const { dc, dr } of ADJACENT_DIRS) {
    const nc = col + dc, nr = row + dr;
    const tile = mapTiles[`${nc},${nr}`];

    if (!tile || tile.type === TileType.Water || tile.type === TileType.Mountain) continue;

    if (!occupants[`${nc},${nr}`]) return { col: nc, row: nr };
  }

  return null;
};

let nextUnitIndex = 1;

const makeUnit = (col: number, row: number): Unit => ({
  id: `unit-${nextUnitIndex++}`,
  type: UnitType.Settler,
  gatherTier: GatherTier.Gatherer,
  ownerId: PLAYER_ID,
  col, row, prevCol: col, prevRow: row,
  targetCol: null, targetRow: null,
  path: [],
  state: UnitState.Idle,
  moveProgress: 0,
  moveTickDelay: 0,
  carrying: null,
  carryingAmount: 0,
  facing: Direction.South,
  gatherTarget: null,
  collectingTicksRemaining: 0,
  depositTarget: null,
  depositingTicksRemaining: 0,
  reportingTo: null,
  assignedBuilding: null,
  buildingTask: null,
});

const initialGame: GameState = {
  map: generateMap(),
  buildings: {},
  units: {},
  resources: {
    [PLAYER_ID]: {
      [ResourceType.Wood]:   0,
      [ResourceType.Stone]:  0,
      [ResourceType.Food]:   0,
      [ResourceType.Ore]:    0,
      [ResourceType.Lumber]: 0,
      [ResourceType.Planks]: 0,
    },
  },
  tick: 0,
  tickRate: 10,
  savedAt: null,
};

const buildOccupants = (units: Record<string, Unit>): Record<string, string> => {
  const occupants: Record<string, string> = {};
  for (const unit of Object.values(units)) {
    occupants[`${unit.col},${unit.row}`] = unit.id;
  }
  return occupants;
};

export const useStore = create<Store>()(
  devtools(
    persist(
      (set, get) => ({
        game: initialGame,
        camera: createCamera(window.innerWidth, window.innerHeight),
        ui: { selectedCol: null, selectedRow: null, selectedUnitIds: [], selectionBox: null, selectedBuildingType: null, selectedBuildingId: null, debug: false },
        occupants: {},

        generateNewMap: (seed) => {
          set((state) => ({
            game: { ...state.game, map: generateMap(seed), tick: 0, savedAt: null, units: {}, buildings: {} },
            occupants: {},
            ui: { selectedCol: null, selectedRow: null, selectedUnitIds: [], selectionBox: null, selectedBuildingType: null, selectedBuildingId: null, debug: false },
          }), false, 'generateNewMap');
        },

        loadGameState: (game) => {
          const migratedUnits: Record<string, Unit> = {};
          for (const [id, unit] of Object.entries(game.units)) {
            migratedUnits[id] = {
              ...unit,
              gatherTier:               unit.gatherTier ?? GatherTier.Gatherer,
              depositTarget:            unit.depositTarget ?? null,
              depositingTicksRemaining: unit.depositingTicksRemaining ?? 0,
              reportingTo:              unit.reportingTo ?? null,
            assignedBuilding:         (unit as Unit).assignedBuilding ?? null,
            buildingTask:             (unit as Unit).buildingTask ?? null,
            };
          }
          const migratedBuildings: Record<string, Building> = {};
          for (const [bid, b] of Object.entries(game.buildings)) {
            migratedBuildings[bid] = { ...b, productionProgress: b.productionProgress ?? 0 };
          }
          const migratedGame = { ...game, units: migratedUnits, buildings: migratedBuildings };
          set({ game: migratedGame, occupants: buildOccupants(migratedUnits), ui: { selectedCol: null, selectedRow: null, selectedUnitIds: [], selectionBox: null, selectedBuildingType: null, selectedBuildingId: null, debug: false } }, false, 'loadGameState');
        },

        rebuildOccupants: () => {
          set((state) => ({ occupants: buildOccupants(state.game.units) }), false, 'rebuildOccupants');
        },

        saveTimestamp: () => {
          set((state) => ({ game: { ...state.game, savedAt: Date.now() } }), false, 'saveTimestamp');
        },

        panCamera: (dx, dy) => {
          set((state) => ({
            camera: {
              ...state.camera,
              x: state.camera.x - dx / state.camera.zoom,
              y: state.camera.y - dy / state.camera.zoom,
            },
          }), false, 'panCamera');
        },

        zoomCamera: (factor, pivotX, pivotY) => {
          set((state) => {
            const camera = state.camera;
            const newZoom = Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, camera.zoom * factor));
            const wx = (pivotX - camera.screenWidth / 2) / camera.zoom + camera.x;
            const wy = (pivotY - camera.screenHeight / 2) / camera.zoom + camera.y;

            return {
              camera: {
                ...camera,
                zoom: newZoom,
                x: wx - (pivotX - camera.screenWidth / 2) / newZoom,
                y: wy - (pivotY - camera.screenHeight / 2) / newZoom,
              },
            };
          }, false, 'zoomCamera');
        },

        setScreenSize: (width, height) => {
          set((state) => ({
            camera: { ...state.camera, screenWidth: width, screenHeight: height },
          }), false, 'setScreenSize');
        },

        toggleDebug: () => {
          set((state) => ({ ui: { ...state.ui, debug: !state.ui.debug } }), false, 'toggleDebug');
        },

        selectTile: (col, row) => {
          set((state) => ({ ui: { ...state.ui, selectedCol: col, selectedRow: row } }), false, 'selectTile');
        },

        selectUnits: (ids) => {
          set((state) => ({
            ui: { ...state.ui, selectedUnitIds: ids, selectedCol: null, selectedRow: null },
          }), false, 'selectUnits');
        },

        selectBuildingType: (type) => {
          set((state) => ({ ui: { ...state.ui, selectedBuildingType: type } }), false, 'selectBuildingType');
        },

        selectBuilding: (id) => {
          set((state) => ({ ui: { ...state.ui, selectedBuildingId: id, selectedCol: null, selectedRow: null } }), false, 'selectBuilding');
        },

        setSelectionBox: (box) => {
          set((state) => ({ ui: { ...state.ui, selectionBox: box } }), false, 'setSelectionBox');
        },

        spawnUnit: (col, row) => {
          const unit = makeUnit(col, row);
          set((state) => ({
            game: { ...state.game, units: { ...state.game.units, [unit.id]: unit } },
            occupants: { ...state.occupants, [`${col},${row}`]: unit.id },
          }), false, 'spawnUnit');

          return unit.id;
        },

        moveUnitTo: (id, targetCol, targetRow, delayTicks = 0) => {
          const { game } = get();
          const unit = game.units[id];
          if (!unit) return;

          const path = findPath(game.map, unit.col, unit.row, targetCol, targetRow);
          if (path.length === 0) return;

          set((state) => ({
            game: {
              ...state.game,
              units: {
                ...state.game.units,
                [id]: {
                  ...unit,
                  targetCol, targetRow,
                  path,
                  moveTickDelay: delayTicks,
                  state: delayTicks > 0 ? UnitState.Idle : UnitState.Moving,
                  gatherTarget: null,
                  collectingTicksRemaining: 0,
                  reportingTo: null,
                },
              },
            },
          }), false, 'moveUnitTo');
        },

        commandGather: (ids, col, row) => {
          const { game } = get();

          // Only gather the same resource type as the clicked tile (prevents
          // units being routed to nearby forest when user clicks on stone, etc.)
          const clickedTile = game.map.tiles[`${col},${row}`];
          const targetResource = clickedTile?.resourceType;
          const targetTileType = clickedTile?.type;

          // Collect resource tiles within Manhattan radius 4 of the click.
          const RADIUS = 4;
          const nearby: Array<{ col: number; row: number }> = [];
          for (let dc = -RADIUS; dc <= RADIUS; dc++) {
            for (let dr = -RADIUS; dr <= RADIUS; dr++) {
              if (Math.abs(dc) + Math.abs(dr) > RADIUS) continue;
              const tc = col + dc, tr = row + dr;
              const tile = game.map.tiles[`${tc},${tr}`];
              if (!tile?.hasResource || tile.resourceType === ResourceType.None) continue;

              // Match by resource type when clicked tile has one, else by tile type.
              const matches = (targetResource && targetResource !== ResourceType.None)
                ? tile.resourceType === targetResource
                : tile.type === targetTileType;

              if (matches) nearby.push({ col: tc, row: tr });
            }
          }

          if (nearby.length === 0) return;

          const patches: Record<string, Partial<Unit>> = {};
          // Track assignments to spread units across tiles.
          const assignCount: Record<string, number> = {};

          for (const id of ids) {
            const unit = game.units[id];
            if (!unit) continue;

            // Task 3: unit already carrying resources → let it finish the deposit run.
            if (unit.depositTarget !== null || unit.state === UnitState.Depositing) continue;

            // Wood gathering is restricted to WoodCutter-assigned units.
            if (targetResource === ResourceType.Wood) {
              const assignedBuilding = unit.assignedBuilding ? game.buildings[unit.assignedBuilding] : null;

              if (!assignedBuilding || assignedBuilding.type !== BuildingType.WoodCutter) continue;
            }

            // Pick the tile that minimises (distance-to-unit + crowding penalty).
            let bestTile = nearby[0];
            let bestScore = Infinity;

            for (const t of nearby) {
              const dist  = Math.abs(t.col - unit.col) + Math.abs(t.row - unit.row);
              const crowd = assignCount[`${t.col},${t.row}`] ?? 0;
              const score = dist + crowd * 8;

              if (score < bestScore) { bestScore = score; bestTile = t; }
            }

            const key = `${bestTile.col},${bestTile.row}`;
            assignCount[key] = (assignCount[key] ?? 0) + 1;

            if (unit.col === bestTile.col && unit.row === bestTile.row) {
              const tile = game.map.tiles[key];

              if (tile?.hasResource) {
                const { ticks } = GATHER_TIER_CONFIG[unit.gatherTier];
                patches[id] = {
                  state: UnitState.Collecting,
                  collectingTicksRemaining: ticks,
                  gatherTarget: bestTile,
                  depositTarget: null,
                  depositingTicksRemaining: 0,
                  reportingTo: null,
                };
              }
              continue;
            }

            const path = findPath(game.map, unit.col, unit.row, bestTile.col, bestTile.row);
            if (path.length === 0) continue;

            patches[id] = {
              targetCol: bestTile.col,
              targetRow: bestTile.row,
              path,
              moveTickDelay: 0,
              state: UnitState.Moving,
              gatherTarget: { col: bestTile.col, row: bestTile.row },
              collectingTicksRemaining: 0,
              depositTarget: null,
              depositingTicksRemaining: 0,
              reportingTo: null,
            };
          }

          if (Object.keys(patches).length === 0) return;

          set((state) => {
            const units = { ...state.game.units };
            for (const [id, patch] of Object.entries(patches)) {
              if (units[id]) units[id] = { ...units[id], ...patch };
            }
            return { game: { ...state.game, units } };
          }, false, 'commandGather');
        },

        commandReport: (ids, buildingId) => {
          const { game } = get();
          const building = game.buildings[buildingId];

          if (!building || getWorkerCapacity(building.type, building.level) === 0) return;

          const capacity = getWorkerCapacity(building.type, building.level);
          const enRoute = Object.values(game.units).filter(u => u.reportingTo === buildingId).length;
          const slots = capacity - building.workerIds.length - enRoute;

          if (slots <= 0) return;

          const toAssign = ids.slice(0, slots);

          set((state) => {
            const units = { ...state.game.units };

            for (const id of toAssign) {
              const unit = units[id];

              if (!unit) continue;

              const path = findPath(state.game.map, unit.col, unit.row, building.col, building.row);

              if (path.length === 0) continue;

              units[id] = {
                ...unit,
                reportingTo: buildingId,
                state: UnitState.Moving,
                path,
                targetCol: building.col,
                targetRow: building.row,
                gatherTarget: null,
                collectingTicksRemaining: 0,
                buildingTask: null,
                carrying: null,
                carryingAmount: 0,
              };
            }

            const buildings = building.noAutoAssign
              ? { ...state.game.buildings, [buildingId]: { ...state.game.buildings[buildingId], noAutoAssign: false } }
              : state.game.buildings;

            return { game: { ...state.game, units, buildings } };
          }, false, 'commandReport');
        },

        assignWorker: (buildingId) => {
          const { game, commandReport } = get();
          const building = game.buildings[buildingId];

          if (!building) return;

          const capacity  = getWorkerCapacity(building.type, building.level);
          const enRoute   = Object.values(game.units).filter(u => u.reportingTo === buildingId).length;

          if (building.workerIds.length + enRoute >= capacity) return;

          const free = Object.values(game.units)
            .filter(u => u.state === UnitState.Idle && !u.reportingTo && !u.assignedBuilding)
            .sort((a, b) =>
              (Math.abs(a.col - building.col) + Math.abs(a.row - building.row)) -
              (Math.abs(b.col - building.col) + Math.abs(b.row - building.row)),
            );

          if (free.length === 0) return;

          commandReport([free[0].id], buildingId);
        },

        dismissWorker: (buildingId) => {
          set((state) => {
            const building = state.game.buildings[buildingId];

            if (!building || building.workerIds.length === 0) return state;

            const workerId  = building.workerIds[0];
            const workerIds = building.workerIds.slice(1);
            const existing  = state.game.units[workerId];

            let newUnits    = state.game.units;
            let newOccupants = state.occupants;

            if (existing) {
              newUnits = {
                ...state.game.units,
                [workerId]: {
                  ...existing,
                  assignedBuilding: null,
                  buildingTask: null,
                  carrying: null,
                  carryingAmount: 0,
                  gatherTarget: null,
                  reportingTo: null,
                  path: [],
                  state: UnitState.Idle,
                },
              };
              newOccupants = { ...state.occupants, [`${existing.col},${existing.row}`]: workerId };
            } else {
              const spawn = findAdjacentFreeTile(
                building.col, building.row,
                state.game.map.tiles, state.occupants,
              ) ?? { col: building.col, row: building.row };
              const unit = makeUnit(spawn.col, spawn.row);
              newUnits = { ...state.game.units, [unit.id]: unit };
              newOccupants = { ...state.occupants, [`${spawn.col},${spawn.row}`]: unit.id };
            }

            return {
              game: {
                ...state.game,
                buildings: { ...state.game.buildings, [buildingId]: { ...building, workerIds, noAutoAssign: true } },
                units: newUnits,
              },
              occupants: newOccupants,
            };
          }, false, 'dismissWorker');
        },

        placeRoadPath: (positions) => {
          set((state) => {
            const tiles = { ...state.game.map.tiles };
            let changed = false;
            for (const { col, row } of positions) {
              const k = `${col},${row}`;
              const tile = tiles[k];
              if (
                !tile || tile.hasRoad ||
                tile.type === TileType.Water ||
                tile.type === TileType.Stone ||
                tile.type === TileType.Mountain
              ) continue;
              tiles[k] = { ...tile, hasRoad: true };
              changed = true;
            }
            if (!changed) return state;
            return { game: { ...state.game, map: { ...state.game.map, tiles } } };
          }, false, 'placeRoadPath');
        },

        placeBuilding: (type, col, row) => {
          const { game } = get();
          if (!canPlaceBuilding(type, col, row, game.map.tiles, game.buildings)) return;

          const id = `building-${col}-${row}`;
          const building: Building = {
            id, type, col, row,
            ownerId: PLAYER_ID,
            constructionProgress: 100,
            level: 1,
            workerIds: [],
            inventory: {},
            productionProgress: 0,
          };
          set((state) => ({ game: { ...state.game, buildings: { ...state.game.buildings, [id]: building } } }), false, 'placeBuilding');
        },

        tick: () => {
          set((state) => {
            const newTick = state.game.tick + 1;
            const tiles = state.game.map.tiles;
            const newTiles: Record<string, Tile> = {};

            // Regrowth check every 10 ticks (~1s)
            if (newTick % 10 === 0) {
              for (const key of Object.keys(tiles)) {
                const tile = tiles[key];
                if (tile.hasResource || tile.lastHarvestedAt === undefined || tile.resourceType === ResourceType.None) continue;
                const regrowTicks = RESOURCE_REGROW_TICKS[tile.resourceType];
                if (!regrowTicks || newTick - tile.lastHarvestedAt < regrowTicks) continue;
                const range = RESOURCE_REGROW_AMOUNT[tile.resourceType];
                if (!range) continue;
                const amount = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
                newTiles[key] = { ...tile, hasResource: true, resourceAmount: amount, lastHarvestedAt: undefined };
              }
            }

            const units = { ...state.game.units };
            const occupants = { ...state.occupants };
            const newBuildings = { ...state.game.buildings };
            let mapChanged = Object.keys(newTiles).length > 0;
            let resourcesChanged = false;
            let buildingsChanged = false;
            const newResources = { ...state.game.resources };

            for (const id of Object.keys(units)) {
              const unit = units[id];

              // ── depositing at storehouse ──
              if (unit.state === UnitState.Depositing) {
                const rem = unit.depositingTicksRemaining - 1;

                if (rem <= 0) {
                  const dep = unit.depositTarget!;
                  const shId = Object.keys(newBuildings).find(bid => {
                    const b = newBuildings[bid];
                    return b.type === BuildingType.Storehouse && b.col === dep.col && b.row === dep.row;
                  });

                  const sh = shId ? newBuildings[shId] : null;
                  const shFull = !sh || storehouseTotal(sh) >= STOREHOUSE_MAX_ITEMS;

                  if (shFull) {
                    // Find a different, non-full storehouse.
                    const nextSh = findNearestStorehouse(newBuildings, unit.col, unit.row);
                    const isAlternative = nextSh &&
                      storehouseTotal(nextSh) < STOREHOUSE_MAX_ITEMS &&
                      (nextSh.col !== dep.col || nextSh.row !== dep.row);

                    if (isAlternative) {
                      const altPath = findPath(state.game.map, unit.col, unit.row, nextSh!.col, nextSh!.row);

                      if (altPath.length > 0) {
                        units[id] = {
                          ...unit,
                          state: UnitState.Moving,
                          path: altPath,
                          targetCol: nextSh!.col,
                          targetRow: nextSh!.row,
                          depositTarget: { col: nextSh!.col, row: nextSh!.row },
                          depositingTicksRemaining: 0,
                        };
                        continue;
                      }
                    }

                    // All storehouses full or unreachable — wait idle, keep resources.
                    units[id] = { ...unit, state: UnitState.Idle, depositTarget: null, depositingTicksRemaining: 0 };
                    continue;
                  }

                  if (sh && unit.carrying && unit.carryingAmount > 0) {
                    const free = Math.max(0, STOREHOUSE_MAX_ITEMS - storehouseTotal(sh));
                    const depositing = Math.min(unit.carryingAmount, free);
                    const prev = (sh.inventory[unit.carrying] ?? 0);
                    newBuildings[shId!] = {
                      ...sh,
                      inventory: { ...sh.inventory, [unit.carrying]: prev + depositing },
                    };
                    buildingsChanged = true;

                    const resType = unit.carrying as HarvestableResource;
                    newResources[unit.ownerId] = {
                      ...newResources[unit.ownerId],
                      [resType]: (newResources[unit.ownerId]?.[resType] ?? 0) + depositing,
                    };
                    resourcesChanged = true;
                  }

                  // Return to gatherTarget if resource still exists
                  const gt = unit.gatherTarget;

                  if (gt) {
                    const gtTile = newTiles[`${gt.col},${gt.row}`] ?? tiles[`${gt.col},${gt.row}`];

                    if (gtTile?.hasResource) {
                      if (unit.col === gt.col && unit.row === gt.row) {
                        const { ticks } = GATHER_TIER_CONFIG[unit.gatherTier];
                        units[id] = { ...unit, state: UnitState.Collecting, collectingTicksRemaining: ticks, depositTarget: null, depositingTicksRemaining: 0, carrying: null, carryingAmount: 0 };
                      } else {
                        const backPath = findPath(state.game.map, unit.col, unit.row, gt.col, gt.row);

                        if (backPath.length > 0) {
                          units[id] = { ...unit, state: UnitState.Moving, path: backPath, targetCol: gt.col, targetRow: gt.row, depositTarget: null, depositingTicksRemaining: 0, carrying: null, carryingAmount: 0 };
                        } else {
                          units[id] = { ...unit, state: UnitState.Idle, gatherTarget: null, depositTarget: null, depositingTicksRemaining: 0, carrying: null, carryingAmount: 0 };
                        }
                      }
                    } else {
                      units[id] = { ...unit, state: UnitState.Idle, gatherTarget: null, depositTarget: null, depositingTicksRemaining: 0, carrying: null, carryingAmount: 0 };
                    }
                  } else {
                    units[id] = { ...unit, state: UnitState.Idle, depositTarget: null, depositingTicksRemaining: 0, carrying: null, carryingAmount: 0 };
                  }
                } else {
                  units[id] = { ...unit, depositingTicksRemaining: rem };
                }
                continue;
              }

              // ── collecting resource ──
              if (unit.state === UnitState.Collecting) {
                const remaining = unit.collectingTicksRemaining - 1;

                if (remaining <= 0) {
                  const { col, row } = unit.gatherTarget!;
                  const tileKey = `${col},${row}`;
                  const tile = newTiles[tileKey] ?? tiles[tileKey];

                  if (tile?.hasResource && tile.resourceType !== ResourceType.None) {
                    const { amount: tierAmount } = GATHER_TIER_CONFIG[unit.gatherTier];
                    const harvested = Math.min(tierAmount, tile.resourceAmount);
                    const afterHarvest = tile.resourceAmount - harvested;
                    const depleted = afterHarvest <= 0;
                    newTiles[tileKey] = {
                      ...tile,
                      resourceAmount: afterHarvest,
                      hasResource: !depleted,
                      ...(depleted ? { lastHarvestedAt: newTick } : {}),
                    };
                    mapChanged = true;

                    const assignedBuilding = unit.assignedBuilding ? newBuildings[unit.assignedBuilding] : null;
                    const isWoodCutter = assignedBuilding?.type === BuildingType.WoodCutter && tile.resourceType === ResourceType.Wood;

                    if (isWoodCutter) {
                      const woodcutterProd = BUILDING_PRODUCTION[BuildingType.WoodCutter]!;
                      const lumberCap = woodcutterProd.outputCapacity[ResourceType.Lumber] ?? Infinity;
                      const lumberNow = assignedBuilding!.inventory[ResourceType.Lumber] ?? 0;
                      const buildingHasRoom = lumberNow < lumberCap;

                      if (buildingHasRoom) {
                        // Deliver lumber to the building — carried to storehouse later.
                        const dpath = findPath(state.game.map, unit.col, unit.row, assignedBuilding!.col, assignedBuilding!.row);
                        units[id] = {
                          ...unit,
                          state: dpath.length > 0 ? UnitState.Moving : UnitState.Idle,
                          path: dpath,
                          targetCol: assignedBuilding!.col, targetRow: assignedBuilding!.row,
                          collectingTicksRemaining: 0,
                          depositTarget: null, depositingTicksRemaining: 0,
                          carrying: ResourceType.Lumber, carryingAmount: harvested,
                          buildingTask: dpath.length > 0 ? 'deliver' : null,
                        };
                      } else {
                        // Building output full — deposit directly to nearest storehouse.
                        const storehouse = findNearestStorehouse(newBuildings, unit.col, unit.row);
                        if (storehouse) {
                          if (unit.col === storehouse.col && unit.row === storehouse.row) {
                            units[id] = {
                              ...unit,
                              state: UnitState.Depositing,
                              collectingTicksRemaining: 0,
                              depositTarget: { col: storehouse.col, row: storehouse.row },
                              depositingTicksRemaining: DEPOSIT_TICKS,
                              carrying: ResourceType.Lumber, carryingAmount: harvested,
                              buildingTask: null,
                            };
                          } else {
                            const depPath = findPath(state.game.map, unit.col, unit.row, storehouse.col, storehouse.row);
                            units[id] = {
                              ...unit,
                              state: depPath.length > 0 ? UnitState.Moving : UnitState.Idle,
                              path: depPath,
                              targetCol: storehouse.col, targetRow: storehouse.row,
                              collectingTicksRemaining: 0,
                              depositTarget: { col: storehouse.col, row: storehouse.row },
                              carrying: ResourceType.Lumber, carryingAmount: harvested,
                              buildingTask: null,
                            };
                          }
                        } else {
                          // No storehouse — go idle holding the lumber.
                          units[id] = {
                            ...unit,
                            state: UnitState.Idle,
                            collectingTicksRemaining: 0,
                            carrying: ResourceType.Lumber, carryingAmount: harvested,
                            buildingTask: null,
                          };
                        }
                      }
                    } else {
                    const storehouse = findNearestStorehouse(newBuildings, unit.col, unit.row);

                    if (storehouse) {
                      if (unit.col === storehouse.col && unit.row === storehouse.row) {
                        units[id] = {
                          ...unit,
                          state: UnitState.Depositing,
                          collectingTicksRemaining: 0,
                          depositTarget: { col: storehouse.col, row: storehouse.row },
                          depositingTicksRemaining: DEPOSIT_TICKS,
                          carrying: tile.resourceType as ResourceType,
                          carryingAmount: harvested,
                        };
                      } else {
                        const depPath = findPath(state.game.map, unit.col, unit.row, storehouse.col, storehouse.row);

                        if (depPath.length > 0) {
                          units[id] = {
                            ...unit,
                            state: UnitState.Moving,
                            path: depPath,
                            targetCol: storehouse.col,
                            targetRow: storehouse.row,
                            collectingTicksRemaining: 0,
                            depositTarget: { col: storehouse.col, row: storehouse.row },
                            carrying: tile.resourceType as ResourceType,
                            carryingAmount: harvested,
                          };
                        } else {
                          // Can't reach storehouse — add directly (fallback)
                          const resType = tile.resourceType as HarvestableResource;
                          newResources[unit.ownerId] = {
                            ...newResources[unit.ownerId],
                            [resType]: (newResources[unit.ownerId]?.[resType] ?? 0) + harvested,
                          };
                          resourcesChanged = true;
                          units[id] = { ...unit, state: UnitState.Idle, collectingTicksRemaining: 0, gatherTarget: null, carrying: tile.resourceType as ResourceType, carryingAmount: harvested };
                        }
                      }
                    } else {
                      // No storehouse — add directly (fallback)
                      const resType = tile.resourceType as HarvestableResource;
                      newResources[unit.ownerId] = {
                        ...newResources[unit.ownerId],
                        [resType]: (newResources[unit.ownerId]?.[resType] ?? 0) + harvested,
                      };
                      resourcesChanged = true;
                      units[id] = { ...unit, state: UnitState.Idle, collectingTicksRemaining: 0, gatherTarget: null, carrying: tile.resourceType as ResourceType, carryingAmount: harvested };
                    }
                    } // end else (not WoodCutter)
                  } else {
                    units[id] = { ...unit, state: UnitState.Idle, collectingTicksRemaining: 0, gatherTarget: null };
                  }
                } else {
                  units[id] = { ...unit, collectingTicksRemaining: remaining };
                }
                continue;
              }

              if (unit.moveTickDelay > 0) {
                const newDelay = unit.moveTickDelay - 1;
                units[id] = {
                  ...unit,
                  moveTickDelay: newDelay,
                  state: newDelay === 0 ? UnitState.Moving : UnitState.Idle,
                };
                continue;
              }

              if (unit.state !== UnitState.Moving || unit.path.length === 0) continue;

              const newProgress = unit.moveProgress + 1 / UNIT_MOVE_TICKS;

              if (newProgress >= 1) {
                const [next, ...remaining] = unit.path;
                const facing = getDirection(next.col - unit.col, next.row - unit.row);

                delete occupants[`${unit.col},${unit.row}`];
                occupants[`${next.col},${next.row}`] = id;

                // Unit arrives at its assigned building — register as worker.
                if (remaining.length === 0 && unit.reportingTo) {
                  const targetBuilding = newBuildings[unit.reportingTo];

                  if (targetBuilding && next.col === targetBuilding.col && next.row === targetBuilding.row) {
                    const cap  = getWorkerCapacity(targetBuilding.type, targetBuilding.level);
                    const fits = targetBuilding.workerIds.length < cap;
                    delete occupants[`${next.col},${next.row}`];
                    units[id] = {
                      ...unit,
                      prevCol: unit.col, prevRow: unit.row,
                      col: next.col, row: next.row,
                      moveProgress: 1, path: [], facing,
                      reportingTo: null,
                      assignedBuilding: fits ? unit.reportingTo : null,
                      buildingTask: null,
                      gatherTarget: null,
                      state: UnitState.Idle,
                    };

                    if (fits) {
                      // Remove from previous building's workerIds if re-assigned.
                      if (unit.assignedBuilding && unit.assignedBuilding !== unit.reportingTo) {
                        const prev = newBuildings[unit.assignedBuilding];
                        if (prev) {
                          newBuildings[unit.assignedBuilding] = {
                            ...prev,
                            workerIds: prev.workerIds.filter(wid => wid !== id),
                          };
                        }
                      }
                      newBuildings[unit.reportingTo] = {
                        ...targetBuilding,
                        workerIds: [...targetBuilding.workerIds, id],
                      };
                    }

                    buildingsChanged = true;
                    continue;
                  }
                }

                // Building worker arrives at storehouse to pick up input resource.
                if (remaining.length === 0 && unit.buildingTask === 'fetch' && unit.assignedBuilding && unit.carrying) {
                  const sh = Object.values(newBuildings).find(
                    b => b.type === BuildingType.Storehouse && b.col === next.col && b.row === next.row,
                  );

                  if (sh && (sh.inventory[unit.carrying] ?? 0) > 0) {
                    const shId = Object.keys(newBuildings).find(k => newBuildings[k] === sh)!;
                    newBuildings[shId] = {
                      ...sh,
                      inventory: { ...sh.inventory, [unit.carrying]: (sh.inventory[unit.carrying] ?? 0) - 1 },
                    };
                    newResources[unit.ownerId] = {
                      ...newResources[unit.ownerId],
                      [unit.carrying]: Math.max(0, (newResources[unit.ownerId]?.[unit.carrying as HarvestableResource] ?? 0) - 1),
                    };
                    resourcesChanged = true;
                    buildingsChanged = true;

                    const tgt = newBuildings[unit.assignedBuilding];

                    if (tgt) {
                      const dpath = findPath(state.game.map, next.col, next.row, tgt.col, tgt.row);
                      units[id] = {
                        ...unit,
                        prevCol: unit.col, prevRow: unit.row,
                        col: next.col, row: next.row,
                        moveProgress: dpath.length > 0 ? 0 : 1,
                        facing,
                        path: dpath,
                        targetCol: tgt.col, targetRow: tgt.row,
                        carryingAmount: 1,
                        buildingTask: 'deliver',
                        state: dpath.length > 0 ? UnitState.Moving : UnitState.Idle,
                      };
                      continue;
                    }
                  }

                  // No resource — go idle.
                  units[id] = {
                    ...unit,
                    prevCol: unit.col, prevRow: unit.row,
                    col: next.col, row: next.row,
                    moveProgress: 1, path: [], facing,
                    carrying: null, carryingAmount: 0,
                    buildingTask: null,
                    state: UnitState.Idle,
                  };
                  continue;
                }

                // Building worker arrives at building to pick up output resource.
                if (remaining.length === 0 && unit.buildingTask === 'fetch-output' && unit.assignedBuilding && unit.carrying) {
                  const tgt = newBuildings[unit.assignedBuilding];

                  if (tgt && next.col === tgt.col && next.row === tgt.row) {
                    const available = tgt.inventory[unit.carrying] ?? 0;

                    if (available > 0) {
                      newBuildings[unit.assignedBuilding] = {
                        ...tgt,
                        inventory: { ...tgt.inventory, [unit.carrying]: 0 },
                      };
                      buildingsChanged = true;

                      const sh = findNearestStorehouse(newBuildings, next.col, next.row);

                      if (sh) {
                        const spath = findPath(state.game.map, next.col, next.row, sh.col, sh.row);
                        units[id] = {
                          ...unit,
                          prevCol: unit.col, prevRow: unit.row,
                          col: next.col, row: next.row,
                          moveProgress: spath.length > 0 ? 0 : 1, facing,
                          path: spath,
                          targetCol: sh.col, targetRow: sh.row,
                          carryingAmount: available,
                          buildingTask: 'carry',
                          state: spath.length > 0 ? UnitState.Moving : UnitState.Idle,
                        };
                        continue;
                      }
                    }
                  }

                  const isWorkerHere = unit.assignedBuilding
                    ? (newBuildings[unit.assignedBuilding]?.workerIds.includes(id) ?? false)
                    : false;

                  units[id] = {
                    ...unit,
                    prevCol: unit.col, prevRow: unit.row,
                    col: next.col, row: next.row,
                    moveProgress: 1, path: [], facing,
                    carrying: null, carryingAmount: 0,
                    buildingTask: null,
                    assignedBuilding: isWorkerHere ? unit.assignedBuilding : null,
                    state: UnitState.Idle,
                  };
                  continue;
                }

                // Building worker arrives at storehouse to deposit output resource.
                if (remaining.length === 0 && unit.buildingTask === 'carry' && unit.carrying && unit.carryingAmount > 0) {
                  const sh = Object.values(newBuildings).find(
                    b => b.type === BuildingType.Storehouse && b.col === next.col && b.row === next.row,
                  );

                  if (sh) {
                    const shId = Object.keys(newBuildings).find(k => newBuildings[k] === sh)!;
                    const free = Math.max(0, STOREHOUSE_MAX_ITEMS - storehouseTotal(sh));
                    const depositing = Math.min(unit.carryingAmount, free);

                    if (depositing > 0) {
                      newBuildings[shId] = {
                        ...sh,
                        inventory: {
                          ...sh.inventory,
                          [unit.carrying]: (sh.inventory[unit.carrying] ?? 0) + depositing,
                        },
                      };
                      newResources[unit.ownerId] = {
                        ...newResources[unit.ownerId],
                        [unit.carrying]: (newResources[unit.ownerId]?.[unit.carrying as HarvestableResource] ?? 0) + depositing,
                      };
                      buildingsChanged = true;
                      resourcesChanged = true;
                    }
                  }

                  const isProperWorker = unit.assignedBuilding
                    ? (newBuildings[unit.assignedBuilding]?.workerIds.includes(id) ?? false)
                    : false;

                  units[id] = {
                    ...unit,
                    prevCol: unit.col, prevRow: unit.row,
                    col: next.col, row: next.row,
                    moveProgress: 1, path: [], facing,
                    carrying: null, carryingAmount: 0,
                    buildingTask: null,
                    assignedBuilding: isProperWorker ? unit.assignedBuilding : null,
                    state: UnitState.Idle,
                  };
                  continue;
                }

                // Building worker arrives at building to deposit input resource.
                if (remaining.length === 0 && unit.buildingTask === 'deliver' && unit.assignedBuilding && unit.carrying && unit.carryingAmount > 0) {
                  const tgt = newBuildings[unit.assignedBuilding];

                  if (tgt && next.col === tgt.col && next.row === tgt.row) {
                    newBuildings[unit.assignedBuilding] = {
                      ...tgt,
                      inventory: {
                        ...tgt.inventory,
                        [unit.carrying]: (tgt.inventory[unit.carrying] ?? 0) + unit.carryingAmount,
                      },
                    };
                    buildingsChanged = true;
                  }

                  delete occupants[`${next.col},${next.row}`];
                  units[id] = {
                    ...unit,
                    prevCol: unit.col, prevRow: unit.row,
                    col: next.col, row: next.row,
                    moveProgress: 1, path: [], facing,
                    carrying: null, carryingAmount: 0,
                    buildingTask: null,
                    state: UnitState.Idle,
                  };
                  continue;
                }

                const microDelay = remaining.length > 0 && Math.random() < 0.25 ? 1 : 0;

                let newState: UnitState;
                let collectingTicksRemaining = 0;
                let depositingTicksRemaining = 0;

                if (remaining.length === 0 && unit.depositTarget?.col === next.col && unit.depositTarget?.row === next.row) {
                  newState = UnitState.Depositing;
                  depositingTicksRemaining = DEPOSIT_TICKS;
                } else if (remaining.length === 0 && unit.gatherTarget?.col === next.col && unit.gatherTarget?.row === next.row) {
                  const tileKey = `${next.col},${next.row}`;
                  const tile = newTiles[tileKey] ?? tiles[tileKey];

                  if (tile?.hasResource) {
                    newState = UnitState.Collecting;
                    collectingTicksRemaining = GATHER_TIER_CONFIG[unit.gatherTier].ticks;
                  } else {
                    newState = UnitState.Idle;
                  }
                } else {
                  // Use 1 when becoming idle: interpolation at 1 = col/row (destination),
                  // at 0 it would render at prevCol (one tile back) since tick stops running.
                  newState = remaining.length === 0 ? UnitState.Idle : microDelay > 0 ? UnitState.Idle : UnitState.Moving;
                }

                units[id] = {
                  ...unit,
                  prevCol: unit.col,
                  prevRow: unit.row,
                  col: next.col,
                  row: next.row,
                  path: remaining,
                  moveProgress: remaining.length === 0 ? 1 : 0,
                  facing,
                  moveTickDelay: remaining.length === 0 ? 0 : microDelay,
                  state: newState,
                  collectingTicksRemaining,
                  depositingTicksRemaining,
                };
              } else {
                units[id] = { ...unit, moveProgress: newProgress };
              }
            }

            // Building production cycles.
            for (const bid of Object.keys(newBuildings)) {
              const building = newBuildings[bid];

              if (building.constructionProgress < 100 || building.workerIds.length === 0) continue;

              const prod = BUILDING_PRODUCTION[building.type];

              if (!prod || prod.cycleTime === 0) continue;

              const hasInput = (Object.entries(prod.input) as [ResourceType, number][]).every(
                ([res, needed]) => (building.inventory[res] ?? 0) >= needed,
              );

              if (!hasInput) {
                if (building.productionProgress > 0) {
                  newBuildings[bid] = { ...building, productionProgress: 0 };
                  buildingsChanged = true;
                }
                continue;
              }

              // Output buffer full — hold progress until a worker clears it.
              const outputFull = (Object.entries(prod.outputCapacity) as [ResourceType, number][]).some(
                ([res, cap]) => (building.inventory[res] ?? 0) >= cap,
              );

              if (outputFull) continue;

              const newProg = (building.productionProgress ?? 0) + 1;

              if (newProg >= prod.cycleTime) {
                const newInv = { ...building.inventory };

                for (const [res, needed] of Object.entries(prod.input) as [ResourceType, number][]) {
                  newInv[res as ResourceType] = (newInv[res as ResourceType] ?? 0) - needed;
                }

                for (const [res, amount] of Object.entries(prod.output) as [ResourceType, number][]) {
                  newInv[res as ResourceType] = (newInv[res as ResourceType] ?? 0) + amount;
                }

                newBuildings[bid] = { ...newBuildings[bid], inventory: newInv, productionProgress: 0 };
                buildingsChanged = true;
              } else {
                newBuildings[bid] = { ...building, productionProgress: newProg };
                buildingsChanged = true;
              }
            }

            // Dispatch idle assigned workers to fetch building inputs.
            for (const id of Object.keys(units)) {
              const unit = units[id];

              if (unit.state !== UnitState.Idle || !unit.assignedBuilding || unit.buildingTask) continue;

              const building = newBuildings[unit.assignedBuilding];

              if (!building) continue;

              const prod = BUILDING_PRODUCTION[building.type];

              if (!prod) continue;

              // WoodCutter: gatherer building — carry output out first, then gather more.
              if (building.type === BuildingType.WoodCutter) {
                const alreadyCarrying = Object.values(units).some(
                  u => u.id !== id && u.assignedBuilding === unit.assignedBuilding &&
                    (u.buildingTask === 'fetch-output' || u.buildingTask === 'carry'),
                );

                if (!alreadyCarrying && (building.inventory[ResourceType.Lumber] ?? 0) > 0) {
                  const fpath = findPath(state.game.map, unit.col, unit.row, building.col, building.row);

                  if (fpath.length > 0) {
                    units[id] = {
                      ...unit,
                      state: UnitState.Moving,
                      path: fpath,
                      targetCol: building.col, targetRow: building.row,
                      carrying: ResourceType.Lumber,
                      carryingAmount: 0,
                      buildingTask: 'fetch-output',
                    };
                    continue;
                  }
                }

                // Don't gather more if output buffer is already full.
                const lumberCap = prod.outputCapacity[ResourceType.Lumber] ?? Infinity;
                const lumberNow = building.inventory[ResourceType.Lumber] ?? 0;

                if (lumberNow >= lumberCap) continue;

                // Gather wood from nearby forest tiles.
                const GATHER_RADIUS = 10;
                let bestTile: { col: number; row: number } | null = null;
                let bestDist = Infinity;

                for (let dc = -GATHER_RADIUS; dc <= GATHER_RADIUS; dc++) {
                  for (let dr = -GATHER_RADIUS; dr <= GATHER_RADIUS; dr++) {
                    const tc = building.col + dc, tr = building.row + dr;
                    const tile = newTiles[`${tc},${tr}`] ?? tiles[`${tc},${tr}`];

                    if (!tile?.hasResource || tile.resourceType !== ResourceType.Wood) continue;

                    const takenByPeer = Object.values(units).some(
                      u => u.id !== id && u.assignedBuilding === unit.assignedBuilding &&
                        u.gatherTarget?.col === tc && u.gatherTarget?.row === tr,
                    );

                    if (takenByPeer) continue;

                    const dist = Math.abs(dc) + Math.abs(dr);

                    if (dist < bestDist) { bestDist = dist; bestTile = { col: tc, row: tr }; }
                  }
                }

                if (bestTile) {
                  const gpath = findPath(state.game.map, unit.col, unit.row, bestTile.col, bestTile.row);

                  if (gpath.length > 0) {
                    units[id] = {
                      ...unit,
                      state: UnitState.Moving,
                      path: gpath,
                      targetCol: bestTile.col, targetRow: bestTile.row,
                      gatherTarget: bestTile,
                      collectingTicksRemaining: 0,
                      buildingTask: null,
                    };
                  }
                }
                continue;
              }

              const alreadyCarrying = Object.values(units).some(
                u => u.id !== id && u.assignedBuilding === unit.assignedBuilding &&
                  (u.buildingTask === 'fetch-output' || u.buildingTask === 'carry'),
              );

              if (!alreadyCarrying) {
                for (const [res] of Object.entries(prod.output) as [ResourceType, number][]) {
                  const available = building.inventory[res] ?? 0;

                  if (available <= 0) continue;

                  const fpath = findPath(state.game.map, unit.col, unit.row, building.col, building.row);

                  if (fpath.length === 0) continue;

                  units[id] = {
                    ...unit,
                    state: UnitState.Moving,
                    path: fpath,
                    targetCol: building.col, targetRow: building.row,
                    carrying: res,
                    carryingAmount: 0,
                    buildingTask: 'fetch-output',
                  };
                  break;
                }

                if (units[id] !== unit) continue;
              }

              for (const [res] of Object.entries(prod.input) as [ResourceType, number][]) {
                const cap = prod.inputCapacity?.[res] ?? 1;

                if ((building.inventory[res] ?? 0) >= cap) continue;

                const sh = findStorehouseWithResource(newBuildings, res, unit.col, unit.row);

                if (!sh) continue;

                const fpath = findPath(state.game.map, unit.col, unit.row, sh.col, sh.row);

                if (fpath.length === 0) continue;

                units[id] = {
                  ...unit,
                  state: UnitState.Moving,
                  path: fpath,
                  targetCol: sh.col, targetRow: sh.row,
                  carrying: res,
                  carryingAmount: 0,
                  buildingTask: 'fetch',
                };
                break;
              }
            }

            // Dispatch free idle units to carry output from any building to storehouse.
            for (const id of Object.keys(units)) {
              const unit = units[id];

              if (unit.state !== UnitState.Idle || unit.assignedBuilding || unit.buildingTask || unit.reportingTo) continue;

              for (const building of Object.values(newBuildings)) {
                const prod = BUILDING_PRODUCTION[building.type];

                if (!prod) continue;

                for (const [res] of Object.entries(prod.output) as [ResourceType, number][]) {
                  const available = building.inventory[res] ?? 0;

                  if (available <= 0) continue;

                  const alreadyHandled = Object.values(units).some(
                    u => u.id !== id && u.assignedBuilding === building.id &&
                      (u.buildingTask === 'fetch-output' || u.buildingTask === 'carry'),
                  );

                  if (alreadyHandled) continue;

                  const fpath = findPath(state.game.map, unit.col, unit.row, building.col, building.row);

                  if (fpath.length === 0) continue;

                  units[id] = {
                    ...unit,
                    state: UnitState.Moving,
                    path: fpath,
                    targetCol: building.col, targetRow: building.row,
                    carrying: res as ResourceType,
                    carryingAmount: 0,
                    buildingTask: 'fetch-output',
                    assignedBuilding: building.id,
                  };
                  break;
                }

                if (units[id] !== unit) break;
              }
            }

            return {
              game: {
                ...state.game,
                tick: newTick,
                units,
                buildings: buildingsChanged ? newBuildings : state.game.buildings,
                map: mapChanged ? { ...state.game.map, tiles: { ...tiles, ...newTiles } } : state.game.map,
                resources: resourcesChanged ? newResources : state.game.resources,
              },
              occupants,
            };
          }, false, 'tick');
        },
      }),
      {
        name: 'settlers-v3',
        partialize: (state) => ({ game: state.game }),
      },
    ),
    { name: 'settlers' },
  ),
);

// Spawn unit at center of viewport
export const spawnAtCenter = (): string => {
  const { camera, spawnUnit } = useStore.getState();
  const { col, row } = worldToGrid(camera.x, camera.y);
  const clampedCol = Math.max(1, Math.min(MAP_COLS - 2, col));
  const clampedRow = Math.max(1, Math.min(MAP_ROWS - 2, row));

  return spawnUnit(clampedCol, clampedRow);
};
