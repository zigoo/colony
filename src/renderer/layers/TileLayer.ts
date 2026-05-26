import type { MapState, CameraState, Tile } from '../../game/types';
import { TileType } from '../../game/types';
import { isoCorners, screenToWorld, gridToWorld } from '../../game/isoMath';
import { TILE_COLORS, TILE_W, TILE_H, MAP_COLS, MAP_ROWS } from '../../game/constants';
import { getGrassImage } from '../grassLoader';
import { getSandImage } from '../sandLoader';
import { getWaterSheet } from '../waterLoader';
import { getRoadBitmap } from '../roadGen';
import { roadPreview } from '../placementPreview';

// --- grass pattern ---

let _grassPattern: CanvasPattern | null = null;
let _patternCtx:   CanvasRenderingContext2D | null = null;

const getGrassPattern = (ctx: CanvasRenderingContext2D): CanvasPattern | null => {
  const img = getGrassImage();
  if (!img?.complete || img.naturalWidth === 0) return null;
  if (ctx !== _patternCtx || !_grassPattern) {
    _patternCtx   = ctx;
    _grassPattern = ctx.createPattern(img, 'repeat') ?? null;
  }
  return _grassPattern;
};

// --- sand pattern ---

let _sandPattern:    CanvasPattern | null = null;
let _sandPatternCtx: CanvasRenderingContext2D | null = null;

const getSandPattern = (ctx: CanvasRenderingContext2D): CanvasPattern | null => {
  const img = getSandImage();
  if (!img?.complete || img.naturalWidth === 0) return null;
  if (ctx !== _sandPatternCtx || !_sandPattern) {
    _sandPatternCtx = ctx;
    _sandPattern    = ctx.createPattern(img, 'repeat') ?? null;
  }
  return _sandPattern;
};

// --- non-grass tile color ---

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

const tileJitter = (col: number, row: number): number => {
  let h = Math.imul(col * 2053 + row * 4093, 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) & 0xFF) / 255;
};

const getTileColor = (tile: Tile): string => {
  const j    = (tileJitter(tile.col, tile.row) - 0.5) * 14;
  const base = TILE_COLORS[tile.type] ?? '#888';
  const r    = parseInt(base.slice(1, 3), 16);
  const g    = parseInt(base.slice(3, 5), 16);
  const b    = parseInt(base.slice(5, 7), 16);
  return `rgb(${clamp(r + j * 0.4)},${clamp(g + j * 0.8)},${clamp(b + j * 0.3)})`;
};

// --- water rendering ---

const WATER_FRAMES   = 16;
const WATER_FPS      = 5; // 40% slower than original 8 fps
const WATER_TEX_SIZE = 256; // each frame is 256×256 px, also used as world-space repeat period

// Offscreen canvas holds the current animation frame — createPattern is called once per frame change.
let _waterOffscreen: HTMLCanvasElement | null = null;
let _waterOffCtx:    CanvasRenderingContext2D | null = null;
let _waterPattern:   CanvasPattern | null = null;
let _waterPatternCtx: CanvasRenderingContext2D | null = null;
let _waterLastFrame  = -1;

const getWaterPattern = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  t: number,
): CanvasPattern | null => {
  if (!_waterOffscreen) {
    _waterOffscreen      = document.createElement('canvas');
    _waterOffscreen.width = _waterOffscreen.height = WATER_TEX_SIZE;
    _waterOffCtx         = _waterOffscreen.getContext('2d');
  }

  if (!_waterOffCtx) return null;

  const frame = Math.floor(t * WATER_FPS) % WATER_FRAMES;

  if (frame !== _waterLastFrame || ctx !== _waterPatternCtx) {
    _waterOffCtx.clearRect(0, 0, WATER_TEX_SIZE, WATER_TEX_SIZE);
    _waterOffCtx.drawImage(img, frame * WATER_TEX_SIZE, 0, WATER_TEX_SIZE, WATER_TEX_SIZE, 0, 0, WATER_TEX_SIZE, WATER_TEX_SIZE);
    _waterPattern    = ctx.createPattern(_waterOffscreen, 'repeat') ?? null;
    _waterLastFrame  = frame;
    _waterPatternCtx = ctx;
  }

  return _waterPattern;
};

const isNonWater = (tile: Tile | undefined): boolean =>
  !!tile && tile.type !== TileType.Water;

const isWater = (tile: Tile | undefined): boolean =>
  tile?.type === TileType.Water;

