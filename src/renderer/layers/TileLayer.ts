import type { MapState, CameraState, Tile } from '../../game/types';
import { TileType } from '../../game/types';
import { isoCorners, screenToWorld, gridToWorld } from '../../game/isoMath';
import { TILE_COLORS, TILE_W, TILE_H, MAP_COLS, MAP_ROWS } from '../../game/constants';
import { getGrassImage } from '../grassLoader';
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
): void => {
  const { minCol, maxCol, minRow, maxRow } = getViewport(camera);
  const grassPattern = getGrassPattern(ctx);

  // ── terrain ──
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tile = map.tiles[`${col},${row}`];
      if (!tile) continue;

      const corners = isoCorners(col, row);
      const { x: wx, y: wy } = gridToWorld(col, row);

      if (tile.type === TileType.Grass || tile.type === TileType.Forest) {
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
