import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { generateMap } from '../game/mapGenerator';
import { ResourceType, UnitType, UnitState, Direction } from '../game/types';
import type { GameState, CameraState, UIState, Unit, Tile } from '../game/types';
import { CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM, UNIT_MOVE_TICKS, MAP_COLS, MAP_ROWS, GATHER_TICKS, RESOURCE_REGROW_TICKS, RESOURCE_REGROW_AMOUNT } from '../game/constants';
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
  setSelectionBox: (box: { x1: number; y1: number; x2: number; y2: number } | null) => void;
  spawnUnit: (col: number, row: number) => string;
  moveUnitTo: (id: string, col: number, row: number, delayTicks?: number) => void;
  commandGather: (ids: string[], col: number, row: number) => void;
  tick: () => void;
  rebuildOccupants: () => void;
}

let nextUnitIndex = 1;

const makeUnit = (col: number, row: number): Unit => ({
  id: `unit-${nextUnitIndex++}`,
  type: UnitType.Settler,
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
        ui: { selectedCol: null, selectedRow: null, selectedUnitIds: [], selectionBox: null },
        occupants: {},

        generateNewMap: (seed) => {
          set((state) => ({
            game: { ...state.game, map: generateMap(seed), tick: 0, savedAt: null, units: {} },
            occupants: {},
            ui: { selectedCol: null, selectedRow: null, selectedUnitIds: [], selectionBox: null },
          }), false, 'generateNewMap');
        },

        loadGameState: (game) => {
          set({ game, occupants: buildOccupants(game.units), ui: { selectedCol: null, selectedRow: null, selectedUnitIds: [], selectionBox: null } }, false, 'loadGameState');
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
                },
              },
            },
          }), false, 'moveUnitTo');
        },

        commandGather: (ids, col, row) => {
          const { game } = get();
          const patches: Record<string, Partial<Unit>> = {};

          for (const id of ids) {
            const unit = game.units[id];
            if (!unit) continue;

            if (unit.col === col && unit.row === row) {
              const tile = game.map.tiles[`${col},${row}`];
              if (tile?.hasResource) {
                patches[id] = { state: UnitState.Collecting, collectingTicksRemaining: GATHER_TICKS, gatherTarget: { col, row } };
              }
              continue;
            }

            const path = findPath(game.map, unit.col, unit.row, col, row);
            if (path.length === 0) continue;

            patches[id] = {
              targetCol: col, targetRow: row,
              path, moveTickDelay: 0,
              state: UnitState.Moving,
              gatherTarget: { col, row },
              collectingTicksRemaining: 0,
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
            let mapChanged = Object.keys(newTiles).length > 0;
            let resourcesChanged = false;
            const newResources = { ...state.game.resources };

            for (const id of Object.keys(units)) {
              const unit = units[id];

              if (unit.state === UnitState.Collecting) {
                const remaining = unit.collectingTicksRemaining - 1;

                if (remaining <= 0) {
                  const { col, row } = unit.gatherTarget!;
                  const tileKey = `${col},${row}`;
                  const tile = newTiles[tileKey] ?? tiles[tileKey];

                  if (tile?.hasResource && tile.resourceType !== ResourceType.None) {
                    const newAmount = tile.resourceAmount - 1;
                    const depleted = newAmount <= 0;
                    newTiles[tileKey] = {
                      ...tile,
                      resourceAmount: Math.max(0, newAmount),
                      hasResource: !depleted,
                      ...(depleted ? { lastHarvestedAt: newTick } : {}),
                    };
                    mapChanged = true;

                    const resType = tile.resourceType as HarvestableResource;
                    newResources[unit.ownerId] = {
                      ...newResources[unit.ownerId],
                      [resType]: (newResources[unit.ownerId]?.[resType] ?? 0) + 1,
                    };
                    resourcesChanged = true;

                    units[id] = {
                      ...unit,
                      state: UnitState.Idle,
                      collectingTicksRemaining: 0,
                      gatherTarget: null,
                      carrying: tile.resourceType as ResourceType,
                      carryingAmount: 1,
                    };
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

                const microDelay = remaining.length > 0 && Math.random() < 0.25 ? 1 : 0;

                let newState: UnitState;
                let collectingTicksRemaining = 0;

                if (remaining.length === 0 && unit.gatherTarget?.col === next.col && unit.gatherTarget?.row === next.row) {
                  const tileKey = `${next.col},${next.row}`;
                  const tile = newTiles[tileKey] ?? tiles[tileKey];
                  if (tile?.hasResource) {
                    newState = UnitState.Collecting;
                    collectingTicksRemaining = GATHER_TICKS;
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
                };
              } else {
                units[id] = { ...unit, moveProgress: newProgress };
              }
            }

            return {
              game: {
                ...state.game,
                tick: newTick,
                units,
                map: mapChanged ? { ...state.game.map, tiles: { ...tiles, ...newTiles } } : state.game.map,
                resources: resourcesChanged ? newResources : state.game.resources,
              },
              occupants,
            };
          }, false, 'tick');
        },
      }),
      {
        name: 'settlers-v2',
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
