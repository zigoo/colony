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
