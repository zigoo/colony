import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { screenToGrid, screenToWorld, gridToWorld, isWithinBounds } from '../game/isoMath';
import { CAMERA_ZOOM_STEP_IN, CAMERA_ZOOM_STEP_OUT, MIN_DRAG_DISTANCE, ANIMATION_FRAME_SIZE, SPRITE_Y_OFFSET } from '../game/constants';
import type { Unit } from '../game/types';

const SPRITE_HIT = ANIMATION_FRAME_SIZE['idle'];

// Returns the frontmost unit whose sprite contains the given world-space point.
// Sprites render with feet at (wx, wy) and body extending upward by frameHeight.
// Iterates front-to-back (highest row+col first) so overlapping units pick correctly.
const findUnitAtWorld = (
  worldX: number,
  worldY: number,
  units: Record<string, Unit>,
): string | undefined => {
  const sorted = Object.values(units).sort((a, b) => (b.row + b.col) - (a.row + a.col));

  for (const unit of sorted) {
    const col = unit.prevCol + (unit.col - unit.prevCol) * unit.moveProgress;
    const row = unit.prevRow + (unit.row - unit.prevRow) * unit.moveProgress;
    const { x: wx, y: wy } = gridToWorld(col, row);

    if (
      worldX >= wx - SPRITE_HIT.width / 2 &&
      worldX <= wx + SPRITE_HIT.width / 2 &&
      worldY >= wy - SPRITE_HIT.height + SPRITE_Y_OFFSET &&
      worldY <= wy + SPRITE_Y_OFFSET
    ) {
      return unit.id;
    }
  }

  return undefined;
};

export const useCamera = (canvas: React.RefObject<HTMLCanvasElement | null>): void => {
  const { panCamera, zoomCamera, setScreenSize, selectTile, selectUnit, moveUnitTo, rebuildOccupants } = useStore();
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  // Rebuild occupants after localStorage rehydration (units are persisted, occupants are not)
  useEffect(() => {
    rebuildOccupants();
  }, [rebuildOccupants]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      hasMoved.current = false;
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      if (Math.abs(dx) > MIN_DRAG_DISTANCE || Math.abs(dy) > MIN_DRAG_DISTANCE) hasMoved.current = true;
      panCamera(dx, dy);
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = (e: MouseEvent) => {
      if (isDragging.current && !hasMoved.current) {
        const { camera, game, ui } = useStore.getState();

        const worldPos = screenToWorld(
          e.clientX, e.clientY,
          camera.x, camera.y, camera.zoom,
          camera.screenWidth, camera.screenHeight,
        );

        const clickedUnitId = findUnitAtWorld(worldPos.x, worldPos.y, game.units);

        if (clickedUnitId) {
          selectUnit(clickedUnitId === ui.selectedUnitId ? null : clickedUnitId);
        } else {
          const { col, row } = screenToGrid(
            e.clientX, e.clientY,
            camera.x, camera.y, camera.zoom,
            camera.screenWidth, camera.screenHeight,
          );

          if (isWithinBounds(col, row)) {
            if (ui.selectedUnitId) {
              moveUnitTo(ui.selectedUnitId, col, row);
              if (!e.metaKey) selectUnit(null);
            } else {
              selectTile(col, row);
            }
          } else {
            selectTile(null, null);
            selectUnit(null);
          }
        }
      }

      isDragging.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? CAMERA_ZOOM_STEP_IN : CAMERA_ZOOM_STEP_OUT;
      zoomCamera(factor, e.clientX, e.clientY);
    };

    const onResize = () => {
      setScreenSize(window.innerWidth, window.innerHeight);
      el.width = window.innerWidth;
      el.height = window.innerHeight;
    };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);

    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  }, [canvas, panCamera, zoomCamera, setScreenSize, selectTile, selectUnit, moveUnitTo]);
};
