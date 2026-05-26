import { TileType, ResourceType, Direction, GatherTier } from './types';

export const TILE_W = 64;
export const TILE_H = 32;
export const MAP_COLS = 840;
export const MAP_ROWS = 840;

export const CAMERA_MIN_ZOOM = 0.25;
export const CAMERA_MAX_ZOOM = 3;
export const CAMERA_ZOOM_STEP_IN = 1.1;
export const CAMERA_ZOOM_STEP_OUT = 0.9;

export const MIN_DRAG_DISTANCE = 2;
export const MIN_ZOOM_FOR_RESOURCES = 0.5;
export const RESOURCE_DOT_MIN_SCREEN_RADIUS = 2.5;
export const RESOURCE_DOT_MAX_SCREEN_RADIUS = 9;

// ── TERRAIN TUNING (how much of each thing the map has) ─────────────────────
// Tiles are classified by elevation noise (0..1). Each threshold is the UPPER
// bound of a band; the band's width = how much of that terrain there is.
//   water:  raise → MORE water.            band [0, water)
//   sand:   shoreline width.               band [water, sand)
//   forest: top of the land band.          band [sand, forest) = grass + forest
//   stone:  raise → MORE stone, LESS mountain. band [forest, stone) = stone
//           everything above `stone` is Mountain (impassable).
// So: more stone → raise `stone` (or lower `forest`); more grass → raise `forest`.
export const ELEVATION_THRESHOLDS = {
  water:    0.30,
  sand:     0.325,
  grass:    0.55,  // (2D texture color ramp only; classification uses the band below)
  forest:   0.695,
  stone:    0.82,
} as const;

// Water bodies smaller than this many connected tiles are drained to grass.
// Raise → only bigger lakes survive (fewer small ponds); lower → keep more ponds.
export const MIN_WATER_REGION_TILES = 300;

// Forest is scattered across the land band by a separate noise.
//   FOREST_NOISE_THRESHOLD: raise → LESS forest (sparser).
//   FOREST_NOISE_SCALE:     raise → smaller, more frequent clumps.
export const FOREST_NOISE_SCALE = 4;
export const FOREST_NOISE_THRESHOLD = 0.50;

// Harvestable nodes ON forest/stone tiles (NOT terrain coverage): chance a tile
// carries a resource, and how many units it holds. See RESOURCE_SPAWN_CHANCE
// and RESOURCE_AMOUNT below to tune wood/stone/food/ore richness.

export const RESOURCE_SPAWN_CHANCE = {
  forest: 0.3,
  stone:  0.4,
  food:   0.15,
  ore:    0.10,
} as const;

export const RESOURCE_AMOUNT = {
  woodMin:  3,
  woodMax:  8,
  stoneMin: 2,
  stoneMax: 6,
  foodMin:  2,
  foodMax:  5,
  oreMin:   1,
  oreMax:   4,
} as const;

export const RESOURCE_AMOUNT_MAX: Partial<Record<ResourceType, number>> = {
  [ResourceType.Wood]:  RESOURCE_AMOUNT.woodMax,
  [ResourceType.Stone]: RESOURCE_AMOUNT.stoneMax,
  [ResourceType.Food]:  RESOURCE_AMOUNT.foodMax,
  [ResourceType.Ore]:   RESOURCE_AMOUNT.oreMax,
};

export const CONSTRUCTION_MAX_WORKERS   = 2;   // max builders assignable during construction
export const FOOD_CONSUMPTION_INTERVAL  = 200; // ticks between food consumption (1 food per unit)
export const SETTLEMENT_SPAWN_INTERVAL  = 400; // ticks between settlement spawn attempts
export const SETTLEMENT_SPAWN_FOOD_COST = 5;   // food consumed per new unit

export const GATHER_TICKS = 5;
export const DEPOSIT_TICKS = 4;
export const STOREHOUSE_MAX_ITEMS = 40; // level 1 capacity — kept for backwards compat
export const STOREHOUSE_CAPACITY_BY_LEVEL = [40, 200]; // index = level-1

export const GATHER_TIER_CONFIG: Record<GatherTier, { amount: number; ticks: number }> = {
  [GatherTier.Gatherer]:  { amount: 1, ticks: 5  },
  [GatherTier.Harvester]: { amount: 3, ticks: 12 },
  [GatherTier.Extractor]: { amount: 7, ticks: 25 },
};