const isSand = (tile: Tile | undefined): boolean =>
  tile?.type === TileType.Sand;

const isGrassLike = (tile: Tile | undefined): boolean =>
  tile?.type === TileType.Grass || tile?.type === TileType.Forest;

// Generic edge-colour blend — cardinal + diagonal 8-neighbour version.
//
// Cardinal edges: long linear gradient from edge midpoint to opposite edge midpoint,
// fading smoothly to 0 over the full tile span so no hard cutoff.
//
// Cardinal corner patches: radial at shared vertex when two active edges meet.
// Diagonal-only patches: smaller radial at vertex when only the diagonal is active.
//
// Vertex order from isoCorners:
//   corners[0] = NW vertex  (shared by N & W edges)
//   corners[1] = NE vertex  (shared by N & E edges)
//   corners[2] = SE vertex  (shared by S & E edges)
//   corners[3] = SW vertex  (shared by S & W edges)
const drawEdgeColorBlend = (
  ctx:    CanvasRenderingContext2D,
  corners: ReturnType<typeof isoCorners>,
  wx:     number,
  wy:     number,
  edgeN:  boolean,
  edgeE:  boolean,
  edgeS:  boolean,
  edgeW:  boolean,
  diagNE: boolean,
  diagSE: boolean,
  diagSW: boolean,
  diagNW: boolean,
  rgb:    string,
  alpha0: number,
): void => {
  const C0 = `rgba(${rgb},${alpha0.toFixed(2)})`;
  const C1 = `rgba(${rgb},${(alpha0 * 0.60).toFixed(2)})`;
  const C2 = `rgba(${rgb},${(alpha0 * 0.25).toFixed(2)})`;
  const C3 = `rgba(${rgb},${(alpha0 * 0.07).toFixed(2)})`;
  const C4 = `rgba(${rgb},0)`;

  // --- cardinal edge gradients ---
  const edgeMids = [
    { active: edgeN, ex: (corners[0].x + corners[1].x) / 2, ey: (corners[0].y + corners[1].y) / 2 },
    { active: edgeE, ex: (corners[1].x + corners[2].x) / 2, ey: (corners[1].y + corners[2].y) / 2 },
    { active: edgeS, ex: (corners[2].x + corners[3].x) / 2, ey: (corners[2].y + corners[3].y) / 2 },
    { active: edgeW, ex: (corners[3].x + corners[0].x) / 2, ey: (corners[3].y + corners[0].y) / 2 },
  ];

  for (const { active, ex, ey } of edgeMids) {
    if (!active) continue;
    const tx   = wx + (wx - ex);
    const ty   = wy + (wy - ey);
    const grad = ctx.createLinearGradient(ex, ey, tx, ty);
    grad.addColorStop(0,    C0);
    grad.addColorStop(0.20, C1);
    grad.addColorStop(0.45, C2);
    grad.addColorStop(0.70, C3);
    grad.addColorStop(1.0,  C4);
    ctx.save();
    diamondPath(ctx, corners);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(wx - TILE_W * 2, wy - TILE_H * 2, TILE_W * 4, TILE_H * 4);
    ctx.restore();
  }

  // --- cardinal corner patches ---
  const cR2 = `rgba(${rgb},${(alpha0 * 0.70).toFixed(2)})`;
  const cR3 = `rgba(${rgb},${(alpha0 * 0.28).toFixed(2)})`;
  const cR4 = `rgba(${rgb},${(alpha0 * 0.08).toFixed(2)})`;

  const cardinalCorners: Array<{ active: boolean; vx: number; vy: number }> = [
    { active: edgeN && edgeW, vx: corners[0].x, vy: corners[0].y },
    { active: edgeN && edgeE, vx: corners[1].x, vy: corners[1].y },
    { active: edgeS && edgeE, vx: corners[2].x, vy: corners[2].y },
    { active: edgeS && edgeW, vx: corners[3].x, vy: corners[3].y },
  ];

  for (const { active, vx, vy } of cardinalCorners) {
    if (!active) continue;
    const r      = TILE_W * 0.78;
    const radial = ctx.createRadialGradient(vx, vy, 0, vx, vy, r);
    radial.addColorStop(0,    C0);
    radial.addColorStop(0.32, cR2);
    radial.addColorStop(0.60, cR3);
    radial.addColorStop(0.85, cR4);
    radial.addColorStop(1.0,  C4);
    ctx.save();
    diamondPath(ctx, corners);
    ctx.clip();
    ctx.fillStyle = radial;
    ctx.fillRect(wx - TILE_W * 2, wy - TILE_H * 2, TILE_W * 4, TILE_H * 4);
    ctx.restore();
  }

  // --- diagonal-only corner patches ---
  const dA0 = `rgba(${rgb},${(alpha0 * 0.68).toFixed(2)})`;
  const dA1 = `rgba(${rgb},${(alpha0 * 0.32).toFixed(2)})`;
  const dA2 = `rgba(${rgb},${(alpha0 * 0.10).toFixed(2)})`;

  const diagCorners: Array<{ active: boolean; vx: number; vy: number }> = [
    { active: diagNW && !edgeN && !edgeW, vx: corners[0].x, vy: corners[0].y },
    { active: diagNE && !edgeN && !edgeE, vx: corners[1].x, vy: corners[1].y },
    { active: diagSE && !edgeS && !edgeE, vx: corners[2].x, vy: corners[2].y },
    { active: diagSW && !edgeS && !edgeW, vx: corners[3].x, vy: corners[3].y },
  ];

  for (const { active, vx, vy } of diagCorners) {
    if (!active) continue;
    const r      = TILE_W * 0.58;
    const radial = ctx.createRadialGradient(vx, vy, 0, vx, vy, r);
    radial.addColorStop(0,    dA0);
    radial.addColorStop(0.38, dA1);
    radial.addColorStop(0.70, dA2);
    radial.addColorStop(1.0,  C4);
    ctx.save();
    diamondPath(ctx, corners);
    ctx.clip();
    ctx.fillStyle = radial;
    ctx.fillRect(wx - TILE_W * 2, wy - TILE_H * 2, TILE_W * 4, TILE_H * 4);
    ctx.restore();
  }
};

