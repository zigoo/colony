import * as THREE from 'three';
import type { MapState } from '../../game/types';
import { MAP_COLS, MAP_ROWS } from '../../game/constants';
import {
  createTerrainMaterial, buildTerrainChunk, createHeightSampler,
  TERRAIN_CHUNK_TILES, COL_OFFSET, ROW_OFFSET,
} from './terrain';
import { buildForestChunk } from './GLForest';
import { loadTrees, isTreesLoaded, treeCam, treeFade } from './glModels';
import { defaultGLParams } from './glParams';
import type { GLParams } from './glParams';

// Streams terrain + forest chunks around the camera so map size no longer
// dictates memory/draw cost — only the visible window (plus a margin) is built.
const BUILD_BUDGET = 8;        // terrain chunks built per frame (caps pan hitches)
const TREE_BUILD_BUDGET = 2;   // tree chunks built per frame
const MIN_RADIUS_CHUNKS = 2;
const MAX_RADIUS_CHUNKS = 12;  // ceiling on how far out we keep terrain chunks
const UNLOAD_MARGIN = 1;       // extra chunks kept beyond the load radius
// Trees only render within this chunk radius of the camera (a draw distance).
// The low camera tilt sees far, so without this the whole horizon fills with
// trees; beyond it the forest reads from the green terrain instead.
const TREE_RADIUS_CHUNKS = 3;
const CHUNK_HALF_DIAG = TERRAIN_CHUNK_TILES * 0.71; // ~half-diagonal of a chunk (XZ)
// Periphery fade range (world units): trees shrink to nothing between these
// distances from the camera. fadeEnd is lowered adaptively when FPS is low.
const FADE_START = 95;
const FADE_END = 135;

// Terrain LOD: chunks farther from the camera use a coarser grid (the detail
// isn't visible from afar). Distant chunks cost far fewer vertices.
const lodSubFor = (chunkDist: number, baseSub: number): number => {
  if (chunkDist <= 1) return baseSub;
  if (chunkDist <= 4) return Math.max(2, Math.round(baseSub / 2));

  return 2;
};

interface Chunk {
  terrain: THREE.Mesh;
  trees: THREE.InstancedMesh[];
  treesBuilt: boolean;
  cx: number;
  cz: number;
  lodSub: number; // current terrain subdivision (LOD), rebuilt when it changes
  box: THREE.Box3; // world-space AABB for manual frustum culling (tighter than a sphere)
}

