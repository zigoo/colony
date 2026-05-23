import { Direction } from './types';

// Maps movement delta in isometric grid to facing direction.
// In this iso layout: col+1 → screen right-down (SE), row+1 → screen left-down (SW).
const DELTA_TO_DIRECTION: Array<{ dcol: number; drow: number; direction: Direction }> = [
  { dcol:  1, drow:  1, direction: Direction.South },
  { dcol: -1, drow: -1, direction: Direction.North },
  { dcol:  1, drow: -1, direction: Direction.East },
  { dcol: -1, drow:  1, direction: Direction.West },
  { dcol:  1, drow:  0, direction: Direction.SouthEast },
  { dcol: -1, drow:  0, direction: Direction.NorthWest },
  { dcol:  0, drow:  1, direction: Direction.SouthWest },
  { dcol:  0, drow: -1, direction: Direction.NorthEast },
];

export const getDirection = (dcol: number, drow: number): Direction => {
  const match = DELTA_TO_DIRECTION.find(entry => entry.dcol === dcol && entry.drow === drow);

  return match?.direction ?? Direction.South;
};
