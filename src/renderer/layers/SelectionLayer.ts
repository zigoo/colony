import type { CameraState } from '../../game/types';
import { isoCorners } from '../../game/isoMath';

export const renderSelection = (
  ctx: CanvasRenderingContext2D,
  selectedCol: number | null,
  selectedRow: number | null,
  camera: CameraState,
): void => {
  if (selectedCol === null || selectedRow === null) return;

  const corners = isoCorners(selectedCol, selectedRow);

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();

  ctx.strokeStyle = '#ffdd00';
  ctx.lineWidth = 2 / camera.zoom;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 221, 0, 0.15)';
  ctx.fill();
};
