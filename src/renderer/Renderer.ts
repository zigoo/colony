import type { GameState, CameraState, UIState } from '../game/types';
import { renderTiles } from './layers/TileLayer';
import { renderResources } from './layers/ResourceLayer';
import { renderSelection } from './layers/SelectionLayer';

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: CameraState,
  ui: UIState
): void {
  const { screenWidth, screenHeight, x: camX, y: camY, zoom } = cam;

  ctx.clearRect(0, 0, screenWidth, screenHeight);

  // Apply camera transform: all world-space layers draw in world coords
  ctx.save();
  ctx.translate(screenWidth / 2, screenHeight / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -camY);

  renderTiles(ctx, state.map, cam);
  renderResources(ctx, state.map, cam);
  renderSelection(ctx, ui.selectedCol, ui.selectedRow, cam);

  // Future: renderBuildings, renderUnits here

  ctx.restore();
}
