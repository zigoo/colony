import * as THREE from 'three';
import type { Building, Unit } from '../../game/types';
import { BuildingType, UnitState } from '../../game/types';
import { BUILDING_FOOTPRINT } from '../../game/buildingConfig';
import { COL_OFFSET, ROW_OFFSET } from './terrain';
import {
  loadSettler, isSettlerLoaded, createSettlerInstance,
  settlerScaleFor, settlerFootOffset, SETTLER_CLIP, SETTLER_RUN_CLIP,
} from './glModels';

// Renders buildings and units in the WebGL scene. Units use the loaded GLB
// model (animated) once available, falling back to a placeholder until then.
// Buildings are still placeholder boxes pending their own models.

type HeightAt = (col: number, row: number) => number;

const DEFAULT_BUILDING_HEIGHT = 1.5;

const BUILDING_PLACEHOLDER: Partial<Record<BuildingType, { color: string; height: number }>> = {
  [BuildingType.Storehouse]: { color: '#b07d3a', height: 2.6 },
  [BuildingType.LumberCamp]: { color: '#8a6b3f', height: 1.8 },
  [BuildingType.WoodCutter]: { color: '#9c7b46', height: 1.6 },
  [BuildingType.Farm]:       { color: '#c2a24a', height: 1.4 },
  [BuildingType.Settlement]: { color: '#9a9aa0', height: 2.0 },
};

const FALLBACK_BUILDING = { color: '#999999', height: DEFAULT_BUILDING_HEIGHT };

const UNIT_RADIUS = 0.22;
const UNIT_HEIGHT = 0.9;
const UNIT_COLOR = '#e6d2a0';
const UNIT_FACE_COLOR = '#3a3a44';

const SETTLER_TARGET_HEIGHT = 1.5; // world units (1 unit = 1 tile)
const SETTLER_FACING_OFFSET = 0;   // radians; flip to Math.PI if the model faces backward
const CROSSFADE_SEC = 0.2;

const SELECT_RING_COLOR = '#5fd0ff';
const SELECT_RING_INNER = 0.34;
const SELECT_RING_OUTER = 0.5;
const SELECT_RING_LIFT = 0.05;
const SELECT_RING_RENDER_ORDER = 11;

// Squared per-frame world distance above which a unit counts as "moving" (drives
// the walk animation directly, instead of the noisy Moving/Idle state which
// flickers between tiles).
const MOVE_EPS_SQ = 0.0001;

interface UnitEntry {
  object: THREE.Object3D;
  ring: THREE.Mesh;
  isModel: boolean;
  yBase: number; // world-Y offset added to terrain height to seat the unit
  mixer?: THREE.AnimationMixer;
  actions?: Map<string, THREE.AnimationAction>;
  current?: string;
  facing: number;
  lastX: number;
  lastZ: number;
}

export class GLEntities {
  private readonly group = new THREE.Group();
  private readonly buildingMeshes = new Map<string, THREE.Mesh>();
  private readonly units = new Map<string, UnitEntry>();
  private readonly heightAt: HeightAt;

  constructor(scene: THREE.Scene, heightAt: HeightAt) {
    this.heightAt = heightAt;
    scene.add(this.group);
    void loadSettler();
  }

  syncBuildings(buildings: Record<string, Building>): void {
    for (const [id, mesh] of this.buildingMeshes) {
      if (!buildings[id]) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.buildingMeshes.delete(id);
      }
    }

