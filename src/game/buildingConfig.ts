import { BuildingType, ResourceType, TileType } from './types';
import type { Tile, Building } from './types';

// Physical materials workers must deliver to the construction site before building can proceed.
// Consumed from building inventory when construction completes.
// Storehouse is pre-filled with these on placement (bootstrap — no existing Storehouse needed).
export const BUILDING_CONSTRUCTION_MATERIALS: Partial<Record<BuildingType, Partial<Record<ResourceType, number>>>> = {
  [BuildingType.WoodCutter]: { [ResourceType.Planks]: 5 },
  [BuildingType.LumberCamp]: { [ResourceType.Planks]: 8 },
  [BuildingType.Farm]:       { [ResourceType.Planks]: 6 },
  [BuildingType.Storehouse]: { [ResourceType.Planks]: 4 },
  [BuildingType.Quarry]:     { [ResourceType.Planks]: 6 },
};

// Ticks of worker-time required to complete construction (1 worker = 1 tick/tick).
// Road and Settlement have no construction phase (instant placement).
export const CONSTRUCTION_TICKS: Partial<Record<BuildingType, number>> = {
  [BuildingType.WoodCutter]: 60,
  [BuildingType.LumberCamp]: 80,
  [BuildingType.Farm]:       70,
  [BuildingType.Storehouse]: 50,
  [BuildingType.Quarry]:     80,
};

// Tile footprint [cols, rows] — shared by rendering (anchor calc) and placement validation.
export const BUILDING_FOOTPRINT: Partial<Record<BuildingType, [number, number]>> = {
  [BuildingType.LumberCamp]: [2, 2],
  [BuildingType.Storehouse]: [2, 2],
  [BuildingType.WoodCutter]: [10, 10],
  [BuildingType.Farm]:       [2, 2],
};

export interface BuildingLevelConfig {
  maxWorkers: number;
}

// Per-level progression for each building type.
// Index = level - 1. Output uses diminishing-returns formula (see getCurrentOutput).
export const BUILDING_LEVEL_CONFIG: Partial<Record<BuildingType, BuildingLevelConfig[]>> = {
  [BuildingType.LumberCamp]: [
    { maxWorkers: 2 },  // level 1
    { maxWorkers: 3 },  // level 2
    { maxWorkers: 4 },  // level 3
  ],
  [BuildingType.WoodCutter]: [
    { maxWorkers: 2 },  // level 1
    { maxWorkers: 3 },  // level 2
    { maxWorkers: 4 },  // level 3
  ],
  [BuildingType.Farm]: [
    { maxWorkers: 2 },
    { maxWorkers: 3 },
    { maxWorkers: 4 },
  ],
  [BuildingType.Storehouse]: [
    { maxWorkers: 0 }, // level 1 — 40 capacity
    { maxWorkers: 0 }, // level 2 — 200 capacity
  ],
};

// Resources consumed from the building's own inventory when upgrading to that level.
export const BUILDING_UPGRADE_COST: Partial<Record<BuildingType, Partial<Record<number, Partial<Record<ResourceType, number>>>>>> = {
  [BuildingType.Storehouse]: {
    2: { [ResourceType.Planks]: 10 },
  },
};

export interface BuildingProductionConfig {
  input: Partial<Record<ResourceType, number>>;
  inputCapacity: Partial<Record<ResourceType, number>>;
  output: Partial<Record<ResourceType, number>>;
  outputCapacity: Partial<Record<ResourceType, number>>;
  cycleTime: number;
}

export const BUILDING_PRODUCTION: Partial<Record<BuildingType, BuildingProductionConfig>> = {
  [BuildingType.LumberCamp]: {
    input:          { [ResourceType.Lumber]: 1 },
    inputCapacity:  { [ResourceType.Lumber]: 20 },
    output:         { [ResourceType.Planks]: 2 },
    outputCapacity: { [ResourceType.Planks]: 20 },
    cycleTime:      30,
  },
  [BuildingType.Farm]: {
    input:          {},
    inputCapacity:  {},
    output:         { [ResourceType.Food]: 1 },
    outputCapacity: { [ResourceType.Food]: 20 },
    cycleTime:      40,
  },
  // WoodCutter: workers gather from forest, cycleTime 0 = no production cycle.
  [BuildingType.WoodCutter]: {
    input:          {},
    inputCapacity:  {},
    output:         { [ResourceType.Lumber]: 1 },
    outputCapacity: { [ResourceType.Lumber]: 20 },
    cycleTime:      0,
  },
};

export const getLevelConfig = (type: BuildingType, level: number): BuildingLevelConfig | null => {
  const configs = BUILDING_LEVEL_CONFIG[type];

  if (!configs) return null;

  return configs[Math.min(level - 1, configs.length - 1)] ?? null;
};

export const getWorkerCapacity = (type: BuildingType, level: number): number =>
  getLevelConfig(type, level)?.maxWorkers ?? 0;

// Output multiplier for the given worker count.
// Each additional worker adds 70% of the previous one (diminishing returns).
//   1 worker  → 1.00×
//   2 workers → 1.70×
//   3 workers → 2.19×
export const getCurrentOutput = (type: BuildingType, level: number, workers: number): number => {
  const capacity = getWorkerCapacity(type, level);

  if (capacity === 0 || workers === 0) return 0;

  const w = Math.min(workers, capacity);
  let sum = 0;

  for (let i = 0; i < w; i++) sum += Math.pow(0.7, i);

  return Math.round(sum * 100) / 100;
};

// Efficiency as 0–1 fraction: currentOutput / maxPossibleOutput at this level.
export const getEfficiency = (type: BuildingType, level: number, workers: number): number => {
  const capacity = getWorkerCapacity(type, level);

  if (capacity === 0) return 0;

  const maxOutput = getCurrentOutput(type, level, capacity);

  if (maxOutput === 0) return 0;

  return getCurrentOutput(type, level, workers) / maxOutput;
};

export const getFootprintTiles = (
  type: BuildingType,
  col: number,
  row: number,
): Array<{ col: number; row: number }> => {
  const [fcols, frows] = BUILDING_FOOTPRINT[type] ?? [1, 1];
  const tiles: Array<{ col: number; row: number }> = [];

  for (let c = col; c < col + fcols; c++) {
    for (let r = row; r < row + frows; r++) {
      tiles.push({ col: c, row: r });
    }
  }

  return tiles;
};

export const canPlaceBuilding = (
  type: BuildingType,
  col: number,
  row: number,
  mapTiles: Record<string, Tile>,
  buildings: Record<string, Building>,
): boolean => {
  const footprint = getFootprintTiles(type, col, row);

  for (const { col: c, row: r } of footprint) {
    const tile = mapTiles[`${c},${r}`];
    if (!tile || tile.type === TileType.Water || tile.type === TileType.Sand || tile.type === TileType.Stone || tile.type === TileType.Mountain) return false;
  }

  const occupied = new Set<string>();
  for (const building of Object.values(buildings)) {
    for (const { col: c, row: r } of getFootprintTiles(building.type, building.col, building.row)) {
      occupied.add(`${c},${r}`);
    }
  }

  return footprint.every(({ col: c, row: r }) => !occupied.has(`${c},${r}`));
};
