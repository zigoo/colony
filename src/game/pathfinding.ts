import type { MapState } from './types';
import { TILE_MOVE_COSTS } from './constants';
import { isWithinBounds } from './isoMath';

interface Node {
  col: number;
  row: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

const key = (col: number, row: number) => `${col},${row}`;

const octile = (col1: number, row1: number, col2: number, row2: number): number => {
  const dc = Math.abs(col1 - col2);
  const dr = Math.abs(row1 - row2);
  return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
};

// Min-heap keyed by node.f for O(log n) open-list operations
class MinHeap {
  private heap: Node[] = [];

  push(node: Node): void {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): Node | undefined {
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  get size(): number { return this.heap.length; }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].f <= this.heap[i].f) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.heap[l].f < this.heap[smallest].f) smallest = l;
      if (r < n && this.heap[r].f < this.heap[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

const NEIGHBORS = [
  { dcol:  0, drow: -1 }, { dcol:  0, drow:  1 },
  { dcol: -1, drow:  0 }, { dcol:  1, drow:  0 },
  { dcol: -1, drow: -1 }, { dcol:  1, drow: -1 },
  { dcol: -1, drow:  1 }, { dcol:  1, drow:  1 },
];

const tileCost = (map: MapState, col: number, row: number): number => {
  const tile = map.tiles[key(col, row)];
  return tile ? TILE_MOVE_COSTS[tile.type] : Infinity;
};

export const findPath = (
  map: MapState,
  startCol: number, startRow: number,
  endCol: number, endRow: number,
): Array<{ col: number; row: number }> => {
  if (startCol === endCol && startRow === endRow) return [];
  if (tileCost(map, endCol, endRow) === Infinity) return [];

  const open = new MinHeap();
  const gScore = new Map<string, number>();
  const nodeMap = new Map<string, Node>();
  const closed = new Set<string>();

  const h0 = octile(startCol, startRow, endCol, endRow);
  const startNode: Node = { col: startCol, row: startRow, g: 0, h: h0, f: h0, parent: null };
  open.push(startNode);
  gScore.set(key(startCol, startRow), 0);
  nodeMap.set(key(startCol, startRow), startNode);

  while (open.size > 0) {
    const current = open.pop()!;
    const currentKey = key(current.col, current.row);

    if (current.col === endCol && current.row === endRow) {
      const path: Array<{ col: number; row: number }> = [];
      let node: Node | null = current;
      while (node && (node.col !== startCol || node.row !== startRow)) {
        path.unshift({ col: node.col, row: node.row });
        node = node.parent;
      }
      return path;
    }

    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    for (const { dcol, drow } of NEIGHBORS) {
      const nc = current.col + dcol;
      const nr = current.row + drow;

      if (!isWithinBounds(nc, nr)) continue;
      if (closed.has(key(nc, nr))) continue;

      const diagonal = dcol !== 0 && drow !== 0;

      // Prevent corner cutting: both cardinal neighbours of a diagonal step must be passable
      if (diagonal) {
        if (tileCost(map, current.col + dcol, current.row) === Infinity) continue;
        if (tileCost(map, current.col, current.row + drow) === Infinity) continue;
      }

      const cost = tileCost(map, nc, nr);
      if (cost === Infinity) continue;

      const stepCost = diagonal ? cost * Math.SQRT2 : cost;
      const g = current.g + stepCost;

      const neighborKey = key(nc, nr);
      if (gScore.has(neighborKey) && gScore.get(neighborKey)! <= g) continue;

      const h = octile(nc, nr, endCol, endRow);
      const node: Node = { col: nc, row: nr, g, h, f: g + h, parent: current };
      gScore.set(neighborKey, g);
      nodeMap.set(neighborKey, node);
      open.push(node);
    }
  }

  return [];
};
