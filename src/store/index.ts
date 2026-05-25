import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { generateMap } from '../game/mapGenerator';
import { ResourceType, UnitType, UnitState, Direction, BuildingType, TileType, GatherTier } from '../game/types';
import type { GameState, CameraState, UIState, Unit, Tile, Building } from '../game/types';
import { canPlaceBuilding, BUILDING_WORKER_CAPACITY } from '../game/buildingConfig';
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

  selectTile: (col: number | null, row: number | null) => void;
  selectUnits: (ids: string[]) => void;
  selectBuildingType: (type: BuildingType | null) => void;
  selectBuilding: (id: string | null) => void;
  setSelectionBox: (box: { x1: number; y1: number; x2: number; y2: number } | null) => void;
  spawnUnit: (col: number, row: number) => string;
  moveUnitTo: (id: string, col: number, row: number, delayTicks?: number) => void;
  commandGather: (ids: string[], col: number, row: number) => void;
  commandReport: (ids: string[], buildingId: string) => void;
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
});

const initialGame: GameState = {
  map: generateMap(),
  buildings: {},
  units: {},
  resources: {
    [PLAYER_ID]: {
      [ResourceType.Wood]:  0,
      [ResourceType.Stone]: 0,
      [ResourceType.Food]:  0,
      [ResourceType.Ore]:   0,
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
        ui: { selectedCol: null, selectedRow: null, selectedUnitIds: [], selectionBox: null, selectedBuildingType: null, selectedBuildingId: null },
        occupants: {},

        generateNewMap: (seed) => {
          set((state) => ({
            game: { ...state.game, map: generateMap(seed), tick: 0, savedAt: null, units: {}, buildings: {} },
            occupants: {},
            ui: { selectedCol: null, selectedRow: null, selectedUnitIds: [], selectionBox: null, selectedBuildingType: null, selectedBuildingId: null },
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
            };
          }
          const migratedGame = { ...game, units: migratedUnits };
          set({ game: migratedGame, occupants: buildOccupants(migratedUnits), ui: { selectedCol: null, selectedRow: null, selectedUnitIds: [], selectionBox: null, selectedBuildingType: null, selectedBuildingId: null } }, false, 'loadGameState');
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

          if (!building || (BUILDING_WORKER_CAPACITY[building.type] ?? 0) === 0) return;

          set((state) => {
            const units = { ...state.game.units };

            for (const id of ids) {
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
              };
            }

            return { game: { ...state.game, units } };
          }, false, 'commandReport');
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
                    const prev = (sh.inventory[unit.carrying] ?? 0);
                    newBuildings[shId!] = {
                      ...sh,
                      inventory: { ...sh.inventory, [unit.carrying]: prev + unit.carryingAmount },
                    };
                    buildingsChanged = true;

                    const resType = unit.carrying as HarvestableResource;
                    newResources[unit.ownerId] = {
                      ...newResources[unit.ownerId],
                      [resType]: (newResources[unit.ownerId]?.[resType] ?? 0) + unit.carryingAmount,
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

                // Unit arrives at its assigned building — absorb it.
                if (remaining.length === 0 && unit.reportingTo) {
                  const targetBuilding = newBuildings[unit.reportingTo];

                  if (targetBuilding && next.col === targetBuilding.col && next.row === targetBuilding.row) {
                    delete units[id];
                    delete occupants[`${next.col},${next.row}`];
                    newBuildings[unit.reportingTo] = {
                      ...targetBuilding,
                      workerIds: [...targetBuilding.workerIds, id],
                    };
                    buildingsChanged = true;
                    continue;
                  }
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

            // Auto-assign idle units to unoccupied buildings.
            // Count units already en route so we don't double-assign.
            const enRoute: Record<string, number> = {};
            for (const u of Object.values(units)) {
              if (u.reportingTo) enRoute[u.reportingTo] = (enRoute[u.reportingTo] ?? 0) + 1;
            }

            const idlePool = Object.values(units).filter(u => u.state === UnitState.Idle && !u.reportingTo);
            const assignedThisTick = new Set<string>();

            for (const building of Object.values(newBuildings)) {
              const capacity = BUILDING_WORKER_CAPACITY[building.type] ?? 0;

              if (capacity === 0 || building.constructionProgress < 100) continue;

              const filled = building.workerIds.length + (enRoute[building.id] ?? 0);

              if (filled >= capacity) continue;

              // Keep at least 1 idle unit free for the player.
              const free = idlePool.filter(u => !assignedThisTick.has(u.id));

              if (free.length <= 1) continue;

              const closest = free.reduce<{ unit: Unit; dist: number } | null>((best, u) => {
                const dist = Math.abs(u.col - building.col) + Math.abs(u.row - building.row);

                if (!best || dist < best.dist) return { unit: u, dist };

                return best;
              }, null);

              if (!closest) continue;

              const reportPath = findPath(state.game.map, closest.unit.col, closest.unit.row, building.col, building.row);

              if (reportPath.length === 0) continue;

              units[closest.unit.id] = {
                ...closest.unit,
                reportingTo: building.id,
                state: UnitState.Moving,
                path: reportPath,
                targetCol: building.col,
                targetRow: building.row,
                gatherTarget: null,
                collectingTicksRemaining: 0,
              };
              assignedThisTick.add(closest.unit.id);
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
