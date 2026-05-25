const COLS = 4;
const ROWS = 4;
const STONE_COUNT = COLS * ROWS;
const SRC_W = 2000 / COLS;
const SRC_H = 2000 / ROWS;

let sheet: HTMLImageElement | null = null;

export const preloadStoneSprites = (): void => {
  const img = new Image();
  img.src = '/assets/sprites/stones.png';
  img.onload = () => { sheet = img; };
};

export const getStoneSheet = (): HTMLImageElement | null => sheet;

export const stoneFrame = (col: number, row: number): { sx: number; sy: number; sw: number; sh: number } => {
  const variant = Math.abs(col * 11 + row * 17) % STONE_COUNT;

  return {
    sx: (variant % COLS) * SRC_W,
    sy: Math.floor(variant / COLS) * SRC_H,
    sw: SRC_W,
    sh: SRC_H,
  };
};
