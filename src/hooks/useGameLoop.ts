import { useEffect, useRef } from 'react';
import { render } from '../renderer/Renderer';
import { useStore } from '../store';

const TICK_MS = 100;

export const useGameLoop = (canvas: React.RefObject<HTMLCanvasElement | null>): void => {
  const storeRef = useRef(useStore.getState);

  useEffect(() => {
    storeRef.current = useStore.getState;
  });

  useEffect(() => {
    let rafId = 0;
    let lastTime = 0;
    let accumulator = 0;

    const loop = (timestamp: number) => {
      const el = canvas.current;
      if (!el) { rafId = requestAnimationFrame(loop); return; }

      const ctx = el.getContext('2d');
      if (!ctx) { rafId = requestAnimationFrame(loop); return; }

      const delta = Math.min(timestamp - lastTime, 200);
      lastTime = timestamp;
      accumulator += delta;

      while (accumulator >= TICK_MS) {
        storeRef.current().tickUnits();
        accumulator -= TICK_MS;
      }

      const { game, camera, ui } = storeRef.current();
      render(ctx, game, camera, ui, timestamp);

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafId);
  }, [canvas]);
};
