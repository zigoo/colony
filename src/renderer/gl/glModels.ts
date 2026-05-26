import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { UnitState } from '../../game/types';

const SETTLER_URL = '/assets/models/settler.glb';

// The clip that actually holds the run cycle (Meshy's names are scrambled).
export const SETTLER_RUN_CLIP = 'Carry_Heavy_Object_Walk';

// Maps gameplay state → clip name. NOTE: Meshy exported the clip NAMES scrambled
// relative to their actual motion, so these names look "wrong" but are correct by
// content: 'Collect_Object' holds the walk cycle, 'Running' holds the work swing.
export const SETTLER_CLIP: Record<UnitState, string> = {
  [UnitState.Idle]:       'Idle_03',         // idle
  [UnitState.Moving]:     'Collect_Object',  // actually the walk cycle
  [UnitState.Collecting]: 'Running',         // actually the hammer/chop swing
  [UnitState.Building]:   'Running',         // hammer swing
  [UnitState.Depositing]: 'Collect_Object',  // walk (no dedicated carry clip)
};

interface Template {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  size: THREE.Vector3; // bounding-box size of the unscaled model
  minY: number;        // bounding-box floor (for seating feet on the ground)
}

let template: Template | null = null;
let loading: Promise<void> | null = null;

export const loadSettler = (): Promise<void> => {
  if (loading) return loading;

  const loader = new GLTFLoader();
  loading = new Promise((resolve) => {
    loader.load(
      SETTLER_URL,
      (gltf) => {
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;

          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        const box = new THREE.Box3().setFromObject(gltf.scene);
        template = {
          scene: gltf.scene,
          animations: gltf.animations,
          size: box.getSize(new THREE.Vector3()),
          minY: box.min.y,
        };
        resolve();
      },
      undefined,
      (err) => {
        console.error('Failed to load settler.glb', err);
        resolve();
      },
    );
  });

  return loading;
};

export const isSettlerLoaded = (): boolean => template !== null;

// Scale factor that makes the model `targetHeight` world units tall.
export const settlerScaleFor = (targetHeight: number): number =>
  template ? targetHeight / template.size.y : 1;

// World-space Y offset (after scaling) that puts the model's feet on the ground.
export const settlerFootOffset = (scale: number): number =>
  template ? -template.minY * scale : 0;

// ── Trees ───────────────────────────────────────────────────────────────────

export const TREE_KEYS = ['pine', 'oak', 'bush'] as const;
export type TreeKey = (typeof TREE_KEYS)[number];

const TREE_URL: Record<TreeKey, string> = {
  pine: '/assets/models/tree_pine.glb',
  oak: '/assets/models/tree_oak.glb',
  bush: '/assets/models/tree_bush.glb',
};

// Target world height per variant (1 unit = 1 tile); models are scaled to match.
export const TREE_TARGET_HEIGHT: Record<TreeKey, number> = {
  pine: 4.2,
  oak: 3.2,
  bush: 1.7,
};

const TREE_SWAY_AMP = 0.016;  // a bit stronger left-right
const TREE_SWAY_SPEED = 1.27; // ~15% faster

// Shared, mutable uniforms. treeWind: animation time. treeCam: camera target on
// the ground (XZ). treeFade: (start,end) distances over which trees shrink to
// nothing toward the periphery — a smooth alternative to popping them out.
export const treeWind = { value: 0 };
export const treeCam = { value: new THREE.Vector2() };
export const treeFade = { value: new THREE.Vector2(95, 135) };

export interface TreeTemplate {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  height: number; // unscaled model height (base sits at y=0)
}

const treeTemplates: Partial<Record<TreeKey, TreeTemplate>> = {};
let treesLoading: Promise<void> | null = null;

// Adds a height-based wind sway to a tree material's vertex shader. Per-instance
// phase comes from the instance's world position so trees don't sway in sync.
const injectSway = (material: THREE.Material): void => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = treeWind;
    shader.uniforms.uSwayAmp = { value: TREE_SWAY_AMP };
    shader.uniforms.uSwaySpeed = { value: TREE_SWAY_SPEED };
    shader.uniforms.uTreeCam = treeCam;
    shader.uniforms.uTreeFade = treeFade;
    shader.vertexShader =
      'uniform float uTime;\nuniform float uSwayAmp;\nuniform float uSwaySpeed;\nuniform vec2 uTreeCam;\nuniform vec2 uTreeFade;\n'
      + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec4 swayInst = instanceMatrix[3];
        float swayPhase = swayInst.x * 0.6 + swayInst.z * 0.6;
        float swayH = max(transformed.y, 0.0);
        transformed.x += sin(uTime * uSwaySpeed + swayPhase) * swayH * uSwayAmp;
        transformed.z += cos(uTime * uSwaySpeed * 0.85 + swayPhase) * swayH * uSwayAmp * 0.6;
        // Periphery fade: shrink the whole tree toward its base as it nears the
        // draw-distance edge, so trees grow in / shrink out instead of popping.
        float treeDist = distance(vec2(swayInst.x, swayInst.z), uTreeCam);
        transformed *= 1.0 - smoothstep(uTreeFade.x, uTreeFade.y, treeDist);
      }`,
    );
  };
  material.customProgramCacheKey = () => 'treeSway';
};

export const loadTrees = (): Promise<void> => {
  if (treesLoading) return treesLoading;

  const loader = new GLTFLoader();
  treesLoading = Promise.all(
    TREE_KEYS.map((key) => new Promise<void>((resolve) => {
      loader.load(
        TREE_URL[key],
        (gltf) => {
          let mesh: THREE.Mesh | null = null;
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;

            if (m.isMesh && !mesh) mesh = m;
          });

          if (!mesh) {
            resolve();

            return;
          }

          const found = mesh as THREE.Mesh;
          found.updateWorldMatrix(true, false);
          const geometry = found.geometry.clone();
          geometry.applyMatrix4(found.matrixWorld);
          geometry.computeBoundingBox();
          geometry.translate(0, -geometry.boundingBox!.min.y, 0); // base at y=0
          geometry.computeBoundingBox();

          // Cheaper lighting than the GLB's PBR material (Lambert ≈ same texture,
          // simpler per-pixel shading) — big win with overlapping foliage.
          const src = found.material as THREE.MeshStandardMaterial;
          const material = new THREE.MeshLambertMaterial({
            map: src.map ?? null,
            color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
          });
          injectSway(material);

          treeTemplates[key] = { geometry, material, height: geometry.boundingBox!.max.y };
          resolve();
        },
        undefined,
        (err) => {
          console.error(`Failed to load ${TREE_URL[key]}`, err);
          resolve();
        },
      );
    })),
  ).then(() => undefined);

  return treesLoading;
};

export const isTreesLoaded = (): boolean => TREE_KEYS.every((k) => treeTemplates[k]);

export const getTreeTemplate = (key: TreeKey): TreeTemplate | undefined => treeTemplates[key];

export interface SettlerInstance {
  object: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
}

export const createSettlerInstance = (): SettlerInstance | null => {
  if (!template) return null;

  const object = cloneSkinned(template.scene);
  const mixer = new THREE.AnimationMixer(object);
  const actions = new Map<string, THREE.AnimationAction>();

  for (const clip of template.animations) {
    actions.set(clip.name, mixer.clipAction(clip));
  }

  return { object, mixer, actions };
};
