import { create } from 'zustand';
import type { SkyState } from './dayNightCycle';

// Mirrors the day/night cycle for UI display. Updated from the GL render loop
// but only when a displayed value changes (15-minute granularity), so the
// indicator re-renders a few times per in-game hour rather than every frame.
interface WorldClock {
  day: number;
  hour: number;
  minute: number;
  seasonIndex: number;
  isNight: boolean;
  update: (sky: SkyState) => void;
}

const quarter = (m: number) => Math.floor(m / 15) * 15;

export const useWorldClock = create<WorldClock>((set, get) => ({
  day: 1,
  hour: 6,
  minute: 0,
  seasonIndex: 0,
  isNight: false,
  update: (sky) => {
    const c = get();
    const m = quarter(sky.minute);

    if (c.day === sky.day && c.hour === sky.hour && c.minute === m && c.isNight === sky.isNight) return;

    set({ day: sky.day, hour: sky.hour, minute: m, seasonIndex: sky.seasonIndex, isNight: sky.isNight });
  },
}));
