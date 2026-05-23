import type { MapState, CameraState } from '../../game/types';
import { gridToWorld, screenToWorld } from '../../game/isoMath';
import {
  RESOURCE_COLORS, MAP_COLS, MAP_ROWS, TILE_W, TILE_H,
  MIN_ZOOM_FOR_RESOURCES, RESOURCE_DOT_BASE_RADIUS, RESOURCE_DOT_MIN_RADIUS,
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
  const screenCorners = [
    screenToWorld(0, 0, camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, screenHeight, camX, camY, zoom, screenWidth, screenHeight),
  ];

  const minCol = Math.max(0, Math.floor((screenCorners[0].x / halfWidth + screenCorners[0].y / halfHeight) / 2) - 2);
  const maxCol = Math.min(MAP_COLS - 1, Math.ceil((screenCorners[1].x / halfWidth + screenCorners[1].y / halfHeight) / 2) + 2);
  const minRow = Math.max(0, Math.floor((screenCorners[0].y / halfHeight - screenCorners[0].x / halfWidth) / 2) - 2);
  const maxRow = Math.min(MAP_ROWS - 1, Math.ceil((screenCorners[1].y / halfHeight - screenCorners[1].x / halfWidth) / 2) + 2);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tile = map.tiles[`${col},${row}`];
      if (!tile?.hasResource) continue;

      const { x, y } = gridToWorld(col, row);
      const color = RESOURCE_COLORS[tile.resourceType] ?? '#fff';
      const radius = Math.max(RESOURCE_DOT_MIN_RADIUS, RESOURCE_DOT_BASE_RADIUS / zoom);

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
