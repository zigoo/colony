const COLS = 3;
const ROWS = 2;
const TREE_COUNT = COLS * ROWS;
const SRC_W = 2000 / COLS;
const SRC_H = 1368 / ROWS;

let sheet: HTMLImageElement | null = null;

export const preloadTreeSprites = (): void => {
  const img = new Image();
  img.src = '/assets/sprites/trees.png';
  img.onload = () => { sheet = img; };
};

export const getTreeSheet = (): HTMLImageElement | null => sheet;

export const treeFrame = (col: number, row: number): { sx: number; sy: number; sw: number; sh: number } => {
  const variant = Math.abs(col * 7 + row * 13) % TREE_COUNT;
  return {
    sx: (variant % COLS) * SRC_W,
    sy: Math.floor(variant / COLS) * SRC_H,
    sw: SRC_W,
    sh: SRC_H,
  };
};
