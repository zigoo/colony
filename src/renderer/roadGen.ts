import { TILE_W, TILE_H } from '../game/constants';

// Bitmap space: TILE_W=64, TILE_H=32
// Vertices: top=(32,0), right=(64,16), bottom=(32,32), left=(0,16), center=(32,16)

const CX = TILE_W / 2;  // 32
const CY = TILE_H / 2;  // 16

const ROAD_HW    = 5;       // half-width of road strip
const DIRT_COLOR = '#9a7f54';

// Raw edge midpoints (shared boundary with each neighbour)
const N_RAW = { x: 48, y:  8 };
const S_RAW = { x: 16, y: 24 };
const E_RAW = { x: 48, y: 24 };
const W_RAW = { x: 16, y:  8 };

// Extended arm tips for straight segments – extend 30% past raw edge so
// the round cap overlaps the adjacent tile's arm and seals the gap.
const A = 1.30;
const N_EXT = { x: CX + (N_RAW.x - CX) * A, y: CY + (N_RAW.y - CY) * A };
const S_EXT = { x: CX + (S_RAW.x - CX) * A, y: CY + (S_RAW.y - CY) * A };
const E_EXT = { x: CX + (E_RAW.x - CX) * A, y: CY + (E_RAW.y - CY) * A };
const W_EXT = { x: CX + (W_RAW.x - CX) * A, y: CY + (W_RAW.y - CY) * A };

// Slightly extended bezier endpoints (10% past raw edge) – round lineCap
// extends a further ROAD_HW pixels in the incoming/outgoing tangent direction.
const B = 1.10;
const N_BEZ = { x: CX + (N_RAW.x - CX) * B, y: CY + (N_RAW.y - CY) * B };
const S_BEZ = { x: CX + (S_RAW.x - CX) * B, y: CY + (S_RAW.y - CY) * B };
const E_BEZ = { x: CX + (E_RAW.x - CX) * B, y: CY + (E_RAW.y - CY) * B };
const W_BEZ = { x: CX + (W_RAW.x - CX) * B, y: CY + (W_RAW.y - CY) * B };

// Tangent unit vectors at each edge (pointing INTO the tile from that edge).
// N arm direction (centre→N): (16,-8)/17.9 → incoming from N: (-16,8)/17.9
const INV_LEN = 1 / Math.hypot(16, 8); // ≈ 0.0559
const T_N  = { x: -16 * INV_LEN, y:  8 * INV_LEN };  // incoming at N edge
const T_S  = { x:  16 * INV_LEN, y: -8 * INV_LEN };  // incoming at S edge
const T_E  = { x: -16 * INV_LEN, y: -8 * INV_LEN };  // incoming at E edge
const T_W  = { x:  16 * INV_LEN, y:  8 * INV_LEN };  // incoming at W edge

// Cubic bezier ctrl points for each pure-corner type.
// Constructed so that:
//   ctrl1 = P0 + SPEED * T_start  (tangent-matched to incoming arm direction)
//   ctrl2 = P3 - SPEED * T_end    (tangent-matched to outgoing arm direction)
// This makes each corner blend smoothly with adjacent straight segments.
const SPD = 11;

type Bez4 = { p0: {x:number;y:number}; c1: {x:number;y:number}; c2: {x:number;y:number}; p3: {x:number;y:number} };

