import { create } from 'zustand';

// Live frames-per-second, updated from the GL render loop (throttled) for the
// on-screen indicator.
export const useFps = create<{ fps: number; set: (fps: number) => void }>((set) => ({
  fps: 0,
  set: (fps) => set({ fps }),
}));
