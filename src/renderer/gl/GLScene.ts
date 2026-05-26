import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { MapState } from '../../game/types';
import { MAP_COLS, MAP_ROWS } from '../../game/constants';
import { createHeightSampler, COL_OFFSET, ROW_OFFSET } from './terrain';
import { defaultGLParams, terrainSignature } from './glParams';
import type { GLParams } from './glParams';
import type { SkyState } from './dayNightCycle';
import { GLEntities } from './GLEntities';
import { GLWorld } from './GLWorld';
import { treeWind } from './glModels';
import type { Building, Unit } from '../../game/types';

export interface GridCell { col: number; row: number; }

const CAMERA_DISTANCE = 600;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 3000;
const MIN_ZOOM = 0.18; // lower = can zoom further out
const MAX_ZOOM = 6;
// Below this zoom (zoomed far out) trees are tiny dots, so hide them — the
// forest still reads from the green terrain underneath. Keeps the worst-case
// (whole visible window full of trees) cheap.
const TREE_HIDE_ZOOM = 0.5;
const PAN_SPEED = 1.26; // 180% of the previous feel
const MAX_PIXEL_RATIO = 2;

// Water surface sits just below the sand shoreline (-0.02), scaled by terrain
// height. Keeping it close to the shore (not deep) means water meets the beach
// naturally instead of looking like a sunken bowl.
const WATER_BASE = -0.04;

// Colors (placeholder light intensities are overwritten each frame by the cycle).
const SKY_BG_COLOR = '#9ec8e8';
const HEMI_SKY_COLOR = '#cfe3ff';
const HEMI_GROUND_COLOR = '#4a5a3a';
const SUN_COLOR = '#fff3d6';
const WATER_COLOR = '#2e6da4';
const INIT_HEMI_INTENSITY = 1;
const INIT_SUN_INTENSITY = 1.5;

const WATER_OPACITY = 0.93;
const WATER_ROUGHNESS = 0.35;

// Shadow mapping.
const SHADOW_MAP_SIZE = 2048;
const SHADOW_BIAS = -0.0004;
const SHADOW_NORMAL_BIAS = 0.8;
const SHADOW_FRUSTUM_HALF = 90; // half-extent of the directional shadow camera
const SHADOW_NEAR = 50;
const SHADOW_FAR = 800;
const SUN_DISTANCE = 400; // how far the directional light sits from the target

// Tile highlights.
const HOVER_COLOR = '#ffe14d';
const HOVER_OPACITY = 0.32;
const SELECT_COLOR = '#5fd0ff';
const SELECT_OPACITY = 0.42;
const HIGHLIGHT_TILE_SIZE = 0.92;
const HIGHLIGHT_RENDER_ORDER = 10;
const HIGHLIGHT_LIFT = 0.06; // × heightScale, lifts the quad clear of the surface

// Footprint preview shown while placing a building (one quad scaled to the whole
// footprint), tinted by whether the placement is valid.
const PLACE_OK_COLOR = '#5fda7d';
const PLACE_BAD_COLOR = '#e05050';
const PLACE_OPACITY = 0.34;

// Selection glow (postprocessing outline along the model silhouette).
const OUTLINE_COLOR = '#7fe0ff';
const OUTLINE_HIDDEN_COLOR = '#274b66'; // dimmer glow where the model is occluded
const OUTLINE_STRENGTH = 3.5;
const OUTLINE_GLOW = 0.7;     // soft blur/bloom of the edge
const OUTLINE_THICKNESS = 1.5;
const OUTLINE_PULSE = 2.5;    // gentle breathing pulse (seconds); 0 = steady
const OUTLINE_SAMPLES = 4;    // MSAA for the composer render target (keep AA)

const PICK_REFINE_ITERATIONS = 3;
const UNIT_PROJECT_HEIGHT = 0.7; // world-Y of a unit's mid-body, for box-select projection

const makeTileHighlight = (color: string, opacity: number): THREE.Mesh => {
  const geo = new THREE.PlaneGeometry(HIGHLIGHT_TILE_SIZE, HIGHLIGHT_TILE_SIZE);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  mesh.renderOrder = HIGHLIGHT_RENDER_ORDER;

  return mesh;
};

// A 1×1 ground quad so mesh.scale maps directly to a tile footprint.
const makeUnitTileQuad = (color: string, opacity: number): THREE.Mesh => {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  mesh.renderOrder = HIGHLIGHT_RENDER_ORDER;

  return mesh;
};

