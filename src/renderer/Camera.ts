import type { CameraState } from '../game/types';

export function createCamera(screenWidth: number, screenHeight: number): CameraState {
  return {
    x: 0,
    y: 0,
    zoom: 1,
    minZoom: 0.25,
    maxZoom: 3,
    screenWidth,
    screenHeight,
  };
}

export function clampCamera(cam: CameraState, mapWorldW: number, mapWorldH: number): CameraState {
  const halfW = cam.screenWidth / 2 / cam.zoom;
  const halfH = cam.screenHeight / 2 / cam.zoom;
  return {
    ...cam,
    x: Math.max(-halfW, Math.min(mapWorldW + halfW, cam.x)),
    y: Math.max(-halfH, Math.min(mapWorldH + halfH, cam.y)),
  };
}
