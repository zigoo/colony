import { create } from 'zustand';

// Live-tunable rendering parameters for the WebGL view. NOT persisted — these
// are dev knobs surfaced through the slider panel (GLDevPanel) so the look can
// be dialed in at runtime. Camera/light changes apply instantly; terrain-shape
// changes (sub/height/mountain/noise) trigger a mesh rebuild.
//
// Sun direction is no longer a manual knob — it's driven by the day/night +
// season cycle (see dayNightCycle.ts). sunIntensity/hemiIntensity here are the
// daytime-peak strengths the cycle scales down toward night.
export interface GLParams {
  // camera
  camElevationDeg: number;
  camAzimuthDeg: number;
  viewSize: number; // world units visible vertically at zoom 1 (bigger = more zoomed out)
  // lighting (daytime-peak strengths; cycle scales by time of day)
  sunIntensity: number;
  hemiIntensity: number;
  // time
  dayLengthSec: number; // real seconds for one in-game day
  // terrain shape (rebuild on change)
  terrainSub: number;
  heightScale: number;
  mountainScale: number;
  noiseAmp: number;
}

// Defaults captured from the user's tuning session (src/img/def.png).
export const defaultGLParams: GLParams = {
  camElevationDeg: 17,
  camAzimuthDeg: 31,
  viewSize: 50,
  sunIntensity: 3.0,
  hemiIntensity: 1.0,
  dayLengthSec: 800,
  terrainSub: 5,
  heightScale: 2.7,
  mountainScale: 4.5,
  noiseAmp: 0.6,
};

interface GLParamsStore extends GLParams {
  set: <K extends keyof GLParams>(key: K, value: GLParams[K]) => void;
  reset: () => void;
}

export const useGLParams = create<GLParamsStore>((set) => ({
  ...defaultGLParams,
  set: (key, value) => set({ [key]: value } as Pick<GLParams, typeof key>),
  reset: () => set({ ...defaultGLParams }),
}));

// Subset of params that require rebuilding the terrain geometry.
export const terrainSignature = (p: GLParams): string =>
  `${p.terrainSub}|${p.heightScale}|${p.mountainScale}|${p.noiseAmp}`;
