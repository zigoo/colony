import * as THREE from 'three';
import type { MapState } from '../../game/types';
import { TileType } from '../../game/types';
import { COL_OFFSET, ROW_OFFSET } from './terrain';
import { TREE_KEYS, TREE_TARGET_HEIGHT, getTreeTemplate, isTreesLoaded, loadTrees } from './glModels';
import type { TreeKey } from './glModels';

type HeightAt = (col: number, row: number) => number;

// Global cap on tree instances (sampled evenly across forest tiles). With
// per-chunk culling only on-screen chunks are drawn, so this can be generous.
const MAX_TREES = 3000;
const SCALE_JITTER = 0.28; // ± fraction of base scale
// Trees are grouped into square chunks of this many tiles so off-screen chunks
// are frustum-culled as whole InstancedMeshes.
const CHUNK_TILES = 24;

const hash = (col: number, row: number): number =>
  (Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0;

// Forest rendered as per-chunk, per-variant InstancedMeshes. Each chunk mesh has
// its own bounding sphere so three culls it when outside the camera frustum.
// Wind sway lives in the shared tree material's shader.
export class GLForest {
  private readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private built = false;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    void loadTrees();
  }

  get isBuilt(): boolean {
    return this.built;
  }

  build(map: MapState, heightAt: HeightAt): void {
    this.clear();

    if (!isTreesLoaded()) return;

    const forest = Object.values(map.tiles).filter((t) => t.type === TileType.Forest);
    const stride = Math.max(1, Math.ceil(forest.length / MAX_TREES));
    const chosen = forest.filter((_, i) => i % stride === 0);

    // Bucket instance matrices by "chunkX,chunkY,variant".
    const buckets = new Map<string, THREE.Matrix4[]>();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    for (const t of chosen) {
      const h = hash(t.col, t.row);
      const key = TREE_KEYS[h % TREE_KEYS.length];
      const tmpl = getTreeTemplate(key)!;
      const jitter = 1 + (((h >>> 3) % 1000) / 1000 - 0.5) * 2 * SCALE_JITTER;
      const s = (TREE_TARGET_HEIGHT[key] / tmpl.height) * jitter;
      const rot = ((h >>> 5) % 628) / 100; // 0..2π

      pos.set(t.col + 0.5 - COL_OFFSET, heightAt(t.col, t.row), t.row + 0.5 - ROW_OFFSET);
      q.setFromAxisAngle(up, rot);
      scl.set(s, s, s);

      const bucketKey = `${Math.floor(t.col / CHUNK_TILES)},${Math.floor(t.row / CHUNK_TILES)},${key}`;
      const arr = buckets.get(bucketKey) ?? [];
      arr.push(new THREE.Matrix4().compose(pos, q, scl));
      buckets.set(bucketKey, arr);
    }

    for (const [bucketKey, mats] of buckets) {
      const key = bucketKey.slice(bucketKey.lastIndexOf(',') + 1) as TreeKey;
      const tmpl = getTreeTemplate(key)!;
      const inst = new THREE.InstancedMesh(tmpl.geometry, tmpl.material, mats.length);
      inst.castShadow = false; // high-poly; keep them out of the shadow pass
      inst.receiveShadow = true;
      mats.forEach((mat, i) => inst.setMatrixAt(i, mat));
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere(); // so frustum culling works for this chunk
      this.group.add(inst);
      this.meshes.push(inst);
    }

    this.built = true;
  }

  clear(): void {
    for (const mesh of this.meshes) {
      this.group.remove(mesh);
      mesh.dispose(); // per-instance buffers only; shared geo/material kept
    }
    this.meshes = [];
    this.built = false;
  }

  dispose(): void {
    this.clear();
  }
}
