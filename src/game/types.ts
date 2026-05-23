export type TileType = 'WATER' | 'GRASS' | 'FOREST' | 'MOUNTAIN' | 'STONE' | 'SAND';
export type ResourceType = 'WOOD' | 'STONE' | 'FOOD' | 'ORE' | 'NONE';
export type BuildingType = 'LUMBERCAMP' | 'QUARRY' | 'FARM' | 'SETTLEMENT';
export type UnitType = 'SETTLER' | 'WORKER' | 'SCOUT';
export type UnitState = 'IDLE' | 'MOVING' | 'COLLECTING' | 'BUILDING';
export type Direction = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface Tile {
  col: number;
  row: number;
  type: TileType;
  elevation: number;
  hasResource: boolean;
  resourceType: ResourceType;
  resourceAmount: number;
  moveCost: number;
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
  targetCol: number | null;
  targetRow: number | null;
  path: Array<{ col: number; row: number }>;
  state: UnitState;
  moveProgress: number;
  carrying: ResourceType | null;
  carryingAmount: number;
  facing: Direction;
}

export interface ResourceInventory {
  wood: number;
  stone: number;
  food: number;
  ore: number;
  [key: string]: number;
}

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
}
