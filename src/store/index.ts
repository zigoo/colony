import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateMap } from '../game/mapGenerator';
import { ResourceType } from '../game/types';
import type { GameState, CameraState, UIState } from '../game/types';
import { CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM } from '../game/constants';
import { createCamera } from '../renderer/Camera';

export const PLAYER_ID = 'player1';

interface Store {
  game: GameState;
  camera: CameraState;
  ui: UIState;

  generateNewMap: (seed?: number) => void;
  loadGameState: (state: GameState) => void;
  saveTimestamp: () => void;

  panCamera: (dx: number, dy: number) => void;
  zoomCamera: (factor: number, pivotX: number, pivotY: number) => void;
  setScreenSize: (width: number, height: number) => void;

  selectTile: (col: number | null, row: number | null) => void;
}

const initialGame: GameState = {
  map: generateMap(),
  buildings: {},
  units: {},
  resources: {
    [PLAYER_ID]: {
      [ResourceType.Wood]:  0,
      [ResourceType.Stone]: 0,
      [ResourceType.Food]:  0,
      [ResourceType.Ore]:   0,
      [ResourceType.None]:  0,
    },
  },
  tick: 0,
  tickRate: 10,
  savedAt: null,
};

export const useStore = create<Store>()(
  persist(
    (set) => ({
      game: initialGame,
      camera: createCamera(window.innerWidth, window.innerHeight),
      ui: { selectedCol: null, selectedRow: null },

      generateNewMap: (seed) => {
        set((state) => ({
          game: { ...state.game, map: generateMap(seed), tick: 0, savedAt: null },
          ui: { selectedCol: null, selectedRow: null },
        }));
      },

      loadGameState: (game) => {
        set({ game, ui: { selectedCol: null, selectedRow: null } });
      },

      saveTimestamp: () => {
        set((state) => ({ game: { ...state.game, savedAt: Date.now() } }));
      },

      panCamera: (dx, dy) => {
        set((state) => ({
          camera: {
            ...state.camera,
            x: state.camera.x - dx / state.camera.zoom,
            y: state.camera.y - dy / state.camera.zoom,
          },
        }));
      },

      zoomCamera: (factor, pivotX, pivotY) => {
        set((state) => {
          const camera = state.camera;
          const newZoom = Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, camera.zoom * factor));
          const wx = (pivotX - camera.screenWidth / 2) / camera.zoom + camera.x;
          const wy = (pivotY - camera.screenHeight / 2) / camera.zoom + camera.y;

          return {
            camera: {
              ...camera,
              zoom: newZoom,
              x: wx - (pivotX - camera.screenWidth / 2) / newZoom,
              y: wy - (pivotY - camera.screenHeight / 2) / newZoom,
            },
          };
        });
      },

      setScreenSize: (width, height) => {
        set((state) => ({
          camera: { ...state.camera, screenWidth: width, screenHeight: height },
        }));
      },

      selectTile: (col, row) => {
        set({ ui: { selectedCol: col, selectedRow: row } });
      },
    }),
    {
      name: 'settlers-v1',
      partialize: (state) => ({ game: state.game }),
    },
  ),
);
