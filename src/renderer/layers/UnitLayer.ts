import type { Unit, CameraState, UnitState } from '../../game/types';
import { UnitState as UnitStateEnum } from '../../game/types';
import { gridToWorld, isoCorners } from '../../game/isoMath';
import {
  DIRECTION_ROW,
  ANIMATION_FPS, ANIMATION_FRAMES, ANIMATION_FRAME_SIZE,
  UNIT_SELECTION_COLOR, UNIT_SELECTION_FILL,
  UNIT_DESTINATION_COLOR, UNIT_DESTINATION_FILL, UNIT_DESTINATION_DASH,
  SPRITE_Y_OFFSET,
} from '../../game/constants';
import { loadSprite } from '../sprites/SpriteLoader';

const animationForState = (state: UnitState): string =>
  state === UnitStateEnum.Moving ? 'walk' : 'idle';

const interpolatedPosition = (unit: Unit): { col: number; row: number } => ({
  col: unit.prevCol + (unit.col - unit.prevCol) * unit.moveProgress,
  row: unit.prevRow + (unit.row - unit.prevRow) * unit.moveProgress,
});

const drawDestinationDiamond = (
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  zoom: number,
  timestamp: number,
): void => {
  const corners = isoCorners(col, row);
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();

  const pulse = 0.5 + 0.5 * Math.sin(timestamp / 350);

  ctx.fillStyle = UNIT_DESTINATION_FILL;
  ctx.globalAlpha = 0.6 + 0.4 * pulse;
  ctx.fill();

  const dashSize = UNIT_DESTINATION_DASH / zoom;
  ctx.setLineDash([dashSize, dashSize]);
  ctx.lineDashOffset = -(timestamp / 80) % (dashSize * 2);
  ctx.strokeStyle = UNIT_DESTINATION_COLOR;
  ctx.lineWidth = 2 / zoom;
  ctx.globalAlpha = 0.7 + 0.3 * pulse;
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
};

const drawSelectionDiamond = (
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  zoom: number,
): void => {
  const corners = isoCorners(Math.round(col), Math.round(row));
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fillStyle = UNIT_SELECTION_FILL;
  ctx.fill();
  ctx.strokeStyle = UNIT_SELECTION_COLOR;
  ctx.lineWidth = 2 / zoom;
  ctx.stroke();
};

export const renderUnits = (
  ctx: CanvasRenderingContext2D,
  units: Record<string, Unit>,
  selectedUnitId: string | null,
  timestamp: number,
  camera: CameraState,
): void => {
  const sorted = Object.values(units).sort((a, b) => (a.row + a.col) - (b.row + b.col));

  // Draw destination markers first (below sprites)
  for (const unit of sorted) {
    if (unit.state === UnitStateEnum.Moving && unit.targetCol !== null && unit.targetRow !== null) {
      drawDestinationDiamond(ctx, unit.targetCol, unit.targetRow, camera.zoom, timestamp);
    }
  }

  for (const unit of sorted) {
    const { col, row } = interpolatedPosition(unit);
    const { x: wx, y: wy } = gridToWorld(col, row);

    if (unit.id === selectedUnitId) {
      drawSelectionDiamond(ctx, col, row, camera.zoom);
    }

    const animName = animationForState(unit.state);
    const fps = ANIMATION_FPS[animName];
    const totalFrames = ANIMATION_FRAMES[animName];
    const { width: frameWidth, height: frameHeight } = ANIMATION_FRAME_SIZE[animName];

    const frameIndex = Math.floor(timestamp / (1000 / fps)) % totalFrames;
    const directionRow = DIRECTION_ROW[unit.facing];

    const img = loadSprite(animName);
    if (!img.complete) continue;

    const srcX = frameIndex * frameWidth;
    const srcY = directionRow * frameHeight;

    ctx.drawImage(
      img,
      srcX, srcY, frameWidth, frameHeight,
      wx - frameWidth / 2, wy - frameHeight + SPRITE_Y_OFFSET, frameWidth, frameHeight,
    );
  }
};
