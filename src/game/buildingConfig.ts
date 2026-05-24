import { BuildingType, TileType } from './types';
import type { Tile, Building } from './types';

// Tile footprint [cols, rows] — shared by rendering (anchor calc) and placement validation.
export const BUILDING_FOOTPRINT: Partial<Record<BuildingType, [number, number]>> = {
  [BuildingType.LumberCamp]: [2, 2],
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
    if (!tile || tile.type === TileType.Water || tile.type === TileType.Stone) return false;
  }

  const occupied = new Set<string>();
  for (const building of Object.values(buildings)) {
    for (const { col: c, row: r } of getFootprintTiles(building.type, building.col, building.row)) {
      occupied.add(`${c},${r}`);
    }
  }

  return footprint.every(({ col: c, row: r }) => !occupied.has(`${c},${r}`));
};
