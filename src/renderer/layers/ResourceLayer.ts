import type { MapState, CameraState } from '../../game/types';
import { TileType, ResourceType } from '../../game/types';
import { gridToWorld, screenToWorld } from '../../game/isoMath';
import {
  MAP_COLS, MAP_ROWS, TILE_W, TILE_H,
  MIN_ZOOM_FOR_RESOURCES,
} from '../../game/constants';
import { getTreeSheet, treeFrame } from '../treeLoader';

const TREE_DEST_W = 64;
const TREE_DEST_H = 80;
const FOOD_EMOJI   = '🌾';
const FOOD_FONT_PX = 25; // 10% smaller than 28

const getViewport = (camera: CameraState) => {
  const { x: camX, y: camY, zoom, screenWidth, screenHeight } = camera;
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  const corners = [
    screenToWorld(0,           0,            camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, 0,            camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(0,           screenHeight, camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, screenHeight, camX, camY, zoom, screenWidth, screenHeight),
  ];
  const allCols = corners.flatMap(c => [
    Math.floor((c.x / hw + c.y / hh) / 2),
    Math.ceil( (c.x / hw + c.y / hh) / 2),
  ]);
  const allRows = corners.flatMap(c => [
    Math.floor((c.y / hh - c.x / hw) / 2),
    Math.ceil( (c.y / hh - c.x / hw) / 2),
  ]);
  return {
    minCol: Math.max(0,           Math.min(...allCols) - 2),
    maxCol: Math.min(MAP_COLS - 1, Math.max(...allCols) + 2),
    minRow: Math.max(0,           Math.min(...allRows) - 2),
    maxRow: Math.min(MAP_ROWS - 1, Math.max(...allRows) + 2),
  };
};

export const foodHover = { active: false, worldX: 0, worldY: 0 };

type FoodCluster = { x: number; y: number; amount: number; tiles: Array<{ x: number; y: number }> };

// One food icon per connected Forest cluster that contains food tiles.
// Cached by map reference so BFS only runs when the map object changes.
let _cachedMap: MapState | null = null;
let _cachedFoodCentroids: FoodCluster[] = [];

const getForestFoodCentroids = (map: MapState): FoodCluster[] => {
  if (map === _cachedMap) return _cachedFoodCentroids;
  _cachedMap = map;

  const visited = new Set<string>();
  const result: FoodCluster[] = [];

  for (const tile of Object.values(map.tiles)) {
    if (tile.type !== TileType.Forest) continue;
    const k = `${tile.col},${tile.row}`;
    if (visited.has(k)) continue;

    const queue = [tile];
    visited.add(k);
    let foodSumX = 0, foodSumY = 0, foodCount = 0, foodAmount = 0;
    const foodTiles: Array<{ x: number; y: number }> = [];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.resourceType === ResourceType.Food) {
        const { x, y } = gridToWorld(cur.col, cur.row);
        foodSumX += x; foodSumY += y; foodCount++;
        foodAmount += cur.resourceAmount;
        foodTiles.push({ x, y });
      }
      for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]] as const) {
        const nk = `${cur.col + dc},${cur.row + dr}`;
        if (visited.has(nk)) continue;
        const nt = map.tiles[nk];
        if (nt?.type !== TileType.Forest) continue;
        visited.add(nk);
        queue.push(nt);
      }
    }

    if (foodCount > 0) result.push({ x: foodSumX / foodCount, y: foodSumY / foodCount, amount: foodAmount, tiles: foodTiles });
  }

  _cachedFoodCentroids = result;
  return result;
};

export const renderResources = (
  ctx: CanvasRenderingContext2D,
  map: MapState,
  camera: CameraState,
): void => {
  const { zoom } = camera;
  if (zoom < MIN_ZOOM_FOR_RESOURCES) return;

  const { minCol, maxCol, minRow, maxRow } = getViewport(camera);
  const treeSheet = getTreeSheet();

  // ── trees on ~2/3 of Forest tiles ──
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tile = map.tiles[`${col},${row}`];
      if (tile?.type !== TileType.Forest) continue;
      if (!tile.hasResource) continue;
      if (!treeSheet) continue;
      if ((col * 3 + row * 7) % 3 === 0) continue;

      const { x: wx, y: wy } = gridToWorld(col, row);
      const { sx, sy, sw, sh } = treeFrame(col, row);
      ctx.drawImage(
        treeSheet,
        sx, sy, sw, sh,
        wx - TREE_DEST_W / 2, wy + TILE_H / 2 - TREE_DEST_H,
        TREE_DEST_W, TREE_DEST_H,
      );
    }
  }

  // ── food: one icon per Forest cluster that contains food tiles ──
  const foodCentroids = getForestFoodCentroids(map);
  if (foodCentroids.length > 0) {
    const fontSize = FOOD_FONT_PX / zoom;
    const r = fontSize * 0.9;
    ctx.save();
    const emojiFontSize = fontSize * 0.72;
    const amountFontSize = fontSize * 0.4;
    ctx.textAlign = 'center';

    const dotR = 4 / zoom;

    for (const { x, y, amount, tiles } of foodCentroids) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20, 20, 20, 0.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();

      ctx.font = `${emojiFontSize}px serif`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'white';
      ctx.fillText(FOOD_EMOJI, x, y - r * 0.18);

      ctx.font = `bold ${amountFontSize}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(String(amount), x, y + r * 0.52);

      if (foodHover.active) {
        const dx = foodHover.worldX - x;
        const dy = foodHover.worldY - y;
        if (dx * dx + dy * dy <= r * r) {
          for (const { x: tx, y: ty } of tiles) {
            ctx.beginPath();
            ctx.arc(tx, ty, dotR, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 210, 60, 0.9)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1 / zoom;
            ctx.stroke();
          }
        }
      }
    }

    ctx.restore();
  }
};
