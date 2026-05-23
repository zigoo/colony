import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { screenToGrid } from '../game/isoMath';
import { MAP_COLS, MAP_ROWS, CAMERA_ZOOM_STEP_IN, CAMERA_ZOOM_STEP_OUT, MIN_DRAG_DISTANCE } from '../game/constants';

export const useCamera = (canvas: React.RefObject<HTMLCanvasElement | null>): void => {
  const { panCamera, zoomCamera, setScreenSize, selectTile } = useStore();
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

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
        const { camera } = useStore.getState();
        const { col, row } = screenToGrid(
          e.clientX, e.clientY,
          camera.x, camera.y, camera.zoom,
          camera.screenWidth, camera.screenHeight,
        );
        if (col >= 0 && row >= 0 && col < MAP_COLS && row < MAP_ROWS) {
          selectTile(col, row);
        } else {
          selectTile(null, null);
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
  }, [canvas, panCamera, zoomCamera, setScreenSize, selectTile]);
};
