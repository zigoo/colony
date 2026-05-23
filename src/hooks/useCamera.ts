import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { screenToGrid } from '../game/isoMath';

export function useCamera(canvas: React.RefObject<HTMLCanvasElement | null>): void {
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
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved.current = true;
      panCamera(dx, dy);
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = (e: MouseEvent) => {
      if (isDragging.current && !hasMoved.current) {
        // It's a click, not a drag → select tile
        const { camera } = useStore.getState();
        const { col, row } = screenToGrid(
          e.clientX, e.clientY,
          camera.x, camera.y, camera.zoom,
          camera.screenWidth, camera.screenHeight
        );
        if (col >= 0 && row >= 0 && col < 120 && row < 120) {
          selectTile(col, row);
        } else {
          selectTile(null, null);
        }
      }
      isDragging.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
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
}
