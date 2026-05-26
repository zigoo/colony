import { create } from 'zustand';

// Tracks the unit name under the cursor (for the hover tooltip) and the cursor
// position. Updated from the GL canvas on mouse move.
interface UnitHover {
  name: string | null;
  x: number;
  y: number;
  set: (name: string | null, x: number, y: number) => void;
}

export const useUnitHover = create<UnitHover>((set, get) => ({
  name: null,
  x: 0,
  y: 0,
  set: (name, x, y) => {
    // Avoid re-render spam while hovering empty ground.
    if (name === null && get().name === null) return;

    set({ name, x, y });
  },
}));
