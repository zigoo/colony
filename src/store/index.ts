import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateMap } from '../game/mapGenerator';
import type { GameState, CameraState, UIState } from '../game/types';
import { createCamera } from '../renderer/Camera';

interface Store {
  game: GameState;
  camera: CameraState;
  ui: UIState;

  generateNewMap: (seed?: number) => void;
  loadGameState: (state: GameState) => void;
  saveTimestamp: () => void;

  panCamera: (dx: number, dy: number) => void;
  zoomCamera: (factor: number, pivotX: number, pivotY: number) => void;
  setScreenSize: (w: number, h: number) => void;

  selectTile: (col: number | null, row: number | null) => void;
}

const initialMap = generateMap();

const initialGame: GameState = {
  map: initialMap,
  buildings: {},
  units: {},
  resources: { player1: { wood: 0, stone: 0, food: 0, ore: 0 } },
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
        set((s) => ({
          game: { ...s.game, map: generateMap(seed), tick: 0, savedAt: null },
          ui: { selectedCol: null, selectedRow: null },
        }));
      },

      loadGameState: (state) => {
        set({ game: state, ui: { selectedCol: null, selectedRow: null } });
      },

      saveTimestamp: () => {
        set((s) => ({ game: { ...s.game, savedAt: Date.now() } }));
      },

      panCamera: (dx, dy) => {
        set((s) => ({
          camera: { ...s.camera, x: s.camera.x - dx / s.camera.zoom, y: s.camera.y - dy / s.camera.zoom },
        }));
      },

      zoomCamera: (factor, pivotX, pivotY) => {
        set((s) => {
          const cam = s.camera;
          const newZoom = Math.max(cam.minZoom, Math.min(cam.maxZoom, cam.zoom * factor));
          // Zoom toward cursor: shift camera so pivot stays fixed
          const wx = (pivotX - cam.screenWidth / 2) / cam.zoom + cam.x;
          const wy = (pivotY - cam.screenHeight / 2) / cam.zoom + cam.y;
          return {
            camera: {
              ...cam,
              zoom: newZoom,
              x: wx - (pivotX - cam.screenWidth / 2) / newZoom,
              y: wy - (pivotY - cam.screenHeight / 2) / newZoom,
            },
          };
        });
      },

      setScreenSize: (w, h) => {
        set((s) => ({ camera: { ...s.camera, screenWidth: w, screenHeight: h } }));
      },

      selectTile: (col, row) => {
        set({ ui: { selectedCol: col, selectedRow: row } });
      },
    }),
    {
      name: 'settlers-v1',
      partialize: (s) => ({ game: s.game }),
    }
  )
);
