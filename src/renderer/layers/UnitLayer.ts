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

const UNIT_SPREAD_RADIUS = 18;
const GOLDEN_ANGLE = 0.6180339887 * Math.PI * 2;

const animationForState = (state: UnitState): string =>
  state === UnitStateEnum.Moving ? 'walk' : 'idle';

const drawAxe = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  offsetX: number,
  offsetY: number,
  timestamp: number,
  zoom: number,
): void => {
  // Pivot at unit's hands — slightly right of center, above tile center
  const pivotX = wx + offsetX + 7;
  const pivotY = wy + offsetY - 8;

  // Pendulum: slow raise, fast chop impact
  const t = (timestamp % 500) / 500;
  const raw = Math.sin(t * Math.PI * 2);
  // Bias toward impact position to give more "snap" on the downswing
  const swing = raw - 0.18 * Math.sin(t * Math.PI * 4);
  const angle = 0.15 + swing * 0.72;

  const handleLen = 16;

  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(angle);

  // Handle
  ctx.fillStyle = '#5C3317';
  ctx.fillRect(-1.5, 0, 3, handleLen);

  // Axe head — parallelogram shape offset to one side of the handle tip
  ctx.beginPath();
  ctx.moveTo(-5, handleLen - 2);
  ctx.lineTo(-5, handleLen + 5);
  ctx.lineTo( 6, handleLen + 7);
  ctx.lineTo( 6, handleLen - 4);
  ctx.closePath();
  ctx.fillStyle = '#ADADAD';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.8 / zoom;
  ctx.stroke();

  // Blade edge highlight — the sharp bit
  ctx.beginPath();
  ctx.moveTo(6, handleLen - 4);
  ctx.lineTo(6, handleLen + 7);
  ctx.strokeStyle = '#E4E4E4';
  ctx.lineWidth = 1.4 / zoom;
  ctx.stroke();

  // Grip wrap at pivot end
  ctx.fillStyle = '#3B1F09';
  ctx.fillRect(-1.5, 0, 3, 3.5);

  ctx.restore();
};

const buildTileGroups = (units: Unit[]): Map<string, Unit[]> => {
  const groups = new Map<string, Unit[]>();
  for (const unit of units) {
    const col = unit.prevCol + (unit.col - unit.prevCol) * unit.moveProgress;
    const row = unit.prevRow + (unit.row - unit.prevRow) * unit.moveProgress;
    const key = `${Math.round(col)},${Math.round(row)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(unit);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.id.localeCompare(b.id));
  }
  return groups;
};

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
  selectedUnitIds: string[],
  timestamp: number,
  camera: CameraState,
): void => {
  const sorted = Object.values(units).sort((a, b) => (a.row + a.col) - (b.row + b.col));
  const tileGroups = buildTileGroups(sorted);

  // Draw destination markers first (below sprites)
  for (const unit of sorted) {
    if (unit.state === UnitStateEnum.Moving && unit.targetCol !== null && unit.targetRow !== null) {
      drawDestinationDiamond(ctx, unit.targetCol, unit.targetRow, camera.zoom, timestamp);
    }
  }

  for (const unit of sorted) {
    const { col, row } = interpolatedPosition(unit);
    const { x: wx, y: wy } = gridToWorld(col, row);

    const tileKey = `${Math.round(col)},${Math.round(row)}`;
    const group = tileGroups.get(tileKey) ?? [];
    const slotIndex = group.findIndex(u => u.id === unit.id);
    const offsetX = group.length <= 1 ? 0 : Math.cos(slotIndex * GOLDEN_ANGLE) * UNIT_SPREAD_RADIUS;
    const offsetY = group.length <= 1 ? 0 : Math.sin(slotIndex * GOLDEN_ANGLE) * UNIT_SPREAD_RADIUS;

    if (selectedUnitIds.includes(unit.id)) {
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
      wx + offsetX - frameWidth / 2, wy + offsetY - frameHeight + SPRITE_Y_OFFSET, frameWidth, frameHeight,
    );

    if (unit.state === UnitStateEnum.Collecting) {
      drawAxe(ctx, wx, wy, offsetX, offsetY, timestamp, camera.zoom);
    }
  }
};
