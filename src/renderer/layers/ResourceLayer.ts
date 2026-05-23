import type { MapState, CameraState } from '../../game/types';
import { gridToWorld, screenToWorld } from '../../game/isoMath';
import { RESOURCE_COLORS, MAP_COLS, MAP_ROWS, TILE_W, TILE_H } from '../../game/constants';

export function renderResources(
  ctx: CanvasRenderingContext2D,
  map: MapState,
  cam: CameraState
): void {
  const { x: camX, y: camY, zoom, screenWidth, screenHeight } = cam;

  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;
  const screenCorners = [
    screenToWorld(0, 0, camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, screenHeight, camX, camY, zoom, screenWidth, screenHeight),
  ];
  const minCol = Math.max(0, Math.floor((screenCorners[0].x / HALF_W + screenCorners[0].y / HALF_H) / 2) - 2);
  const maxCol = Math.min(MAP_COLS - 1, Math.ceil((screenCorners[1].x / HALF_W + screenCorners[1].y / HALF_H) / 2) + 2);
  const minRow = Math.max(0, Math.floor((screenCorners[0].y / HALF_H - screenCorners[0].x / HALF_W) / 2) - 2);
  const maxRow = Math.min(MAP_ROWS - 1, Math.ceil((screenCorners[1].y / HALF_H - screenCorners[1].x / HALF_W) / 2) + 2);

  // Only show resource dots at zoom >= 0.5
  if (zoom < 0.5) return;

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tile = map.tiles[`${col},${row}`];
      if (!tile?.hasResource) continue;

      const { x, y } = gridToWorld(col, row);
      const color = RESOURCE_COLORS[tile.resourceType] ?? '#fff';
      const r = Math.max(2, 4 / zoom);

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.5 / zoom;
      ctx.stroke();
    }
  }
}