const drawWaterTile = (
  ctx:     CanvasRenderingContext2D,
  corners: ReturnType<typeof isoCorners>,
  col:     number,
  row:     number,
  t:       number,
  tiles:   MapState['tiles'],
  wx:      number,
  wy:      number,
): void => {
  const img = getWaterSheet();

  ctx.save();
  diamondPath(ctx, corners);
  ctx.clip();

  if (img?.complete && img.naturalWidth > 0) {
    const pattern = getWaterPattern(ctx, img, t);

    if (pattern) {
      ctx.fillStyle = pattern;
      // fillRect must cover the full diamond; 4× tile size is enough in all cases.
      ctx.fillRect(wx - TILE_W * 2, wy - TILE_H * 2, TILE_W * 4, TILE_H * 4);
    } else {
      ctx.fillStyle = '#1e5c94';
      ctx.fill();
    }
  } else {
    // Spritesheet not yet loaded — plain colour fallback.
    ctx.fillStyle = '#1e5c94';
    ctx.fillRect(wx - TILE_W * 2, wy - TILE_H * 2, TILE_W * 4, TILE_H * 4);
  }

  ctx.restore();

  // ── shore effects ──────────────────────────────────────────────────────────
  const hasLandN  = isNonWater(tiles[`${col},${row - 1}`]);
  const hasLandE  = isNonWater(tiles[`${col + 1},${row}`]);
  const hasLandS  = isNonWater(tiles[`${col},${row + 1}`]);
  const hasLandW  = isNonWater(tiles[`${col - 1},${row}`]);
  const hasLandNE = isNonWater(tiles[`${col + 1},${row - 1}`]);
  const hasLandSE = isNonWater(tiles[`${col + 1},${row + 1}`]);
  const hasLandSW = isNonWater(tiles[`${col - 1},${row + 1}`]);
  const hasLandNW = isNonWater(tiles[`${col - 1},${row - 1}`]);

  if (!hasLandN && !hasLandE && !hasLandS && !hasLandW &&
      !hasLandNE && !hasLandSE && !hasLandSW && !hasLandNW) return;

  const SAND0 = 'rgba(194,178,128,0.92)';
  const SAND1 = 'rgba(194,178,128,0.55)';
  const SAND2 = 'rgba(194,178,128,0.22)';
  const SAND3 = 'rgba(194,178,128,0.06)';
  const SAND4 = 'rgba(194,178,128,0)';

  // Cardinal edge gradients — extend to full tile span.
  const edgeMids = [
    { active: hasLandN, ex: (corners[0].x + corners[1].x) / 2, ey: (corners[0].y + corners[1].y) / 2 },
    { active: hasLandE, ex: (corners[1].x + corners[2].x) / 2, ey: (corners[1].y + corners[2].y) / 2 },
    { active: hasLandS, ex: (corners[2].x + corners[3].x) / 2, ey: (corners[2].y + corners[3].y) / 2 },
    { active: hasLandW, ex: (corners[3].x + corners[0].x) / 2, ey: (corners[3].y + corners[0].y) / 2 },
  ];

  for (const { active, ex, ey } of edgeMids) {
    if (!active) continue;
    const tx   = wx + (wx - ex);
    const ty   = wy + (wy - ey);
    const grad = ctx.createLinearGradient(ex, ey, tx, ty);
    grad.addColorStop(0,    SAND0);
    grad.addColorStop(0.20, SAND1);
    grad.addColorStop(0.45, SAND2);
    grad.addColorStop(0.70, SAND3);
    grad.addColorStop(1.0,  SAND4);
    ctx.save();
    diamondPath(ctx, corners);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(wx - TILE_W * 2, wy - TILE_H * 2, TILE_W * 4, TILE_H * 4);
    ctx.restore();
  }

  // Cardinal corner patches.
  const cardinalCorners: Array<{ active: boolean; vx: number; vy: number }> = [
    { active: hasLandN && hasLandW, vx: corners[0].x, vy: corners[0].y },
    { active: hasLandN && hasLandE, vx: corners[1].x, vy: corners[1].y },
    { active: hasLandS && hasLandE, vx: corners[2].x, vy: corners[2].y },
    { active: hasLandS && hasLandW, vx: corners[3].x, vy: corners[3].y },
  ];

  for (const { active, vx, vy } of cardinalCorners) {
    if (!active) continue;
    const r      = TILE_W * 0.78;
    const radial = ctx.createRadialGradient(vx, vy, 0, vx, vy, r);
    radial.addColorStop(0,    SAND0);
    radial.addColorStop(0.32, SAND1);
    radial.addColorStop(0.60, SAND2);
    radial.addColorStop(0.85, SAND3);
    radial.addColorStop(1.0,  SAND4);
    ctx.save();
    diamondPath(ctx, corners);
    ctx.clip();
    ctx.fillStyle = radial;
    ctx.fillRect(wx - TILE_W * 2, wy - TILE_H * 2, TILE_W * 4, TILE_H * 4);
    ctx.restore();
  }

  // Diagonal-only shore corners.
  const diagCorners: Array<{ active: boolean; vx: number; vy: number }> = [
    { active: hasLandNW && !hasLandN && !hasLandW, vx: corners[0].x, vy: corners[0].y },
    { active: hasLandNE && !hasLandN && !hasLandE, vx: corners[1].x, vy: corners[1].y },
    { active: hasLandSE && !hasLandS && !hasLandE, vx: corners[2].x, vy: corners[2].y },
    { active: hasLandSW && !hasLandS && !hasLandW, vx: corners[3].x, vy: corners[3].y },
  ];

  for (const { active, vx, vy } of diagCorners) {
    if (!active) continue;
    const r      = TILE_W * 0.58;
    const radial = ctx.createRadialGradient(vx, vy, 0, vx, vy, r);
    radial.addColorStop(0,    'rgba(194,178,128,0.68)');
    radial.addColorStop(0.38, 'rgba(194,178,128,0.30)');
    radial.addColorStop(0.70, 'rgba(194,178,128,0.08)');
    radial.addColorStop(1.0,  SAND4);
    ctx.save();
    diamondPath(ctx, corners);
    ctx.clip();
    ctx.fillStyle = radial;
    ctx.fillRect(wx - TILE_W * 2, wy - TILE_H * 2, TILE_W * 4, TILE_H * 4);
    ctx.restore();
  }
};