export const RESOURCE_REGROW_TICKS: Partial<Record<ResourceType, number>> = {
  [ResourceType.Wood]: 200,
  [ResourceType.Food]: 100,
};

export const RESOURCE_REGROW_AMOUNT: Partial<Record<ResourceType, { min: number; max: number }>> = {
  [ResourceType.Wood]: { min: 3, max: 8 },
  [ResourceType.Food]: { min: 2, max: 5 },
};

export const TILE_MOVE_COSTS: Record<TileType, number> = {
  [TileType.Water]:    Infinity,
  [TileType.Sand]:     1.5,
  [TileType.Grass]:    1,
  [TileType.Forest]:   1.5,
  [TileType.Stone]:    1.2,
  [TileType.Mountain]: Infinity,
};

export const TILE_COLORS: Record<TileType, string> = {
  [TileType.Water]:    '#2e6da4',
  [TileType.Sand]:     '#c2b280',
  [TileType.Grass]:    '#5a9e3a',
  [TileType.Forest]:   '#2d6e2d',
  [TileType.Stone]:    '#9e9e7a',
  [TileType.Mountain]: '#6e6e6e',
};

export const UNIT_MOVE_TICKS = 3;       // ticks to cross a tile at walking pace
export const RUN_MOVE_TICKS = 2;        // ticks to cross a tile while running (faster)

// Stamina / running. Drains while running, regenerates while idle (and slightly
// while walking). Hysteresis: a tired unit must recover past the threshold
// before it starts running again.
export const STAMINA_MAX = 100;
export const STAMINA_RUN_DRAIN = 1.4;   // per tick while running
export const STAMINA_IDLE_REGEN = 0.9;  // per tick while idle
export const STAMINA_WALK_REGEN = 0.2;  // per tick while moving but not running
export const STAMINA_RUN_THRESHOLD = 25; // min stamina to (re)start running
export const HEALTH_MAX = 100;

// Random settler names, picked at spawn.
export const UNIT_NAMES = [
  'Bjorn', 'Greta', 'Hauk', 'Ingrid', 'Knut', 'Liv', 'Magnus', 'Sigrid',
  'Torsten', 'Astrid', 'Erik', 'Frida', 'Gunnar', 'Helga', 'Ivar', 'Solveig',
  'Rurik', 'Dagny', 'Oskar', 'Runa', 'Vidar', 'Yrsa', 'Halvard', 'Tove',
];

export const SPRITE_BASE_PATH = '/assets/sprites/units/character';

export const ANIMATION_FPS: Record<string, number> = {
  idle:   6,
  walk:   8,
  run:    12,
  attack: 10,
};

export const ANIMATION_FRAMES: Record<string, number> = {
  idle:   12,
  walk:   8,
  run:    8,
  attack: 7,
};

export const ANIMATION_FRAME_SIZE: Record<string, { width: number; height: number }> = {
  idle:   { width: 64, height: 64 },
  walk:   { width: 64, height: 64 },
  run:    { width: 64, height: 64 },
  attack: { width: 96, height: 96 },
};

export const DIRECTION_ROW: Record<Direction, number> = {
  [Direction.South]:     0,
  [Direction.SouthWest]: 1,
  [Direction.West]:      2,
  [Direction.NorthWest]: 3,
  [Direction.North]:     4,
  [Direction.NorthEast]: 5,
  [Direction.East]:      6,
  [Direction.SouthEast]: 7,
};

export const UNIT_SELECTION_COLOR      = 'rgba(80, 200, 255, 0.9)';
export const UNIT_SELECTION_FILL       = 'rgba(80, 200, 255, 0.25)';
export const UNIT_DESTINATION_COLOR    = 'rgba(255, 200, 50, 0.9)';
export const UNIT_DESTINATION_FILL     = 'rgba(255, 200, 50, 0.12)';
export const UNIT_DESTINATION_DASH     = 5;   // world-space dash length (scales with zoom)

// Shifts the sprite down so feet align with the tile's bottom diamond vertex (wy + TILE_H/2).
// Without this the sprite body floats above its tile in isometric view.
export const SPRITE_Y_OFFSET = TILE_H / 2;

export const RESOURCE_COLORS: Partial<Record<ResourceType, string>> = {
  [ResourceType.Wood]:  '#8B4513',
  [ResourceType.Stone]: '#808080',
  [ResourceType.Food]:  '#FFD700',
  [ResourceType.Ore]:   '#B8860B',
};
