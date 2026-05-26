import * as THREE from 'three';
import type { MapState } from '../../game/types';
import { TileType } from '../../game/types';
import { COL_OFFSET, ROW_OFFSET } from './terrain';
import { TREE_KEYS, TREE_TARGET_HEIGHT, getTreeTemplate } from './glModels';
import type { TreeKey } from './glModels';

type HeightAt = (col: number, row: number) => number;

// Fraction of forest tiles that get a tree (deterministic per tile). Streaming
// keeps only chunks near the camera built, so density (not a global cap) is the
// right control here.
const FOREST_DENSITY = 0.14;
// Per-tree height multiplier range (biased upward so some trees are tall and
// fill the canopy — keeps the forest looking dense with fewer trees).
const SCALE_MIN = 0.8;
const SCALE_MAX = 1.6;

const hash = (col: number, row: number): number =>
  (Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0;

// Builds the forest InstancedMeshes (one per variant) for a single terrain
// chunk's tile range. Wind sway lives in the shared tree material's shader.
export const buildForestChunk = (
  map: MapState,
  heightAt: HeightAt,
  c0: number, c1: number, r0: number, r1: number,
): THREE.InstancedMesh[] => {
  const matrices: Record<TreeKey, THREE.Matrix4[]> = { pine: [], oak: [], bush: [] };
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  for (let row = r0; row < r1; row++) {
    for (let col = c0; col < c1; col++) {
      const t = map.tiles[`${col},${row}`];

      if (!t || t.type !== TileType.Forest) continue;

      const h = hash(col, row);

      if (((h >>> 13) % 1000) / 1000 >= FOREST_DENSITY) continue;

      const key = TREE_KEYS[h % TREE_KEYS.length];
      const tmpl = getTreeTemplate(key)!;
      const jitter = SCALE_MIN + (((h >>> 3) % 1000) / 1000) * (SCALE_MAX - SCALE_MIN);
      const s = (TREE_TARGET_HEIGHT[key] / tmpl.height) * jitter;
      const rot = ((h >>> 5) % 628) / 100; // 0..2π

      pos.set(col + 0.5 - COL_OFFSET, heightAt(col, row), row + 0.5 - ROW_OFFSET);
      q.setFromAxisAngle(up, rot);
      scl.set(s, s, s);
      matrices[key].push(new THREE.Matrix4().compose(pos, q, scl));
    }
  }

  const meshes: THREE.InstancedMesh[] = [];
  for (const key of TREE_KEYS) {
    const mats = matrices[key];

    if (mats.length === 0) continue;

    const tmpl = getTreeTemplate(key)!;
    const inst = new THREE.InstancedMesh(tmpl.geometry, tmpl.material, mats.length);
    inst.castShadow = false; // high-poly; keep out of the shadow pass
    inst.receiveShadow = true;
    // three's instanced frustum culling uses the (origin-centered) model sphere,
    // not the instance positions, so it's unreliable here — GLWorld culls these
    // per chunk manually instead.
    inst.frustumCulled = false;
    mats.forEach((mat, i) => inst.setMatrixAt(i, mat));
    inst.instanceMatrix.needsUpdate = true;
    meshes.push(inst);
  }

  return meshes;
};
