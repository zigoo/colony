import type { CameraState } from '../game/types';
import { CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM } from '../game/constants';

export const createCamera = (screenWidth: number, screenHeight: number): CameraState => ({
  screenWidth,
  screenHeight,
  x: 0,
  y: 0,
  zoom: 1,
  minZoom: CAMERA_MIN_ZOOM,
  maxZoom: CAMERA_MAX_ZOOM,
});

export const clampCamera = (camera: CameraState, worldWidth: number, worldHeight: number): CameraState => {
  const halfWidth = camera.screenWidth / 2 / camera.zoom;
  const halfHeight = camera.screenHeight / 2 / camera.zoom;

  return {
    ...camera,
    x: Math.max(-halfWidth, Math.min(worldWidth + halfWidth, camera.x)),
    y: Math.max(-halfHeight, Math.min(worldHeight + halfHeight, camera.y)),
  };
};