    for (const b of Object.values(buildings)) {
      let mesh = this.buildingMeshes.get(b.id);

      if (!mesh) {
        mesh = this.makeBuildingMesh(b);
        this.buildingMeshes.set(b.id, mesh);
        this.group.add(mesh);
      }

      this.placeBuilding(mesh, b);
    }
  }

  syncUnits(units: Record<string, Unit>, selectedIds: Set<string>, dt: number): void {
    for (const [id, entry] of this.units) {
      if (!units[id]) {
        this.removeUnit(entry);
        this.units.delete(id);
      }
    }

    for (const u of Object.values(units)) {
      let entry = this.units.get(u.id);

      // Upgrade a placeholder to the real model once it has loaded.
      if (entry && !entry.isModel && isSettlerLoaded()) {
        this.removeUnit(entry);
        this.units.delete(u.id);
        entry = undefined;
      }

      if (!entry) {
        entry = this.makeUnitEntry();
        this.units.set(u.id, entry);
        this.group.add(entry.object);
        this.group.add(entry.ring);
      }

      const moved = this.placeUnit(entry, u);
      entry.ring.visible = selectedIds.has(u.id);

      if (entry.isModel) {
        const clip = moved
          ? (u.running ? SETTLER_RUN_CLIP : SETTLER_CLIP[UnitState.Moving])
          : SETTLER_CLIP[u.state];
        this.setClip(entry, clip);
        entry.mixer?.update(dt);
      }
    }
  }

  dispose(): void {
    for (const mesh of this.buildingMeshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.buildingMeshes.clear();

    for (const entry of this.units.values()) this.removeUnit(entry);
    this.units.clear();
  }

  private makeBuildingMesh(b: Building): THREE.Mesh {
    const [fcols, frows] = BUILDING_FOOTPRINT[b.type] ?? [1, 1];
    const cfg = BUILDING_PLACEHOLDER[b.type] ?? FALLBACK_BUILDING;
    const geo = new THREE.BoxGeometry(fcols * 0.85, cfg.height, frows * 0.85);
    const mat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  private placeBuilding(mesh: THREE.Mesh, b: Building): void {
    const [fcols, frows] = BUILDING_FOOTPRINT[b.type] ?? [1, 1];
    const cfg = BUILDING_PLACEHOLDER[b.type] ?? FALLBACK_BUILDING;
    const centerCol = b.col + fcols / 2;
    const centerRow = b.row + frows / 2;
    const ground = this.heightAt(b.col + Math.floor(fcols / 2), b.row + Math.floor(frows / 2));

    mesh.position.set(centerCol - COL_OFFSET, ground + cfg.height / 2, centerRow - ROW_OFFSET);
  }

  private makeUnitEntry(): UnitEntry {
    const ring = makeSelectionRing();
    const instance = createSettlerInstance();

    if (instance) {
      const scale = settlerScaleFor(SETTLER_TARGET_HEIGHT);
      instance.object.scale.setScalar(scale);

      return {
        object: instance.object,
        ring,
        isModel: true,
        yBase: settlerFootOffset(scale),
        mixer: instance.mixer,
        actions: instance.actions,
        facing: 0,
        lastX: Infinity,
        lastZ: 0,
      };
    }

    return { object: makePlaceholderUnit(), ring, isModel: false, yBase: UNIT_HEIGHT / 2, facing: 0, lastX: Infinity, lastZ: 0 };
  }

  // Positions the unit (and its ring) and reports whether it visibly moved this
  // frame, which drives the walk animation.
  private placeUnit(entry: UnitEntry, u: Unit): boolean {
    const col = u.prevCol + (u.col - u.prevCol) * u.moveProgress;
    const row = u.prevRow + (u.row - u.prevRow) * u.moveProgress;
    const ground = this.heightAt(Math.round(col), Math.round(row));

    const x = col + 0.5 - COL_OFFSET;
    const z = row + 0.5 - ROW_OFFSET;
    entry.object.position.set(x, ground + entry.yBase, z);
    entry.ring.position.set(x, ground + SELECT_RING_LIFT, z);

    const dc = u.col - u.prevCol;
    const dr = u.row - u.prevRow;

    if (dc !== 0 || dr !== 0) entry.facing = Math.atan2(dc, dr) + SETTLER_FACING_OFFSET;

    entry.object.rotation.y = entry.facing;

    const dx = x - entry.lastX;
    const dz = z - entry.lastZ;
    const moved = Number.isFinite(entry.lastX) && dx * dx + dz * dz > MOVE_EPS_SQ;
    entry.lastX = x;
    entry.lastZ = z;

    return moved;
  }

  private setClip(entry: UnitEntry, name: string): void {
    if (!entry.actions || entry.current === name) return;

    const next = entry.actions.get(name);

    if (!next) return;

    if (entry.current) entry.actions.get(entry.current)?.fadeOut(CROSSFADE_SEC);

    next.reset().fadeIn(CROSSFADE_SEC).play();
    entry.current = name;
  }

  private removeUnit(entry: UnitEntry): void {
    this.group.remove(entry.object);
    this.group.remove(entry.ring);
    entry.ring.geometry.dispose();
    (entry.ring.material as THREE.Material).dispose();
    entry.mixer?.stopAllAction();

    // Placeholder meshes own unique geometry/material; model instances share
    // the template's, so only dispose placeholders.
    if (!entry.isModel) {
      entry.object.traverse((o) => {
        const mesh = o as THREE.Mesh;

        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
    }
  }
}

const makeSelectionRing = (): THREE.Mesh => {
  const geo = new THREE.RingGeometry(SELECT_RING_INNER, SELECT_RING_OUTER, 24);
  geo.rotateX(-Math.PI / 2);
  // depthTest off + high render order so the ring is never hidden by terrain or
  // the model itself.
  const mat = new THREE.MeshBasicMaterial({
    color: SELECT_RING_COLOR,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    depthTest: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.renderOrder = SELECT_RING_RENDER_ORDER;
  ring.visible = false;

  return ring;
};

const makePlaceholderUnit = (): THREE.Group => {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(UNIT_RADIUS, UNIT_RADIUS, UNIT_HEIGHT, 8),
    new THREE.MeshStandardMaterial({ color: UNIT_COLOR, roughness: 0.8 }),
  );
  body.castShadow = true;
  group.add(body);

  const face = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: UNIT_FACE_COLOR }),
  );
  face.position.set(0, UNIT_HEIGHT * 0.2, UNIT_RADIUS);
  group.add(face);

  return group;
};
