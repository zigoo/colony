import type { GameState, CameraState, UIState } from '../game/types';
import { renderTiles } from './layers/TileLayer';
import { renderResources } from './layers/ResourceLayer';
import { renderSelection } from './layers/SelectionLayer';

export const render = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: CameraState,
  ui: UIState,
): void => {
  const { screenWidth, screenHeight, x: camX, y: camY, zoom } = camera;

  ctx.clearRect(0, 0, screenWidth, screenHeight);

  // Apply camera transform: all world-space layers draw in world coords
  ctx.save();
  ctx.translate(screenWidth / 2, screenHeight / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -camY);

  renderTiles(ctx, state.map, camera);
  renderResources(ctx, state.map, camera);
  renderSelection(ctx, ui.selectedCol, ui.selectedRow, camera);

  // Future: renderBuildings, renderUnits here

  ctx.restore();
};
