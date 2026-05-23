export const TILE_W = 64;   // szerokość rombu w px
export const TILE_H = 32;   // wysokość rombu w px (TILE_W / 2)
export const MAP_COLS = 120;
export const MAP_ROWS = 120;

export const TILE_COLORS: Record<string, string> = {
  WATER:    '#2e6da4',
  SAND:     '#c2b280',
  GRASS:    '#5a9e3a',
  FOREST:   '#2d6e2d',
  STONE:    '#9e9e7a',
  MOUNTAIN: '#6e6e6e',
};

export const RESOURCE_COLORS: Record<string, string> = {
  WOOD:  '#8B4513',
  STONE: '#808080',
  FOOD:  '#FFD700',
  ORE:   '#B8860B',
};