// --- wet-sand blend (sand tiles adjacent to water) ---
// Mirrors drawWaterTile's sand gradient: water colour bleeds into the sand tile
// from the water-facing edge, creating a continuous shore transition.
// Checks all 8 neighbours so diagonal water corners are covered too.

const drawWetSandBlend = (
  ctx:        CanvasRenderingContext2D,
  corners:    ReturnType<typeof isoCorners>,
  wx:         number,
  wy:         number,
  hasWaterN:  boolean,
  hasWaterE:  boolean,
  hasWaterS:  boolean,
  hasWaterW:  boolean,
  hasWaterNE: boolean,
  hasWaterSE: boolean,
  hasWaterSW: boolean,
  hasWaterNW: boolean,
): void => {
  const WET0 = 'rgba(148,135,88,0.72)';
  const WET1 = 'rgba(148,135,88,0.43)';
  const WET2 = 'rgba(148,135,88,0.18)';
  const WET3 = 'rgba(148,135,88,0.05)';
  const WET4 = 'rgba(148,135,88,0)';

  const edgeMids = [
    { active: hasWaterN, ex: (corners[0].x + corners[1].x) / 2, ey: (corners[0].y + corners[1].y) / 2 },
    { active: hasWaterE, ex: (corners[1].x + corners[2].x) / 2, ey: (corners[1].y + corners[2].y) / 2 },
    { active: hasWaterS, ex: (corners[2].x + corners[3].x) / 2, ey: (corners[2].y + corners[3].y) / 2 },
    { active: hasWaterW, ex: (corners[3].x + corners[0].x) / 2, ey: (corners[3].y + corners[0].y) / 2 },
  ];

  for (const { active, ex, ey } of edgeMids) {
    if (!active) continue;
    const tx   = wx + (wx - ex);
    const ty   = wy + (wy - ey);
    const grad = ctx.createLinearGradient(ex, ey, tx, ty);
    grad.addColorStop(0,    WET0);
    grad.addColorStop(0.22, WET1);
    grad.addColorStop(0.48, WET2);
    grad.addColorStop(0.72, WET3);
    grad.addColorStop(1.0,  WET4);
    ctx.save();
    diamondPath(ctx, corners);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(wx - TILE_W * 2, wy - TILE_H * 2, TILE_W * 4, TILE_H * 4);
    ctx.restore();
  }

  const cardinalCorners: Array<{ active: boolean; vx: number; vy: number }> = [
    { active: hasWaterN && hasWaterW, vx: corners[0].x, vy: corners[0].y },
    { active: hasWaterN && hasWaterE, vx: corners[1].x, vy: corners[1].y },
    { active: hasWaterS && hasWaterE, vx: corners[2].x, vy: corners[2].y },
    { active: hasWaterS && hasWaterW, vx: corners[3].x, vy: corners[3].y },
  ];

  for (const { active, vx, vy } of cardinalCorners) {
    if (!active) continue;
    const r      = TILE_W * 0.75;
    const radial = ctx.createRadialGradient(vx, vy, 0, vx, vy, r);
    radial.addColorStop(0,    WET0);
    radial.addColorStop(0.35, WET1);
    radial.addColorStop(0.62, WET2);
    radial.addColorStop(0.88, WET3);
    radial.addColorStop(1.0,  WET4);
    ctx.save();
    diamondPath(ctx, corners);
    ctx.clip();
    ctx.fillStyle = radial;
    ctx.fillRect(wx - TILE_W * 2, wy - TILE_H * 2, TILE_W * 4, TILE_H * 4);
    ctx.restore();
  }

  const diagCorners: Array<{ active: boolean; vx: number; vy: number }> = [
    { active: hasWaterNW && !hasWaterN && !hasWaterW, vx: corners[0].x, vy: corners[0].y },
    { active: hasWaterNE && !hasWaterN && !hasWaterE, vx: corners[1].x, vy: corners[1].y },
    { active: hasWaterSE && !hasWaterS && !hasWaterE, vx: corners[2].x, vy: corners[2].y },
    { active: hasWaterSW && !hasWaterS && !hasWaterW, vx: corners[3].x, vy: corners[3].y },
  ];

  for (const { active, vx, vy } of diagCorners) {
    if (!active) continue;
    const r      = TILE_W * 0.52;
    const radial = ctx.createRadialGradient(vx, vy, 0, vx, vy, r);
    radial.addColorStop(0,    'rgba(148,135,88,0.52)');
    radial.addColorStop(0.40, 'rgba(148,135,88,0.25)');
    radial.addColorStop(0.72, 'rgba(148,135,88,0.07)');
    radial.addColorStop(1.0,  WET4);
    ctx.save();
    diamondPath(ctx, corners);
    ctx.clip();
    ctx.fillStyle = radial;
    ctx.fillRect(wx - TILE_W * 2, wy - TILE_H * 2, TILE_W * 4, TILE_H * 4);
    ctx.restore();
  }
};

