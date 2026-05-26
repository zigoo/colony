import * as THREE from 'three';

// Derives sun direction, light intensities and sky/ground colors from the game
// tick, producing an automatic day/night + season cycle. Time advances with the
// simulation (tick rate is 10/s), so it pauses when the game pauses.

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];
const DAYS_PER_SEASON = 3;
const TICKS_PER_SEC = 10;

// Real sunrise/sunset and noon sun altitude for Wrocław, Poland (lat ~51.1°N),
// sampled at the solstices/equinoxes. Daylight lengths: summer 16h33m, winter
// 7h58m, equinox 12h00m; noon altitude = 90 - lat (± Earth's 23.44° tilt).
// Times are symmetric around solar noon (12:00).
const SEASON_SUN: Record<number, { sunrise: number; sunset: number; maxElev: number }> = {
  0: { sunrise: 6.0,  sunset: 18.0,  maxElev: 38.9 }, // spring (equinox)
  1: { sunrise: 3.73, sunset: 20.27, maxElev: 62.3 }, // summer (solstice)
  2: { sunrise: 6.0,  sunset: 18.0,  maxElev: 38.9 }, // autumn (equinox)
  3: { sunrise: 8.02, sunset: 15.98, maxElev: 15.5 }, // winter (solstice)
};

// Hemisphere "ground bounce" tint per season.
const SEASON_GROUND: Record<number, THREE.Color> = {
  0: new THREE.Color('#4f5e38'), // spring
  1: new THREE.Color('#56602e'), // summer
  2: new THREE.Color('#6d4a26'), // autumn
  3: new THREE.Color('#6f7e86'), // winter
};

const NIGHT_SKY = new THREE.Color('#0b1733');
const DAY_SKY = new THREE.Color('#9ec8e8');
const DUSK_SKY = new THREE.Color('#e8916a');
const SUN_LOW = new THREE.Color('#ff9a52');
const SUN_HIGH = new THREE.Color('#fff3d6');
const MOON = new THREE.Color('#aac4ff');

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));

  return t * t * (3 - 2 * t);
};

export interface SkyState {
  day: number;        // 1-based
  hour: number;       // 0..23
  minute: number;     // 0..59
  seasonIndex: number;
  season: Season;
  isNight: boolean;
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiIntensity: number;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
}

export const computeSky = (
  tick: number,
  dayLengthSec: number,
  sunStrength: number,
  ambientStrength: number,
): SkyState => {
  const seconds = tick / TICKS_PER_SEC;
  const dayFloat = seconds / Math.max(1, dayLengthSec);
  const dayIndex = Math.floor(dayFloat);
  const f = dayFloat - dayIndex; // 0..1 through the day (0 = midnight)

  const hourFloat = f * 24;
  const hour = Math.floor(hourFloat);
  const minute = Math.floor((hourFloat - hour) * 60);

  const seasonIndex = Math.floor(dayIndex / DAYS_PER_SEASON) % 4;

  // Normalized sun altitude in [-1, 1] (positive = daytime), driven by the
  // season's actual sunrise/sunset so day length shifts realistically.
  const { sunrise, sunset, maxElev } = SEASON_SUN[seasonIndex];
  const dayLen = sunset - sunrise;
  let altNorm: number;

  if (hourFloat >= sunrise && hourFloat <= sunset) {
    altNorm = Math.sin(Math.PI * ((hourFloat - sunrise) / dayLen)); // 0 → 1 → 0
  } else {
    const nightLen = 24 - dayLen;
    const t = hourFloat > sunset ? hourFloat - sunset : hourFloat + (24 - sunset);
    altNorm = -Math.sin(Math.PI * (t / nightLen)); // 0 → -1 → 0
  }

  // Daylight factor: full during the day, smooth dawn/dusk around sun crossing.
  const daylight = smoothstep(-0.18, 0.12, altNorm);
  const isNight = altNorm <= 0;
  const moon = clamp01(-altNorm);

  const sunAzimuthDeg = (f * 360 + 90) % 360;
  const sunColor = new THREE.Color();
  const skyColor = new THREE.Color();
  let sunElevationDeg: number;
  let sunIntensity: number;

  if (daylight > 0.05) {
    // Daytime sun. Floor the elevation at dusk so it grazes (long shadows).
    sunElevationDeg = Math.max(4, altNorm * maxElev);
    sunIntensity = sunStrength * daylight;
    sunColor.copy(SUN_LOW).lerp(SUN_HIGH, clamp01(altNorm / 0.5));
  } else {
    sunElevationDeg = 12 + moon * 30; // low moon
    sunIntensity = 0.25 + 0.35 * moon; // soft moonlight, still casts shadows
    sunColor.copy(MOON);
  }

  // Ambient never drops to black: night floor 0.5×, daytime up to 1.0×.
  const hemiIntensity = ambientStrength * (0.5 + 0.5 * daylight);

  // Sky: night → day by altitude, pushed toward dusk orange near the horizon.
  const dayBlend = clamp01((altNorm + 0.05) / 0.35);
  const twilight = clamp01(1 - Math.abs(altNorm) / 0.16);
  skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, dayBlend).lerp(DUSK_SKY, twilight * 0.6);

  return {
    day: dayIndex + 1,
    hour,
    minute,
    seasonIndex,
    season: SEASONS[seasonIndex],
    isNight,
    sunElevationDeg,
    sunAzimuthDeg,
    sunColor,
    sunIntensity,
    hemiIntensity,
    skyColor,
    groundColor: SEASON_GROUND[seasonIndex],
  };
};
