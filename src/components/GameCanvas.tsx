import { useRef, useEffect } from 'react';
import { useGameLoop } from '../hooks/useGameLoop';
import { useCamera } from '../hooks/useCamera';
import { useStore } from '../store';
import { preloadSprites } from '../renderer/sprites/SpriteLoader';
import { preloadBuildingSprites } from '../renderer/sprites/BuildingLoader';
import { preloadGrassTextures } from '../renderer/grassLoader';
import { initRoadGen } from '../renderer/roadGen';
import { preloadTreeSprites } from '../renderer/treeLoader';
import { preloadStoneSprites } from '../renderer/stoneLoader';

export const GameCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setScreenSize = useStore((s) => s.setScreenSize);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.width = window.innerWidth;
    el.height = window.innerHeight;
    setScreenSize(window.innerWidth, window.innerHeight);
    preloadGrassTextures();
    preloadSprites();
    preloadBuildingSprites();
    preloadTreeSprites();
    preloadStoneSprites();
    initRoadGen();
  }, [setScreenSize]);

  useGameLoop(canvasRef);
  useCamera(canvasRef);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', cursor: 'grab', userSelect: 'none' }}
    />
  );
};
