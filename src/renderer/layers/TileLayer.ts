import type { MapState, CameraState } from '../../game/types';
import { isoCorners, screenToWorld } from '../../game/isoMath';
import { TILE_COLORS, TILE_W, TILE_H, MAP_COLS, MAP_ROWS } from '../../game/constants';

export function renderTiles(
  ctx: CanvasRenderingContext2D,
  map: MapState,
  cam: CameraState
): void {
  const { x: camX, y: camY, zoom, screenWidth, screenHeight } = cam;

  // Compute visible tile range from screen corners
  const corners = [
    screenToWorld(0, 0, camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, 0, camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(0, screenHeight, camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, screenHeight, camX, camY, zoom, screenWidth, screenHeight),
  ];

  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;

  // World to grid approximate bounds (with padding)
  const allCols = corners.flatMap(c => [
    Math.floor((c.x / HALF_W + c.y / HALF_H) / 2),
    Math.ceil((c.x / HALF_W + c.y / HALF_H) / 2),
  ]);
  const allRows = corners.flatMap(c => [
    Math.floor((c.y / HALF_H - c.x / HALF_W) / 2),
    Math.ceil((c.y / HALF_H - c.x / HALF_W) / 2),
  ]);

  const minCol = Math.max(0, Math.min(...allCols) - 2);
  const maxCol = Math.min(MAP_COLS - 1, Math.max(...allCols) + 2);
  const minRow = Math.max(0, Math.min(...allRows) - 2);
  const maxRow = Math.min(MAP_ROWS - 1, Math.max(...allRows) + 2);

  // Painter's algorithm: render back-to-front
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tile = map.tiles[`${col},${row}`];
      if (!tile) continue;

      const tileCorners = isoCorners(col, row);
      const color = TILE_COLORS[tile.type] ?? '#888';

      ctx.beginPath();
      ctx.moveTo(tileCorners[0].x, tileCorners[0].y);
      for (let i = 1; i < tileCorners.length; i++) {
        ctx.lineTo(tileCorners[i].x, tileCorners[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Subtle grid line
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 0.5 / zoom;
      ctx.stroke();
    }
  }
}
