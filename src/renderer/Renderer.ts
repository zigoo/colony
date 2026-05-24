import type { GameState, CameraState, UIState } from '../game/types';
import { renderTiles } from './layers/TileLayer';
import { renderResources } from './layers/ResourceLayer';
import { renderBuildings, renderPlacementPreview } from './layers/BuildingLayer';
import { renderSelection } from './layers/SelectionLayer';
import { renderUnits } from './layers/UnitLayer';

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

  renderTiles(ctx, state.map, camera);
  renderResources(ctx, state.map, camera);
  renderBuildings(ctx, state.buildings, timestamp, camera);
  renderSelection(ctx, ui.selectedCol, ui.selectedRow, camera);
  renderUnits(ctx, state.units, ui.selectedUnitIds, timestamp, camera);
  renderPlacementPreview(ctx, ui.selectedBuildingType, timestamp);

  ctx.restore();
};