export class GLScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly outline: OutlinePass;
  private selectedBuildingId: string | null = null;
  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly water: THREE.Mesh;
  private readonly hoverMesh: THREE.Mesh;
  private readonly selectMesh: THREE.Mesh;
  private readonly placeMesh: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly entities: GLEntities;
  private readonly world: GLWorld;
  private heightSampler: ((gx: number, gz: number) => number) | null = null;
  private selectedCell: GridCell | null = null;
  treesVisible = true;
  drawCalls = 0;
  triangles = 0;
  private params: GLParams = { ...defaultGLParams };
  private map: MapState | null = null;
  private terrainSig = '';
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color(SKY_BG_COLOR);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR);

    this.hemi = new THREE.HemisphereLight(HEMI_SKY_COLOR, HEMI_GROUND_COLOR, INIT_HEMI_INTENSITY);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(SUN_COLOR, INIT_SUN_INTENSITY);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.sun.shadow.bias = SHADOW_BIAS;
    this.sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
    const sc = this.sun.shadow.camera;
    sc.left = -SHADOW_FRUSTUM_HALF;
    sc.right = SHADOW_FRUSTUM_HALF;
    sc.top = SHADOW_FRUSTUM_HALF;
    sc.bottom = -SHADOW_FRUSTUM_HALF;
    sc.near = SHADOW_NEAR;
    sc.far = SHADOW_FAR;
    sc.updateProjectionMatrix();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const waterGeo = new THREE.PlaneGeometry(MAP_COLS, MAP_ROWS);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: WATER_COLOR,
      transparent: true,
      opacity: WATER_OPACITY,
      roughness: WATER_ROUGHNESS,
      metalness: 0.0,
    });
    this.water = new THREE.Mesh(waterGeo, waterMat);
    this.water.name = 'water';
    this.water.receiveShadow = true;
    this.scene.add(this.water);

    this.hoverMesh = makeTileHighlight(HOVER_COLOR, HOVER_OPACITY);
    this.selectMesh = makeTileHighlight(SELECT_COLOR, SELECT_OPACITY);
    this.placeMesh = makeUnitTileQuad(PLACE_OK_COLOR, PLACE_OPACITY);
    this.scene.add(this.hoverMesh);
    this.scene.add(this.selectMesh);
    this.scene.add(this.placeMesh);

    this.entities = new GLEntities(this.scene, (col, row) => this.heightAt(col, row));
    this.world = new GLWorld(this.scene);

    // Postprocessing: render → outline-glow on the selected building → output.
    // A multisampled target keeps the scene anti-aliased through the composer.
    const composerTarget = new THREE.WebGLRenderTarget(1, 1, { samples: OUTLINE_SAMPLES });
    this.composer = new EffectComposer(this.renderer, composerTarget);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.outline = new OutlinePass(new THREE.Vector2(1, 1), this.scene, this.camera);
    this.outline.edgeStrength = OUTLINE_STRENGTH;
    this.outline.edgeGlow = OUTLINE_GLOW;
    this.outline.edgeThickness = OUTLINE_THICKNESS;
    this.outline.pulsePeriod = OUTLINE_PULSE;
    this.outline.visibleEdgeColor.set(OUTLINE_COLOR);
    this.outline.hiddenEdgeColor.set(OUTLINE_HIDDEN_COLOR);
    this.composer.addPass(this.outline);
    this.composer.addPass(new OutputPass());

    this.applyParams(this.params);
  }

  syncEntities(
    buildings: Record<string, Building>,
    units: Record<string, Unit>,
    selectedIds: Set<string>,
    dt: number,
  ): void {
    this.entities.syncBuildings(buildings, dt);
    this.entities.syncUnits(units, selectedIds, dt);
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
    ).multiplyScalar(SUN_DISTANCE).add(this.target);
    this.sun.target.position.copy(this.target);
    this.sun.color.copy(sky.sunColor);
    this.sun.intensity = sky.sunIntensity;

    this.hemi.color.copy(sky.skyColor);
    this.hemi.groundColor.copy(sky.groundColor);
    this.hemi.intensity = sky.hemiIntensity;

    (this.scene.background as THREE.Color).copy(sky.skyColor);
  }

  // Mouse NDC (-1..1) → grid cell. Intersects a ground plane, then refines the
  // plane to the terrain height under the hit so elevation parallax is corrected.
  pickTile(ndcX: number, ndcY: number): GridCell | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const ray = this.raycaster.ray;
    const point = new THREE.Vector3();
    let y = 0;
    let col = 0;
    let row = 0;

    for (let i = 0; i < PICK_REFINE_ITERATIONS; i++) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);

      if (!ray.intersectPlane(plane, point)) return null;

      col = Math.floor(point.x + COL_OFFSET);
      row = Math.floor(point.z + ROW_OFFSET);
      const cc = Math.max(0, Math.min(MAP_COLS - 1, col));
      const rr = Math.max(0, Math.min(MAP_ROWS - 1, row));
      y = this.heightAt(cc, rr);
    }

    if (col < 0 || row < 0 || col >= MAP_COLS || row >= MAP_ROWS) return null;

    return { col, row };
  }

  heightAt(col: number, row: number): number {
    return this.heightSampler ? this.heightSampler(col + 0.5, row + 0.5) : 0;
  }

  // Grid cell at the centre of the current view (the camera target), clamped
  // inside the map — so spawns land near what the player is actually looking at.
  viewCenterCell(): GridCell {
    const col = Math.round(this.target.x + COL_OFFSET);
    const row = Math.round(this.target.z + ROW_OFFSET);

    return {
      col: Math.max(1, Math.min(MAP_COLS - 2, col)),
      row: Math.max(1, Math.min(MAP_ROWS - 2, row)),
    };
  }

  // Building id under the cursor (raycast against the building meshes), or null.
  pickBuildingId(ndcX: number, ndcY: number): string | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    return this.entities.pickBuildingId(this.raycaster);
  }

  get treeCount(): number {
    return this.world.treeCount;
  }

  // Unit ids whose projected screen position falls inside the pixel box.
  unitsInScreenBox(units: Record<string, Unit>, x1: number, y1: number, x2: number, y2: number): string[] {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const v = new THREE.Vector3();
    const ids: string[] = [];

    for (const u of Object.values(units)) {
      const col = u.prevCol + (u.col - u.prevCol) * u.moveProgress;
      const row = u.prevRow + (u.row - u.prevRow) * u.moveProgress;
      const ground = this.heightAt(Math.round(col), Math.round(row));
      v.set(col + 0.5 - COL_OFFSET, ground + UNIT_PROJECT_HEIGHT, row + 0.5 - ROW_OFFSET).project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * this.width;
      const sy = (-v.y * 0.5 + 0.5) * this.height;

      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) ids.push(u.id);
    }

    return ids;
  }

  setHover(cell: GridCell | null): void {
    this.placeTile(this.hoverMesh, cell);
  }

  setSelected(cell: GridCell | null): void {
    this.selectedCell = cell;
    this.placeTile(this.selectMesh, cell);
  }

  // The building to glow as selected (resolved to its mesh each frame in render).
  setSelectedBuilding(id: string | null): void {
    this.selectedBuildingId = id;
  }

  // Footprint placement preview: a quad covering the whole footprint, tinted by
  // validity. Pass cell = null to hide it.
  setPlacement(cell: GridCell | null, fcols: number, frows: number, ok: boolean): void {
    if (!cell) {
      this.placeMesh.visible = false;

      return;
    }

    const cx = cell.col + Math.floor(fcols / 2);
    const cz = cell.row + Math.floor(frows / 2);

    this.placeMesh.position.set(
      cell.col + fcols / 2 - COL_OFFSET,
      this.heightAt(cx, cz) + HIGHLIGHT_LIFT * this.params.heightScale,
      cell.row + frows / 2 - ROW_OFFSET,
    );
    this.placeMesh.scale.set(fcols, 1, frows);
    (this.placeMesh.material as THREE.MeshBasicMaterial).color.set(ok ? PLACE_OK_COLOR : PLACE_BAD_COLOR);
    this.placeMesh.visible = true;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.outline.setSize(width, height);
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
    // Stream terrain + forest chunks around the camera, sized to the visible
    // ground footprint (foreshortened by the camera tilt).
    const halfH = this.params.viewSize / 2 / this.camera.zoom;
    const halfW = halfH * (this.width / this.height);
    const groundDepth = halfH / Math.sin(THREE.MathUtils.degToRad(this.params.camElevationDeg));
    const viewRadius = Math.hypot(halfW, groundDepth);

    // Zoom-LOD: hide trees when zoomed far out (they'd be sub-pixel anyway).
    this.treesVisible = this.camera.zoom >= TREE_HIDE_ZOOM;
    this.world.setForestVisible(this.treesVisible);
    this.world.update(this.target.x, this.target.z, viewRadius, this.camera);

    treeWind.value = performance.now() / 1000;

    const selected = this.selectedBuildingId ? this.entities.getBuildingObject(this.selectedBuildingId) : null;
    this.outline.selectedObjects = selected ? [selected] : [];
    this.composer.render();

    this.drawCalls = this.renderer.info.render.calls;
    this.triangles = this.renderer.info.render.triangles;
  }

  dispose(): void {
    this.world.dispose();
    this.water.geometry.dispose();
    (this.water.material as THREE.Material).dispose();
    this.hoverMesh.geometry.dispose();
    (this.hoverMesh.material as THREE.Material).dispose();
    this.selectMesh.geometry.dispose();
    (this.selectMesh.material as THREE.Material).dispose();
    this.placeMesh.geometry.dispose();
    (this.placeMesh.material as THREE.Material).dispose();
    this.entities.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }

  private placeTile(mesh: THREE.Mesh, cell: GridCell | null): void {
    if (!cell) {
      mesh.visible = false;

      return;
    }

    mesh.position.set(
      cell.col + 0.5 - COL_OFFSET,
      this.heightAt(cell.col, cell.row) + HIGHLIGHT_LIFT * this.params.heightScale,
      cell.row + 0.5 - ROW_OFFSET,
    );
    mesh.visible = true;
  }

  private rebuildTerrain(): void {
    if (!this.map) return;

    this.terrainSig = terrainSignature(this.params);
    this.heightSampler = createHeightSampler(this.map, this.params);
    // The streamer rebuilds terrain + forest chunks around the camera.
    this.world.reset(this.map, this.params);

    // Re-seat the selection highlight on the new surface.
    this.placeTile(this.selectMesh, this.selectedCell);
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
