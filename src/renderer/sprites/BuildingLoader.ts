const cache = new Map<string, HTMLImageElement>();

const load = (key: string, path: string): HTMLImageElement => {
  const cached = cache.get(key);
  if (cached) return cached;
  const img = new Image();
  img.src = path;
  cache.set(key, img);
  return img;
};

export const getBuildingSprite = (key: string): HTMLImageElement | undefined =>
  cache.get(key);

export const preloadBuildingSprites = (): void => {
  load('sawmill_working',    '/assets/sprites/buildings/sawmill/sawmill_working_spritesheet.png');
  load('sawmill_settled',    '/assets/sprites/buildings/sawmill/sawmill_empty_settled.png');
  load('sawmill_unoccupied', '/assets/sprites/buildings/sawmill/sawmill_empty_unoccupied.png');
  load('storehouse_sheet',   '/assets/sprites/buildings/storehouse/storehouse.png');
};
