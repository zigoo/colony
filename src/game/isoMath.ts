import { TILE_W, TILE_H } from './constants';

export function gridToWorld(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  };
}

export function worldToGrid(wx: number, wy: number): { col: number; row: number } {
  const col = Math.floor((wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2);
  const row = Math.floor((wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2);
  return { col, row };
}

export function screenToWorld(
  sx: number, sy: number,
  camX: number, camY: number,
  zoom: number,
  screenW: number, screenH: number
): { x: number; y: number } {
  return {
    x: (sx - screenW / 2) / zoom + camX,
    y: (sy - screenH / 2) / zoom + camY,
  };
}

export function worldToScreen(
  wx: number, wy: number,
  camX: number, camY: number,
  zoom: number,
  screenW: number, screenH: number
): { x: number; y: number } {
  return {
    x: (wx - camX) * zoom + screenW / 2,
    y: (wy - camY) * zoom + screenH / 2,
  };
}

export function screenToGrid(
  sx: number, sy: number,
  camX: number, camY: number,
  zoom: number,
  screenW: number, screenH: number
): { col: number; row: number } {
  const world = screenToWorld(sx, sy, camX, camY, zoom, screenW, screenH);
  return worldToGrid(world.x, world.y);
}

// Returns 4 corner points of an isometric diamond in world space
export function isoCorners(col: number, row: number): Array<{ x: number; y: number }> {
  const cx = (col - row) * (TILE_W / 2);
  const cy = (col + row) * (TILE_H / 2);
  return [
    { x: cx,              y: cy - TILE_H / 2 }, // top
    { x: cx + TILE_W / 2, y: cy              }, // right
    { x: cx,              y: cy + TILE_H / 2 }, // bottom
    { x: cx - TILE_W / 2, y: cy              }, // left
  ];
}
