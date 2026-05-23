import { SPRITE_BASE_PATH } from '../../game/constants';

const cache = new Map<string, HTMLImageElement>();

export const loadSprite = (name: string): HTMLImageElement => {
  const cached = cache.get(name);
  if (cached) return cached;

  const img = new Image();
  img.src = `${SPRITE_BASE_PATH}/${name}.png`;
  cache.set(name, img);

  return img;
};

export const preloadSprites = (): void => {
  ['walk', 'idle', 'run', 'attack'].forEach(loadSprite);
};