const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`;

// Vertical span of a chunk's bounding box (covers water dip up to tall peaks +
// trees) — X/Z come from the exact tile footprint.
const CHUNK_Y_MIN = -3;
const CHUNK_Y_MAX = 30;

export class GLWorld {
  private readonly group = new THREE.Group();
  private readonly chunks = new Map<string, Chunk>();
  private material: THREE.Material = createTerrainMaterial();
  private map: MapState | null = null;
  private params: GLParams = defaultGLParams;
  private heightAt: (gx: number, gz: number) => number = () => 0;
  private treesVisible = true;
  private readonly maxCx = Math.ceil(MAP_COLS / TERRAIN_CHUNK_TILES) - 1;
  private readonly maxCz = Math.ceil(MAP_ROWS / TERRAIN_CHUNK_TILES) - 1;
  private readonly frustum = new THREE.Frustum();
  private readonly frustumMatrix = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    void loadTrees();
  }

  // (Re)sets the source map/params and drops all built chunks; they re-stream on
  // the next update() around the camera.
  reset(map: MapState, params: GLParams): void {
    this.clear();
    this.material.dispose();
    this.map = map;
    this.params = params;
    this.heightAt = createHeightSampler(map, params);
    this.material = createTerrainMaterial();
  }

  // viewRadius = world-space radius the camera currently sees (GLScene computes
  // it from zoom + tilt). target is the camera look-at on the ground plane.
  update(targetX: number, targetZ: number, viewRadius: number, camera: THREE.Camera): void {
    if (!this.map) return;

    this.frustum.setFromProjectionMatrix(
      this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );

    // Feed the tree fade shader (camera center + fade range).
    treeCam.value.set(targetX, targetZ);
    treeFade.value.set(FADE_START, FADE_END);

    const ccx = Math.floor((targetX + COL_OFFSET) / TERRAIN_CHUNK_TILES);
    const ccz = Math.floor((targetZ + ROW_OFFSET) / TERRAIN_CHUNK_TILES);
    const radius = THREE.MathUtils.clamp(
      Math.ceil(viewRadius / TERRAIN_CHUNK_TILES) + 1,
      MIN_RADIUS_CHUNKS,
      MAX_RADIUS_CHUNKS,
    );

    const base = this.params.terrainSub;

    // Build missing in-range chunks, nearest first, up to the per-frame budget.
    const missing: Array<{ cx: number; cz: number; d: number }> = [];
    for (let cz = ccz - radius; cz <= ccz + radius; cz++) {
      for (let cx = ccx - radius; cx <= ccx + radius; cx++) {
        if (cx < 0 || cz < 0 || cx > this.maxCx || cz > this.maxCz) continue;
        if (this.chunks.has(chunkKey(cx, cz))) continue;
        missing.push({ cx, cz, d: Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) });
      }
    }
    missing.sort((a, b) => a.d - b.d);
    let builds = 0;
    for (const m of missing) {
      if (builds >= BUILD_BUDGET) break;
      this.buildChunk(m.cx, m.cz, lodSubFor(m.d, base));
      builds++;
    }

    // Re-LOD existing chunks whose distance band changed (budgeted, with the builds).
    for (const chunk of this.chunks.values()) {
      if (builds >= BUILD_BUDGET) break;
      const dist = Math.max(Math.abs(chunk.cx - ccx), Math.abs(chunk.cz - ccz));
      const desired = lodSubFor(dist, base);

      if (chunk.lodSub !== desired) {
        this.rebuildChunkTerrain(chunk, desired);
        builds++;
      }
    }

    // Trees: only within the (small) tree draw radius. Build near chunks that
    // lack trees (budgeted), drop trees from chunks that left the radius, and
    // manually frustum-cull the rest (instanced auto-culling is unreliable).
    let treeBuilds = 0;
    for (const chunk of this.chunks.values()) {
      const near = Math.max(Math.abs(chunk.cx - ccx), Math.abs(chunk.cz - ccz)) <= TREE_RADIUS_CHUNKS;

      if (near && !chunk.treesBuilt && isTreesLoaded() && treeBuilds < TREE_BUILD_BUDGET) {
        this.buildChunkTrees(chunk);
        treeBuilds++;
      } else if (!near && chunk.treesBuilt) {
        this.disposeChunkTrees(chunk);
      }

      const inView = this.frustum.intersectsBox(chunk.box);
      chunk.terrain.visible = inView;

      if (chunk.treesBuilt) {
        // Skip drawing chunks whose nearest point is past the fade end (their
        // trees would be shrunk to nothing anyway) — saves the vertex cost.
        const cxw = (chunk.cx + 0.5) * TERRAIN_CHUNK_TILES - COL_OFFSET;
        const czw = (chunk.cz + 0.5) * TERRAIN_CHUNK_TILES - ROW_OFFSET;
        const nearDist = Math.hypot(cxw - targetX, czw - targetZ) - CHUNK_HALF_DIAG;
        const treesShown = inView && this.treesVisible && nearDist <= FADE_END;
        for (const t of chunk.trees) t.visible = treesShown;
      }
    }

    // Unload chunks beyond the radius (+ hysteresis margin).
    const unloadR = radius + UNLOAD_MARGIN;
    for (const [key, chunk] of this.chunks) {
      if (Math.max(Math.abs(chunk.cx - ccx), Math.abs(chunk.cz - ccz)) > unloadR) {
        this.disposeChunk(chunk);
        this.chunks.delete(key);
      }
    }
  }

  // Tree instances actually being drawn (visible after frustum cull) — for the
  // perf HUD, so the number reflects render cost rather than what's loaded.
  get treeCount(): number {
    let n = 0;
    for (const chunk of this.chunks.values()) {
      for (const t of chunk.trees) {
        if (t.visible) n += t.count;
      }
    }

    return n;
  }

  // Sets the zoom-LOD flag; per-tree visibility (flag AND frustum) is applied in update().
  setForestVisible(visible: boolean): void {
    this.treesVisible = visible;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }

  private buildChunk(cx: number, cz: number, sub: number): void {
    const c0 = cx * TERRAIN_CHUNK_TILES;
    const r0 = cz * TERRAIN_CHUNK_TILES;
    const c1 = Math.min(MAP_COLS, c0 + TERRAIN_CHUNK_TILES);
    const r1 = Math.min(MAP_ROWS, r0 + TERRAIN_CHUNK_TILES);

    const terrain = buildTerrainChunk(this.map!, this.params, this.material, c0, c1, r0, r1, sub);
    terrain.frustumCulled = false; // culled manually per chunk (tight AABB) below
    this.group.add(terrain);

    const box = new THREE.Box3(
      new THREE.Vector3(c0 - COL_OFFSET, CHUNK_Y_MIN, r0 - ROW_OFFSET),
      new THREE.Vector3(c1 - COL_OFFSET, CHUNK_Y_MAX, r1 - ROW_OFFSET),
    );
    this.chunks.set(chunkKey(cx, cz), { terrain, trees: [], treesBuilt: false, cx, cz, lodSub: sub, box });
  }

  // Rebuilds just the terrain mesh of an existing chunk at a new LOD subdivision.
  private rebuildChunkTerrain(chunk: Chunk, sub: number): void {
    const c0 = chunk.cx * TERRAIN_CHUNK_TILES;
    const r0 = chunk.cz * TERRAIN_CHUNK_TILES;
    const c1 = Math.min(MAP_COLS, c0 + TERRAIN_CHUNK_TILES);
    const r1 = Math.min(MAP_ROWS, r0 + TERRAIN_CHUNK_TILES);

    this.group.remove(chunk.terrain);
    chunk.terrain.geometry.dispose();

    const terrain = buildTerrainChunk(this.map!, this.params, this.material, c0, c1, r0, r1, sub);
    terrain.frustumCulled = false;
    this.group.add(terrain);
    chunk.terrain = terrain;
    chunk.lodSub = sub;
  }

  private buildChunkTrees(chunk: Chunk): void {
    const c0 = chunk.cx * TERRAIN_CHUNK_TILES;
    const r0 = chunk.cz * TERRAIN_CHUNK_TILES;
    const c1 = Math.min(MAP_COLS, c0 + TERRAIN_CHUNK_TILES);
    const r1 = Math.min(MAP_ROWS, r0 + TERRAIN_CHUNK_TILES);

    chunk.trees = buildForestChunk(this.map!, this.heightAt, c0, c1, r0, r1);
    for (const t of chunk.trees) {
      t.visible = this.treesVisible;
      this.group.add(t);
    }
    chunk.treesBuilt = true;
  }

  private disposeChunkTrees(chunk: Chunk): void {
    for (const t of chunk.trees) {
      this.group.remove(t);
      t.dispose();
    }
    chunk.trees = [];
    chunk.treesBuilt = false;
  }

  private disposeChunk(chunk: Chunk): void {
    this.group.remove(chunk.terrain);
    chunk.terrain.geometry.dispose();
    this.disposeChunkTrees(chunk);
  }

  private clear(): void {
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
  }
}
