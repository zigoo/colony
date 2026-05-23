export enum TileType {
  Water    = 'WATER',
  Sand     = 'SAND',
  Grass    = 'GRASS',
  Forest   = 'FOREST',
  Stone    = 'STONE',
  Mountain = 'MOUNTAIN',
}

export enum ResourceType {
  Wood  = 'WOOD',
  Stone = 'STONE',
  Food  = 'FOOD',
  Ore   = 'ORE',
  None  = 'NONE',
}

export enum BuildingType {
  LumberCamp = 'LUMBERCAMP',
  Quarry     = 'QUARRY',
  Farm       = 'FARM',
  Settlement = 'SETTLEMENT',
}

export enum UnitType {
  Settler = 'SETTLER',
  Worker  = 'WORKER',
  Scout   = 'SCOUT',
}

export enum UnitState {
  Idle       = 'IDLE',
  Moving     = 'MOVING',
  Collecting = 'COLLECTING',
  Building   = 'BUILDING',
}

export enum Direction {
  North     = 'N',
  NorthEast = 'NE',
  East      = 'E',
  SouthEast = 'SE',
  South     = 'S',
  SouthWest = 'SW',
  West      = 'W',
  NorthWest = 'NW',
}

export interface Tile {
  col: number;
  row: number;
  type: TileType;
  elevation: number;
  hasResource: boolean;
  resourceType: ResourceType;
  resourceAmount: number;
  moveCost: number;
  lastHarvestedAt?: number;
}

export interface MapState {
  tiles: Record<string, Tile>;
  width: number;
  height: number;
  seed: number;
  version: number;
}

export interface Building {
  id: string;
  type: BuildingType;
  col: number;
  row: number;
  ownerId: string;
  constructionProgress: number;
  level: number;
}

export interface Unit {
  id: string;
  type: UnitType;
  ownerId: string;
  col: number;
  row: number;
  prevCol: number;
  prevRow: number;
  targetCol: number | null;
  targetRow: number | null;
  path: Array<{ col: number; row: number }>;
  state: UnitState;
  moveProgress: number;
  moveTickDelay: number;
  carrying: ResourceType | null;
  carryingAmount: number;
  facing: Direction;
  gatherTarget: { col: number; row: number } | null;
  collectingTicksRemaining: number;
}

export type ResourceInventory = Record<Exclude<ResourceType, ResourceType.None>, number>;

export interface GameState {
  map: MapState;
  buildings: Record<string, Building>;
  units: Record<string, Unit>;
  resources: Record<string, ResourceInventory>;
  tick: number;
  tickRate: number;
  savedAt: number | null;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  screenWidth: number;
  screenHeight: number;
}

export interface UIState {
  selectedCol: number | null;
  selectedRow: number | null;
  selectedUnitIds: string[];
  selectionBox: { x1: number; y1: number; x2: number; y2: number } | null;
}
