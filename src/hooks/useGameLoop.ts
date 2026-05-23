import { useEffect, useRef } from 'react';
import { render } from '../renderer/Renderer';
import { useStore } from '../store';

export function useGameLoop(canvas: React.RefObject<HTMLCanvasElement | null>): void {
  const storeRef = useRef(useStore.getState);

  useEffect(() => {
    storeRef.current = useStore.getState;
  });

  useEffect(() => {
    let rafId = 0;

    const loop = () => {
      const el = canvas.current;
      if (!el) { rafId = requestAnimationFrame(loop); return; }

      const ctx = el.getContext('2d');
      if (!ctx) { rafId = requestAnimationFrame(loop); return; }

      const { game, camera, ui } = storeRef.current();
      render(ctx, game, camera, ui);

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [canvas]);
}
