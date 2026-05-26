import * as THREE from 'three';
import type { MapState } from '../../game/types';
import { MAP_COLS, MAP_ROWS } from '../../game/constants';
import { buildTerrainMesh } from './terrain';
import { defaultGLParams, terrainSignature } from './glParams';
import type { GLParams } from './glParams';
import type { SkyState } from './dayNightCycle';

const CAMERA_DISTANCE = 600;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 6;
const PAN_SPEED = 0.7;

// Water surface sits just below the sand shoreline (-0.02), scaled by terrain
// height. Keeping it close to the shore (not deep) means water meets the beach
// naturally instead of looking like a sunken bowl.
const WATER_BASE = -0.04;

export class GLScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly water: THREE.Mesh;
  private terrain: THREE.Mesh | null = null;
  private params: GLParams = { ...defaultGLParams };
  private map: MapState | null = null;
  private terrainSig = '';
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color('#9ec8e8');

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);

    this.hemi = new THREE.HemisphereLight('#cfe3ff', '#4a5a3a', 1);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#fff3d6', 1.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.8;
    const sc = this.sun.shadow.camera;
    sc.left = -90;
    sc.right = 90;
    sc.top = 90;
    sc.bottom = -90;
    sc.near = 50;
    sc.far = 800;
    sc.updateProjectionMatrix();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const waterGeo = new THREE.PlaneGeometry(MAP_COLS, MAP_ROWS);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#2e6da4',
      transparent: true,
      opacity: 0.93,
      roughness: 0.35,
      metalness: 0.0,
    });
    this.water = new THREE.Mesh(waterGeo, waterMat);
    this.water.name = 'water';
    this.water.receiveShadow = true;
    this.scene.add(this.water);

    this.applyParams(this.params);
  }

  setMap(map: MapState): void {
    this.map = map;
    this.rebuildTerrain();
  }

  // Camera + terrain params. Terrain rebuilds only if its shape signature changed.
  applyParams(params: GLParams): void {
    this.params = params;
    this.positionCamera();
    this.updateFrustum();
    this.water.position.y = WATER_BASE * params.heightScale;

    const sig = terrainSignature(params);
    if (sig !== this.terrainSig && this.map) this.rebuildTerrain();
  }

  // Applied every frame from the day/night cycle.
  applySky(sky: SkyState): void {
    const el = THREE.MathUtils.degToRad(sky.sunElevationDeg);
    const az = THREE.MathUtils.degToRad(sky.sunAzimuthDeg);
    this.sun.position.set(
      Math.cos(el) * Math.cos(az),
      Math.sin(el),
      Math.cos(el) * Math.sin(az),
    ).multiplyScalar(400).add(this.target);
    this.sun.target.position.copy(this.target);
    this.sun.color.copy(sky.sunColor);
    this.sun.intensity = sky.sunIntensity;

    this.hemi.color.copy(sky.skyColor);
    this.hemi.groundColor.copy(sky.groundColor);
    this.hemi.intensity = sky.hemiIntensity;

    (this.scene.background as THREE.Color).copy(sky.skyColor);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.updateFrustum();
  }

  pan(dxPixels: number, dyPixels: number): void {
    const worldPerPixel = (this.params.viewSize / this.height / this.camera.zoom) * PAN_SPEED;

    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).setY(0).normalize();

    this.target.addScaledVector(right, -dxPixels * worldPerPixel);
    this.target.addScaledVector(up, dyPixels * worldPerPixel);
    this.positionCamera();
  }

  zoom(factor: number): void {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.terrain) {
      this.terrain.geometry.dispose();
      (this.terrain.material as THREE.Material).dispose();
    }
    this.water.geometry.dispose();
    (this.water.material as THREE.Material).dispose();
    this.renderer.dispose();
  }

  private rebuildTerrain(): void {
    if (!this.map) return;

    if (this.terrain) {
      this.scene.remove(this.terrain);
      this.terrain.geometry.dispose();
      (this.terrain.material as THREE.Material).dispose();
    }
    this.terrain = buildTerrainMesh(this.map, this.params);
    this.scene.add(this.terrain);
    this.terrainSig = terrainSignature(this.params);
  }

  private positionCamera(): void {
    const el = THREE.MathUtils.degToRad(this.params.camElevationDeg);
    const az = THREE.MathUtils.degToRad(this.params.camAzimuthDeg);
    const dir = new THREE.Vector3(
      Math.cos(el) * Math.cos(az),
      Math.sin(el),
      Math.cos(el) * Math.sin(az),
    );
    this.camera.position.copy(this.target).addScaledVector(dir, CAMERA_DISTANCE);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  private updateFrustum(): void {
    const aspect = this.width / this.height;
    const halfH = this.params.viewSize / 2;
    const halfW = halfH * aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }
}
