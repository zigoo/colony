import { create } from 'zustand';

// Cinematic "drone" fly-over: a steep bird's-eye elevation that slowly drifts
// across the map until cancelled. The elevation side-effect + drift live in the
// GL canvas; this store is just the on/off flag shared with the HUD indicator.
interface DroneStore {
  active: boolean;
  set: (active: boolean) => void;
  toggle: () => void;
}

export const useDrone = create<DroneStore>((set) => ({
  active: false,
  set: (active) => set({ active }),
  toggle: () => set((s) => ({ active: !s.active })),
}));
