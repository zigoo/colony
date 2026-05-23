import type { MapState, CameraState } from '../../game/types';
import { isoCorners, screenToWorld } from '../../game/isoMath';
import { TILE_COLORS, TILE_W, TILE_H, MAP_COLS, MAP_ROWS } from '../../game/constants';

export const renderTiles = (
  ctx: CanvasRenderingContext2D,
  map: MapState,
  camera: CameraState,
): void => {
  const { x: camX, y: camY, zoom, screenWidth, screenHeight } = camera;

  const corners = [
    screenToWorld(0, 0, camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, 0, camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(0, screenHeight, camX, camY, zoom, screenWidth, screenHeight),
    screenToWorld(screenWidth, screenHeight, camX, camY, zoom, screenWidth, screenHeight),
  ];

  const halfWidth = TILE_W / 2;
  const halfHeight = TILE_H / 2;

  const allCols = corners.flatMap(c => [
    Math.floor((c.x / halfWidth + c.y / halfHeight) / 2),
    Math.ceil((c.x / halfWidth + c.y / halfHeight) / 2),
  ]);
  const allRows = corners.flatMap(c => [
    Math.floor((c.y / halfHeight - c.x / halfWidth) / 2),
    Math.ceil((c.y / halfHeight - c.x / halfWidth) / 2),
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

      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 0.5 / zoom;
      ctx.stroke();
    }
  }
};
