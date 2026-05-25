import { createNoise2D } from 'simplex-noise';
import { TileType } from '../game/types';
import { TILE_W, TILE_H, ELEVATION_THRESHOLDS } from '../game/constants';

const W = TILE_W;
const H = TILE_H;

const GRASS_LEVELS  = 5;
const FOREST_LEVELS = 3;

const cache = new Map<string, ImageBitmap>();

const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = seed + 0x6d2b79f5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const lerp  = (a: number, b: number, t: number) => a + (b - a) * t;

const insideDiamond = (x: number, y: number): boolean =>
  Math.abs(x - W / 2) / (W / 2) + Math.abs(y - H / 2) / (H / 2) <= 1.02;

const bake = (
  baseR: number, baseG: number, baseB: number,
  noiseScale: number, amp: number,
  seed: number,
): ImageBitmap => {
  const canvas = new OffscreenCanvas(W, H);
  const ctx    = canvas.getContext('2d')!;
  const n1     = createNoise2D(mulberry32(seed));
  const n2     = createNoise2D(mulberry32(seed + 997));

  const img  = ctx.createImageData(W, H);
  const data = img.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!insideDiamond(x, y)) continue;

      const v1 = n1(x * noiseScale, y * noiseScale);
      const v2 = n2(x * noiseScale * 0.35, y * noiseScale * 0.35);
      const v  = v1 * amp + v2 * amp * 0.4;

      const i    = (y * W + x) * 4;
      data[i]    = clamp(baseR + v * 0.5);
      data[i + 1] = clamp(baseG + v);
      data[i + 2] = clamp(baseB + v * 0.25);
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);

  return canvas.transferToImageBitmap();
};

export const generateTileTextures = (): void => {
  const GRASS_LOW  = [122, 184, 74] as const;
  const GRASS_HIGH = [58,  126, 26] as const;
  for (let i = 0; i < GRASS_LEVELS; i++) {
    const t = i / (GRASS_LEVELS - 1);
    cache.set(`${TileType.Grass}:${i}`, bake(
      lerp(GRASS_LOW[0], GRASS_HIGH[0], t),
      lerp(GRASS_LOW[1], GRASS_HIGH[1], t),
      lerp(GRASS_LOW[2], GRASS_HIGH[2], t),
      0.18, 20, 100 + i * 11,
    ));
  }

  const FOREST_LOW  = [65, 130, 55] as const;
  const FOREST_HIGH = [28,  82, 28] as const;
  for (let i = 0; i < FOREST_LEVELS; i++) {
    const t = i / (FOREST_LEVELS - 1);
    cache.set(`${TileType.Forest}:${i}`, bake(
      lerp(FOREST_LOW[0], FOREST_HIGH[0], t),
      lerp(FOREST_LOW[1], FOREST_HIGH[1], t),
      lerp(FOREST_LOW[2], FOREST_HIGH[2], t),
      0.15, 15, 200 + i * 11,
    ));
  }

  cache.set(`${TileType.Sand}:0`,     bake(194, 178, 128, 0.22, 10, 300));
  cache.set(`${TileType.Water}:0`,    bake( 46, 109, 164, 0.10,  8, 400));
  cache.set(`${TileType.Stone}:0`,    bake(158, 158, 122, 0.20, 18, 500));
  cache.set(`${TileType.Mountain}:0`, bake(110, 110, 110, 0.25, 20, 600));
};

const getGrassBucket = (elevation: number): number => {
  const range = ELEVATION_THRESHOLDS.grass - ELEVATION_THRESHOLDS.sand;
  const t     = (elevation - ELEVATION_THRESHOLDS.sand) / range;
  return Math.max(0, Math.min(GRASS_LEVELS - 1, Math.floor(t * GRASS_LEVELS)));
};

const getForestBucket = (elevation: number): number => {
  const range = ELEVATION_THRESHOLDS.forest - ELEVATION_THRESHOLDS.grass;
  const t     = (elevation - ELEVATION_THRESHOLDS.grass) / range;
  return Math.max(0, Math.min(FOREST_LEVELS - 1, Math.floor(t * FOREST_LEVELS)));
};

export const getTileTexture = (type: TileType, elevation: number): ImageBitmap | undefined => {
  if (type === TileType.Grass)  return cache.get(`${type}:${getGrassBucket(elevation)}`);
  if (type === TileType.Forest) return cache.get(`${type}:${getForestBucket(elevation)}`);
  return cache.get(`${type}:0`);
};
