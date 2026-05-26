import type { GameState, CameraState, UIState } from '../game/types';
import { renderTiles } from './layers/TileLayer';
import { renderResources } from './layers/ResourceLayer';
import { renderBuildings, renderPlacementPreview } from './layers/BuildingLayer';
import { renderSelection } from './layers/SelectionLayer';
import { renderUnits } from './layers/UnitLayer';
import { renderDebugResourceDots } from './layers/DebugLayer';

export const render = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: CameraState,
  ui: UIState,
  timestamp: number,
): void => {
  const { screenWidth, screenHeight, x: camX, y: camY, zoom } = camera;

  ctx.clearRect(0, 0, screenWidth, screenHeight);

  ctx.save();
  ctx.translate(screenWidth / 2, screenHeight / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -camY);

  renderTiles(ctx, state.map, camera, timestamp);
  renderResources(ctx, state.map, camera);
  renderBuildings(ctx, state.buildings, timestamp, camera);
  renderSelection(ctx, ui.selectedCol, ui.selectedRow, camera);
  renderUnits(ctx, state.units, ui.selectedUnitIds, timestamp, camera);
  renderPlacementPreview(ctx, ui.selectedBuildingType, timestamp);

  if (ui.debug) renderDebugResourceDots(ctx, state.map);

  ctx.restore();

  if (ui.debug) {
    ctx.save();
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = 'rgba(255,80,80,0.9)';
    ctx.fillText('DEBUG', 8, screenHeight - 8);
    ctx.restore();
  }
};