// key = pattern bits (N=1, S=2, E=4, W=8)
const CORNER_BEZ: Partial<Record<number, Bez4>> = {
  // N+S straight (3) — single stroke avoids double cap at centre
  3: {
    p0: N_BEZ,
    c1: { x: N_BEZ.x + SPD * T_N.x, y: N_BEZ.y + SPD * T_N.y },
    c2: { x: S_BEZ.x + SPD * T_S.x, y: S_BEZ.y + SPD * T_S.y },
    p3: S_BEZ,
  },
  // N+E  (5)
  5: {
    p0: N_BEZ,
    c1: { x: N_BEZ.x + SPD * T_N.x, y: N_BEZ.y + SPD * T_N.y },
    c2: { x: E_BEZ.x + SPD * T_E.x, y: E_BEZ.y + SPD * T_E.y },
    p3: E_BEZ,
  },
  // S+W  (10)
  10: {
    p0: S_BEZ,
    c1: { x: S_BEZ.x + SPD * T_S.x, y: S_BEZ.y + SPD * T_S.y },
    c2: { x: W_BEZ.x + SPD * T_W.x, y: W_BEZ.y + SPD * T_W.y },
    p3: W_BEZ,
  },
  // N+W  (9)
  9: {
    p0: N_BEZ,
    c1: { x: N_BEZ.x + SPD * T_N.x, y: N_BEZ.y + SPD * T_N.y },
    c2: { x: W_BEZ.x + SPD * T_W.x, y: W_BEZ.y + SPD * T_W.y },
    p3: W_BEZ,
  },
  // S+E  (6)
  6: {
    p0: S_BEZ,
    c1: { x: S_BEZ.x + SPD * T_S.x, y: S_BEZ.y + SPD * T_S.y },
    c2: { x: E_BEZ.x + SPD * T_E.x, y: E_BEZ.y + SPD * T_E.y },
    p3: E_BEZ,
  },
  // E+W straight (12) — single stroke avoids double cap at centre
  12: {
    p0: W_BEZ,
    c1: { x: W_BEZ.x + SPD * T_W.x, y: W_BEZ.y + SPD * T_W.y },
    c2: { x: E_BEZ.x + SPD * T_E.x, y: E_BEZ.y + SPD * T_E.y },
    p3: E_BEZ,
  },
};

// ─── seeded PRNG ───

