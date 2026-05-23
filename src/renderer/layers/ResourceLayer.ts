import type { MapState, CameraState } from '../../game/types';
import { gridToWorld, screenToWorld } from '../../game/isoMath';
import {
  RESOURCE_COLORS, MAP_COLS, MAP_ROWS, TILE_W, TILE_H,
  MIN_ZOOM_FOR_RESOURCES, RESOURCE_DOT_MIN_SCREEN_RADIUS, RESOURCE_DOT_MAX_SCREEN_RADIUS, RESOURCE_AMOUNT_MAX,
} from '../../game/constants';

export const renderResources = (
  ctx: CanvasRenderingContext2D,
  map: MapState,
  camera: CameraState,
): void => {
  const { x: camX, y: camY, zoom, screenWidth, screenHeight } = camera;

  if (zoom < MIN_ZOOM_FOR_RESOURCES) return;

  const halfWidth = TILE_W / 2;
  const halfHeight = TILE_H / 2;
  const corners = [
    screenToWorld(0,           0,            camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, 0,            camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(0,           screenHeight, camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, screenHeight, camX, camY, zoom, screenWidth, screenHeight),
  ];

  const allCols = corners.flatMap(c => [
    Math.floor((c.x / halfWidth + c.y / halfHeight) / 2),
    Math.ceil( (c.x / halfWidth + c.y / halfHeight) / 2),
  ]);
  const allRows = corners.flatMap(c => [
    Math.floor((c.y / halfHeight - c.x / halfWidth) / 2),
    Math.ceil( (c.y / halfHeight - c.x / halfWidth) / 2),
  ]);

  const minCol = Math.max(0,          Math.min(...allCols) - 2);
  const maxCol = Math.min(MAP_COLS - 1, Math.max(...allCols) + 2);
  const minRow = Math.max(0,          Math.min(...allRows) - 2);
  const maxRow = Math.min(MAP_ROWS - 1, Math.max(...allRows) + 2);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tile = map.tiles[`${col},${row}`];
      if (!tile?.hasResource) continue;

      const { x, y } = gridToWorld(col, row);
      const color = RESOURCE_COLORS[tile.resourceType] ?? '#fff';

      const maxAmount = RESOURCE_AMOUNT_MAX[tile.resourceType] ?? 8;
      const t = Math.max(0, Math.min(1, tile.resourceAmount / maxAmount));
      const screenRadius = RESOURCE_DOT_MIN_SCREEN_RADIUS + t * (RESOURCE_DOT_MAX_SCREEN_RADIUS - RESOURCE_DOT_MIN_SCREEN_RADIUS);
      const radius = screenRadius / zoom;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.5 / zoom;
      ctx.stroke();
    }
  }
};
