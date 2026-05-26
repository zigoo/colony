import { create } from 'zustand';

export interface PerfStats {
  fps: number;
  treesHidden: boolean;
  treeCount: number;
  drawCalls: number;
  triangles: number;
}

// Live perf HUD state, updated from the GL render loop (throttled).
export const useFps = create<PerfStats & { set: (s: PerfStats) => void }>((set) => ({
  fps: 0,
  treesHidden: false,
  treeCount: 0,
  drawCalls: 0,
  triangles: 0,
  set: (s) => set(s),
}));