const mulberry = (seed: number) => () => {
  seed |= 0; seed = seed + 0x6d2b79f5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

// ─── helpers ───

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

const drawStone = (
  ctx: OffscreenCanvasRenderingContext2D,
  sx: number, sy: number,
  rand: () => number,
): void => {
  const rw    = 1.0 + rand() * 2.5;
  const rh    = rw  * (0.35 + rand() * 0.45);
  const angle = rand() * Math.PI;
  const lum   = 125 + rand() * 65;
  const warm  = 12  + rand() * 30;
  ctx.fillStyle = `rgb(${clamp(lum + warm)},${clamp(lum + 5)},${clamp(lum - warm * 0.7)})`;
  ctx.beginPath();
  ctx.ellipse(sx, sy, rw, rh, angle, 0, Math.PI * 2);
  ctx.fill();
};

const scatterOnSegment = (
  ctx: OffscreenCanvasRenderingContext2D,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  hw: number,
  rand: () => number,
): void => {
  const dx = p2x - p1x;
  const dy = p2y - p1y;
  const len = Math.hypot(dx, dy) || 1;
  const nx  = -dy / len;
  const ny  =  dx / len;
  const count = Math.ceil(len * 2.0);

  for (let i = 0; i < count; i++) {
    const t      = rand();
    const spread = (rand() - 0.5) * 2 * (hw - 0.5);
    drawStone(ctx, p1x + dx * t + nx * spread, p1y + dy * t + ny * spread, rand);
  }
};

const scatterOnBezier = (
  ctx: OffscreenCanvasRenderingContext2D,
  { p0, c1, c2, p3 }: Bez4,
  hw: number,
  rand: () => number,
  count = 40,
): void => {
  for (let i = 0; i < count; i++) {
    const t  = rand();
    const mt = 1 - t;
    const x  = mt*mt*mt*p0.x + 3*mt*mt*t*c1.x + 3*mt*t*t*c2.x + t*t*t*p3.x;
    const y  = mt*mt*mt*p0.y + 3*mt*mt*t*c1.y + 3*mt*t*t*c2.y + t*t*t*p3.y;
    // tangent
    const tx  = 3*mt*mt*(c1.x-p0.x) + 6*mt*t*(c2.x-c1.x) + 3*t*t*(p3.x-c2.x);
    const ty  = 3*mt*mt*(c1.y-p0.y) + 6*mt*t*(c2.y-c1.y) + 3*t*t*(p3.y-c2.y);
    const len = Math.hypot(tx, ty) || 1;
    const nx  = -ty / len;
    const ny  =  tx / len;
    const spread = (rand() - 0.5) * 2 * (hw - 0.5);
    drawStone(ctx, x + nx * spread, y + ny * spread, rand);
  }
};

// ─── diamond clip ───

const applyDiamondClip = (ctx: OffscreenCanvasRenderingContext2D): void => {
  ctx.beginPath();
  ctx.moveTo(CX, 0);
  ctx.lineTo(TILE_W, CY);
  ctx.lineTo(CX, TILE_H);
  ctx.lineTo(0, CY);
  ctx.closePath();
  ctx.clip();
};

// ─── bake one 16-pattern variant ───

const ARMS = [
  { bit: 1,  ext: N_EXT },  // N
  { bit: 2,  ext: S_EXT },  // S
  { bit: 4,  ext: E_EXT },  // E
  { bit: 8,  ext: W_EXT },  // W
] as const;

const bakeVariant = (pattern: number): ImageBitmap => {
  const canvas = new OffscreenCanvas(TILE_W, TILE_H);
  const ctx    = canvas.getContext('2d')!;

  ctx.save();
  applyDiamondClip(ctx);

  ctx.lineCap    = 'round';
  ctx.lineJoin   = 'round';
  ctx.lineWidth  = ROAD_HW * 2;
  ctx.strokeStyle = DIRT_COLOR;

  const bez = CORNER_BEZ[pattern];
  const rand = mulberry(pattern * 7919 + 31337);

  if (bez) {
    // ── pure corner: cubic bezier from one edge to the other ──
    ctx.beginPath();
    ctx.moveTo(bez.p0.x, bez.p0.y);
    ctx.bezierCurveTo(bez.c1.x, bez.c1.y, bez.c2.x, bez.c2.y, bez.p3.x, bez.p3.y);
    ctx.stroke();

    // straight-through patterns (3, 12) are ~2× longer than corner arcs → double stone count
    const stoneCount = (pattern === 3 || pattern === 12) ? 80 : 40;
    scatterOnBezier(ctx, bez, ROAD_HW - 0.5, rand, stoneCount);
  } else {
    // ── straight / T / cross / dead-end: arms from centre ──
    const activeArms = ARMS.filter(a => pattern & a.bit);

    if (activeArms.length === 0) {
      // isolated hub
      ctx.beginPath();
      ctx.arc(CX, CY, ROAD_HW, 0, Math.PI * 2);
      ctx.fillStyle = DIRT_COLOR;
      ctx.fill();
      scatterOnSegment(ctx, CX - 3, CY - 2, CX + 3, CY + 2, ROAD_HW * 0.7, rand);
    } else {
      for (const { ext } of activeArms) {
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.lineTo(ext.x, ext.y);
        ctx.stroke();
        scatterOnSegment(ctx, CX, CY, ext.x, ext.y, ROAD_HW - 0.5, rand);
      }
    }
  }

  ctx.restore();
  return canvas.transferToImageBitmap();
};

// ─── public API ───

const cache: (ImageBitmap | undefined)[] = new Array(16).fill(undefined);
let ready = false;

export const initRoadGen = (): void => {
  if (ready) return;
  ready = true;
  for (let i = 0; i < 16; i++) cache[i] = bakeVariant(i);
};

// N=bit0  S=bit1  E=bit2  W=bit3
export const getRoadBitmap = (
  hasN: boolean, hasS: boolean, hasE: boolean, hasW: boolean,
): ImageBitmap | undefined =>
  cache[(+hasN) | (+hasS << 1) | (+hasE << 2) | (+hasW << 3)];