// --- road rendering ---

const ROAD_FALLBACK = '#b0865a';

const drawRoadTile = (
  ctx: CanvasRenderingContext2D,
  corners: ReturnType<typeof isoCorners>,
  wx: number, wy: number,
  hasN: boolean, hasS: boolean, hasE: boolean, hasW: boolean,
): void => {
  const sprite = getRoadBitmap(hasN, hasS, hasE, hasW);

  if (sprite) {
    ctx.save();
    diamondPath(ctx, corners);
    ctx.clip();
    ctx.drawImage(sprite, wx - TILE_W / 2, wy - TILE_H / 2, TILE_W, TILE_H);
    ctx.restore();
  } else {
    diamondPath(ctx, corners);
    ctx.fillStyle = ROAD_FALLBACK;
    ctx.fill();
  }
};

// --- viewport helpers ---

const getViewport = (camera: CameraState) => {
  const { x: camX, y: camY, zoom, screenWidth, screenHeight } = camera;
  const corners = [
    screenToWorld(0,           0,            camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, 0,            camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(0,           screenHeight, camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, screenHeight, camX, camY, zoom, screenWidth, screenHeight),
  ];
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  const allCols = corners.flatMap(c => [
    Math.floor((c.x / hw + c.y / hh) / 2),
    Math.ceil( (c.x / hw + c.y / hh) / 2),
  ]);
  const allRows = corners.flatMap(c => [
    Math.floor((c.y / hh - c.x / hw) / 2),
    Math.ceil( (c.y / hh - c.x / hw) / 2),
  ]);
  return {
    minCol: Math.max(0,          Math.min(...allCols) - 2),
    maxCol: Math.min(MAP_COLS-1, Math.max(...allCols) + 2),
    minRow: Math.max(0,          Math.min(...allRows) - 2),
    maxRow: Math.min(MAP_ROWS-1, Math.max(...allRows) + 2),
  };
};

const diamondPath = (ctx: CanvasRenderingContext2D, corners: ReturnType<typeof isoCorners>): void => {
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  ctx.lineTo(corners[1].x, corners[1].y);
  ctx.lineTo(corners[2].x, corners[2].y);
  ctx.lineTo(corners[3].x, corners[3].y);
  ctx.closePath();
};

// --- main export ---

export const renderTiles = (
  ctx: CanvasRenderingContext2D,
  map: MapState,
  camera: CameraState,
  timestamp: number,
): void => {
  const { minCol, maxCol, minRow, maxRow } = getViewport(camera);
  const grassPattern = getGrassPattern(ctx);
  const sandPattern  = getSandPattern(ctx);
  const t = timestamp * 0.001; // seconds

  // ── terrain ──
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tile = map.tiles[`${col},${row}`];
      if (!tile) continue;

      const corners = isoCorners(col, row);
      const { x: wx, y: wy } = gridToWorld(col, row);

      if (tile.type === TileType.Water) {
        drawWaterTile(ctx, corners, col, row, t, map.tiles, wx, wy);
      } else if (tile.type === TileType.Grass || tile.type === TileType.Forest) {
        if (grassPattern) {
          ctx.save();
          diamondPath(ctx, corners);
          ctx.clip();
          ctx.fillStyle = grassPattern;
          ctx.fillRect(wx - TILE_W / 2, wy - TILE_H / 2, TILE_W, TILE_H);
          ctx.restore();
        } else {
          diamondPath(ctx, corners);
          ctx.fillStyle = '#5a9e3a';
          ctx.fill();
        }

        // Sand blending into grass — check all 8 neighbours.
        const sN  = isSand(map.tiles[`${col},${row - 1}`]);
        const sE  = isSand(map.tiles[`${col + 1},${row}`]);
        const sS  = isSand(map.tiles[`${col},${row + 1}`]);
        const sW  = isSand(map.tiles[`${col - 1},${row}`]);
        const sNE = isSand(map.tiles[`${col + 1},${row - 1}`]);
        const sSE = isSand(map.tiles[`${col + 1},${row + 1}`]);
        const sSW = isSand(map.tiles[`${col - 1},${row + 1}`]);
        const sNW = isSand(map.tiles[`${col - 1},${row - 1}`]);

        if (sN || sE || sS || sW || sNE || sSE || sSW || sNW) {
          drawEdgeColorBlend(ctx, corners, wx, wy, sN, sE, sS, sW, sNE, sSE, sSW, sNW, '194,178,128', 0.75);
        }
      } else if (tile.type === TileType.Sand) {
        if (sandPattern) {
          ctx.save();
          diamondPath(ctx, corners);
          ctx.clip();
          ctx.fillStyle = sandPattern;
          ctx.fillRect(wx - TILE_W / 2, wy - TILE_H / 2, TILE_W, TILE_H);
          ctx.restore();
        } else {
          diamondPath(ctx, corners);
          ctx.fillStyle = getTileColor(tile);
          ctx.fill();
        }

        // Water blending — check all 8 neighbours.
        const wN  = isWater(map.tiles[`${col},${row - 1}`]);
        const wE  = isWater(map.tiles[`${col + 1},${row}`]);
        const wS  = isWater(map.tiles[`${col},${row + 1}`]);
        const wW  = isWater(map.tiles[`${col - 1},${row}`]);
        const wNE = isWater(map.tiles[`${col + 1},${row - 1}`]);
        const wSE = isWater(map.tiles[`${col + 1},${row + 1}`]);
        const wSW = isWater(map.tiles[`${col - 1},${row + 1}`]);
        const wNW = isWater(map.tiles[`${col - 1},${row - 1}`]);

        if (wN || wE || wS || wW || wNE || wSE || wSW || wNW) {
          drawWetSandBlend(ctx, corners, wx, wy, wN, wE, wS, wW, wNE, wSE, wSW, wNW);
        }

        // Grass/forest blending into sand — check all 8 neighbours.
        const gN  = isGrassLike(map.tiles[`${col},${row - 1}`]);
        const gE  = isGrassLike(map.tiles[`${col + 1},${row}`]);
        const gS  = isGrassLike(map.tiles[`${col},${row + 1}`]);
        const gW  = isGrassLike(map.tiles[`${col - 1},${row}`]);
        const gNE = isGrassLike(map.tiles[`${col + 1},${row - 1}`]);
        const gSE = isGrassLike(map.tiles[`${col + 1},${row + 1}`]);
        const gSW = isGrassLike(map.tiles[`${col - 1},${row + 1}`]);
        const gNW = isGrassLike(map.tiles[`${col - 1},${row - 1}`]);

        if (gN || gE || gS || gW || gNE || gSE || gSW || gNW) {
          drawEdgeColorBlend(ctx, corners, wx, wy, gN, gE, gS, gW, gNE, gSE, gSW, gNW, '82,120,44', 0.72);
        }
      } else {
        diamondPath(ctx, corners);
        ctx.fillStyle = getTileColor(tile);
        ctx.fill();
      }
    }
  }

  // ── placed roads ──
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (!map.tiles[`${col},${row}`]?.hasRoad) continue;
      const corners = isoCorners(col, row);
      const { x: wx, y: wy } = gridToWorld(col, row);
      drawRoadTile(
        ctx, corners, wx, wy,
        !!map.tiles[`${col},${row - 1}`]?.hasRoad,
        !!map.tiles[`${col},${row + 1}`]?.hasRoad,
        !!map.tiles[`${col + 1},${row}`]?.hasRoad,
        !!map.tiles[`${col - 1},${row}`]?.hasRoad,
      );
    }
  }

  // ── road preview ──
  if (!roadPreview.active) return;

  const allPreview = roadPreview.hasAnchor
    ? [{ col: roadPreview.anchorCol, row: roadPreview.anchorRow }, ...roadPreview.path]
    : roadPreview.path;

  if (allPreview.length === 0) return;

  const previewSet = new Set(allPreview.map(p => `${p.col},${p.row}`));

  ctx.save();
  ctx.globalAlpha = 0.68;

  for (const { col, row } of allPreview) {
    const corners = isoCorners(col, row);
    const { x: wx, y: wy } = gridToWorld(col, row);
    const hasN = previewSet.has(`${col},${row - 1}`);
    const hasS = previewSet.has(`${col},${row + 1}`);
    const hasE = previewSet.has(`${col + 1},${row}`);
    const hasW = previewSet.has(`${col - 1},${row}`);
    drawRoadTile(ctx, corners, wx, wy, hasN, hasS, hasE, hasW);
  }

  if (roadPreview.hasAnchor) {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = '#f0c050';
    ctx.lineWidth = 1.5;
    const anchorCorners = isoCorners(roadPreview.anchorCol, roadPreview.anchorRow);
    diamondPath(ctx, anchorCorners);
    ctx.stroke();
  }

  ctx.restore();
};
