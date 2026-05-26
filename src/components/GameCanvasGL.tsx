import { useRef, useEffect } from 'react';
import { useStore } from '../store';
import { GLScene } from '../renderer/gl/GLScene';
import { useGLParams } from '../renderer/gl/glParams';
import { computeSky } from '../renderer/gl/dayNightCycle';
import { useWorldClock } from '../renderer/gl/worldClock';

const TICK_MS = 100;

export const GameCanvasGL = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const glScene = new GLScene(el);
    glScene.applyParams(useGLParams.getState());
    glScene.resize(window.innerWidth, window.innerHeight);
    glScene.setMap(useStore.getState().game.map);

    // Rebuild terrain only when the map object identity changes (new map gen).
    let lastMap = useStore.getState().game.map;
    const unsubMap = useStore.subscribe((s) => {
      if (s.game.map !== lastMap) {
        lastMap = s.game.map;
        glScene.setMap(lastMap);
      }
    });

    // Live tuning: re-apply camera/light/terrain params whenever a slider moves.
    const unsubParams = useGLParams.subscribe((p) => glScene.applyParams(p));

    // ── interaction (pan + zoom; tile picking lands in Phase 2) ──
    let dragging = false;
    let last = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      glScene.pan(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { dragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      glScene.zoom(e.deltaY < 0 ? 1.1 : 0.9);
    };
    const onResize = () => {
      glScene.resize(window.innerWidth, window.innerHeight);
    };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);

    // ── game loop (fixed-timestep tick + render) ──
    let rafId = 0;
    let lastTime = 0;
    let accumulator = 0;

    const loop = (timestamp: number) => {
      const delta = Math.min(timestamp - lastTime, 200);
      lastTime = timestamp;
      accumulator += delta;

      while (accumulator >= TICK_MS) {
        useStore.getState().tick();
        accumulator -= TICK_MS;
      }

      const p = useGLParams.getState();
      const sky = computeSky(useStore.getState().game.tick, p.dayLengthSec, p.sunIntensity, p.hemiIntensity);
      glScene.applySky(sky);
      useWorldClock.getState().update(sky);

      glScene.render();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      unsubMap();
      unsubParams();
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      glScene.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', cursor: 'grab', userSelect: 'none' }}
    />
  );
};
