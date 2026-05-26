import { useRef, useEffect } from 'react';
import { useStore } from '../store';
import { GLScene } from '../renderer/gl/GLScene';
import { useGLParams } from '../renderer/gl/glParams';
import { computeSky } from '../renderer/gl/dayNightCycle';
import { useWorldClock } from '../renderer/gl/worldClock';
import { useUnitHover } from '../renderer/gl/unitHover';
import { registerZoom } from '../renderer/gl/glControls';
import { useFps } from '../renderer/gl/fps';
import { useDrone } from '../renderer/gl/drone';
import { MIN_DRAG_DISTANCE, CAMERA_ZOOM_STEP_IN, CAMERA_ZOOM_STEP_OUT } from '../game/constants';
import { canPlaceBuilding, BUILDING_FOOTPRINT } from '../game/buildingConfig';

const TICK_MS = 100;
const MAX_FRAME_DELTA_MS = 200; // clamp so a backgrounded tab doesn't fast-forward ticks
const FPS_UPDATE_MS = 500;      // how often the on-screen FPS readout refreshes
const EDGE_PAN_MARGIN = 28;     // px from a screen edge that triggers edge-scroll
const EDGE_PAN_SPEED = 14;      // equivalent drag pixels/frame at the very edge
const ROTATE_DEG_PER_PIXEL = 0.4; // right-drag orbit sensitivity
const ROTATE_KEY_STEP = 15;       // Q/E discrete rotation step in degrees
const RIGHT_BUTTON = 2;
// move into array perhaps
const DRONE_OSC_HIGH = 80;        // elevation the fly-over oscillates up to (starts here)
const DRONE_OSC_LOW = 18;         // elevation the fly-over oscillates down to
const DRONE_PERIOD_SEC = 12;      // seconds for a full high→low→high elevation cycle
const DRONE_AZIMUTH_DEG = 55;     // heading the fly-over eases into
const DRONE_PAN_SPEED = 38;       // drift speed (equivalent drag px/sec per axis)
const DRONE_TRANSITION_SEC = 1.5; // ease-in (blend into oscillation) / ease-out (back to prior pose)

const DRONE_OSC_MID = (DRONE_OSC_HIGH + DRONE_OSC_LOW) / 2;
const DRONE_OSC_AMP = (DRONE_OSC_HIGH - DRONE_OSC_LOW) / 2;

// Smooth S-curve (cubic bezier-like) easing for the drone transitions.
const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Orbits the camera by adjusting the shared azimuth param, wrapped to [0, 360).
const rotateCamera = (deltaDeg: number): void => {
  const cur = useGLParams.getState().camAzimuthDeg;
  const next = ((cur + deltaDeg) % 360 + 360) % 360;

  useGLParams.getState().set('camAzimuthDeg', next);
};

const toNdc = (e: MouseEvent): { x: number; y: number } => ({
  x: (e.clientX / window.innerWidth) * 2 - 1,
  y: -(e.clientY / window.innerHeight) * 2 + 1,
});

export const GameCanvasGL = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const glScene = new GLScene(el);
    glScene.applyParams(useGLParams.getState());
    glScene.resize(window.innerWidth, window.innerHeight);
    glScene.setMap(useStore.getState().game.map);
    registerZoom((factor) => glScene.zoom(factor));

    // Rebuild terrain only when the map object identity changes (new map gen).
    let lastMap = useStore.getState().game.map;
    const unsubMap = useStore.subscribe((s) => {
      if (s.game.map !== lastMap) {
        lastMap = s.game.map;
        glScene.setMap(lastMap);
      }
    });

    // Live tuning: re-apply camera/light/terrain params whenever a slider moves.
    const unsubParams = useGLParams.subscribe((p) => glScene.applyParams(p));

    // Drone mode: azimuth eases to a fixed heading while elevation oscillates
    // high↔low (cinematic up/down sweep), all blended in from the current pose;
    // exit always eases back to the pre-drone pose. The motion runs in the loop.
    let droneSavedElevation = useGLParams.getState().camElevationDeg;
    let droneSavedAzimuth = useGLParams.getState().camAzimuthDeg;
    let droneStart = 0;
    let droneStartElev = droneSavedElevation;
    let droneStartAz = droneSavedAzimuth;
    let droneLastElev = droneSavedElevation;
    let droneLastAz = droneSavedAzimuth;
    let droneExit: { fromElev: number; fromAz: number; start: number } | null = null;
    const unsubDrone = useDrone.subscribe((s) => {
      const p = useGLParams.getState();

      if (s.active) {
        droneSavedElevation = p.camElevationDeg;
        droneSavedAzimuth = p.camAzimuthDeg;
        droneStart = performance.now();
        droneStartElev = p.camElevationDeg;
        droneStartAz = p.camAzimuthDeg;
        droneExit = null;
      } else {
        droneExit = { fromElev: droneLastElev, fromAz: droneLastAz, start: performance.now() };
      }
    });

    // ── interaction (pan + zoom + picking; shift+drag = box select) ──
    let dragging = false;
    let boxSelecting = false;
    let orbiting = false;
    let hasMoved = false;
    let last = { x: 0, y: 0 };
    let down = { x: 0, y: 0 };
    let mouseX = -1; // for edge-scroll; -1 = cursor outside the window
    let mouseY = -1;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === RIGHT_BUTTON) {
        orbiting = true;
        last = { x: e.clientX, y: e.clientY };

        return;
      }

      hasMoved = false;
      last = { x: e.clientX, y: e.clientY };
      down = { x: e.clientX, y: e.clientY };

      if (e.shiftKey) boxSelecting = true;
      else dragging = true;
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onMouseMove = (e: MouseEvent) => {
      if (orbiting) {
        rotateCamera((e.clientX - last.x) * ROTATE_DEG_PER_PIXEL);
        last = { x: e.clientX, y: e.clientY };

        return;
      }

      if (boxSelecting) {
        useStore.getState().setSelectionBox({ x1: down.x, y1: down.y, x2: e.clientX, y2: e.clientY });

        return;
      }

      if (dragging) {
        if (Math.abs(e.clientX - down.x) > MIN_DRAG_DISTANCE || Math.abs(e.clientY - down.y) > MIN_DRAG_DISTANCE) {
          hasMoved = true;
        }

        if (hasMoved) {
          glScene.pan(e.clientX - last.x, e.clientY - last.y);
          last = { x: e.clientX, y: e.clientY };
        }

        return;
      }

      // Over a UI panel (not the canvas) → suppress edge-scroll, hover and picking.
      if (e.target !== el) {
        mouseX = -1;
        mouseY = -1;
        glScene.setHover(null);
        useUnitHover.getState().set(null, 0, 0);

        return;
      }

      mouseX = e.clientX;
      mouseY = e.clientY;

      const n = toNdc(e);
      const cell = glScene.pickTile(n.x, n.y);

      const st = useStore.getState();
      const placing = st.ui.selectedBuildingType;

      if (placing) {
        // Show the whole footprint tinted by validity; suppress single hover + tooltip.
        const [fcols, frows] = BUILDING_FOOTPRINT[placing] ?? [1, 1];
        const ok = cell !== null && canPlaceBuilding(placing, cell.col, cell.row, st.game.map.tiles, st.game.buildings);

        glScene.setHover(null);
        glScene.setPlacement(cell, fcols, frows, ok);
        useUnitHover.getState().set(null, 0, 0);

        return;
      }

      glScene.setHover(cell);
      glScene.setPlacement(null, 0, 0, true);
      const hoveredId = cell ? st.occupants[`${cell.col},${cell.row}`] : undefined;
      useUnitHover.getState().set(hoveredId ? st.game.units[hoveredId]?.name ?? null : null, e.clientX, e.clientY);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (orbiting) {
        orbiting = false;

        return;
      }

      const store = useStore.getState();

      if (boxSelecting) {
        const ids = glScene.unitsInScreenBox(store.game.units, down.x, down.y, e.clientX, e.clientY);
        store.selectUnits(ids);
        store.setSelectionBox(null);
        boxSelecting = false;

        return;
      }

      // A click (no meaningful drag): place a building if one is selected, else
      // select a unit, command selected units, or select a tile.
      if (dragging && !hasMoved) {
        const n = toNdc(e);
        const cell = glScene.pickTile(n.x, n.y);
        const placing = store.ui.selectedBuildingType;

        if (placing) {
          if (cell && canPlaceBuilding(placing, cell.col, cell.row, store.game.map.tiles, store.game.buildings)) {
            store.placeBuilding(placing, cell.col, cell.row);
            store.selectBuildingType(null);
            glScene.setPlacement(null, 0, 0, true);
          }

          dragging = false;

          return;
        }

        const unitId = cell ? store.occupants[`${cell.col},${cell.row}`] : undefined;
        const buildingId = unitId ? null : glScene.pickBuildingId(n.x, n.y);

        if (unitId) {
          store.selectUnits([unitId]);
          store.selectBuilding(null);
        } else if (buildingId) {
          store.selectBuilding(buildingId);
          store.selectUnits([]);
        } else if (!cell) {
          store.selectUnits([]);
          store.selectTile(null, null);
          store.selectBuilding(null);
        } else if (store.ui.selectedUnitIds.length > 0) {
          store.ui.selectedUnitIds.forEach((id, i) => store.moveUnitTo(id, cell.col, cell.row, i * 2));
        } else {
          store.selectTile(cell.col, cell.row);
          store.selectBuilding(null);
        }
      }

      dragging = false;
    };
    const onMouseLeave = () => {
      glScene.setHover(null);
      useUnitHover.getState().set(null, 0, 0);
      mouseX = -1;
      mouseY = -1;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      glScene.zoom(e.deltaY < 0 ? CAMERA_ZOOM_STEP_IN : CAMERA_ZOOM_STEP_OUT);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (useDrone.getState().active) {
          useDrone.getState().set(false);

          return;
        }

        useStore.getState().selectUnits([]);
        useStore.getState().selectTile(null, null);
        useStore.getState().selectBuildingType(null);
        useStore.getState().selectBuilding(null);
        glScene.setPlacement(null, 0, 0, true);

        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        useDrone.getState().toggle();

        return;
      }

      if (e.key === 'q' || e.key === 'Q') {
        rotateCamera(-ROTATE_KEY_STEP);

        return;
      }

      if (e.key === 'e' || e.key === 'E') {
        rotateCamera(ROTATE_KEY_STEP);

        return;
      }

      // Dev: press 'u' to spawn a settler on the selected tile, else at the
      // centre of the current GL view (the store's 2D camera is stale in GL).
      if (e.key === 'u' || e.key === 'U') {
        const { ui } = useStore.getState();

        if (ui.selectedCol !== null && ui.selectedRow !== null) {
          useStore.getState().spawnUnit(ui.selectedCol, ui.selectedRow);
        } else {
          const c = glScene.viewCenterCell();

          useStore.getState().spawnUnit(c.col, c.row);
        }
      }
    };
    const onResize = () => {
      glScene.resize(window.innerWidth, window.innerHeight);
    };

    // Reflect tile selection (from clicks here or elsewhere) in the highlight.
    let lastSel = '';
    const unsubSel = useStore.subscribe((s) => {
      const { selectedCol, selectedRow } = s.ui;
      const key = `${selectedCol},${selectedRow}`;

      if (key === lastSel) return;
      lastSel = key;
      glScene.setSelected(selectedCol !== null && selectedRow !== null ? { col: selectedCol, row: selectedRow } : null);
    });

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('mouseleave', onMouseLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);

    // ── game loop (fixed-timestep tick + render) ──
    let rafId = 0;
    let lastTime = 0;
    let accumulator = 0;
    let fpsFrames = 0;
    let fpsElapsed = 0;

    const loop = (timestamp: number) => {
      const delta = Math.min(timestamp - lastTime, MAX_FRAME_DELTA_MS);
      lastTime = timestamp;
      accumulator += delta;

      fpsFrames++;
      fpsElapsed += delta;

      if (fpsElapsed >= FPS_UPDATE_MS) {
        const fps = Math.round((fpsFrames * 1000) / fpsElapsed);

        useFps.getState().set({
          fps,
          treesHidden: !glScene.treesVisible,
          treeCount: glScene.treeCount,
          drawCalls: glScene.drawCalls,
          triangles: glScene.triangles,
        });
        fpsFrames = 0;
        fpsElapsed = 0;
      }

      while (accumulator >= TICK_MS) {
        useStore.getState().tick();
        accumulator -= TICK_MS;
      }

      // Drone fly-over: azimuth eases to its heading while elevation oscillates
      // high↔low, both blended in from the entry pose; then a diagonal drift
      // (ramped in with the same S-curve). Exit eases the pose back smoothly.
      const droneOn = useDrone.getState().active;
      let droneEase = 0;

      if (droneOn) {
        const t = (timestamp - droneStart) / 1000;
        const blend = easeInOutCubic(Math.min(t / DRONE_TRANSITION_SEC, 1));
        const osc = DRONE_OSC_MID + DRONE_OSC_AMP * Math.cos((2 * Math.PI * t) / DRONE_PERIOD_SEC);
        const elev = lerp(droneStartElev, osc, blend);
        const az = lerp(droneStartAz, DRONE_AZIMUTH_DEG, blend);

        useGLParams.getState().set('camElevationDeg', elev);
        useGLParams.getState().set('camAzimuthDeg', az);
        droneLastElev = elev;
        droneLastAz = az;
        droneEase = blend;
      } else if (droneExit) {
        const e = easeInOutCubic(Math.min((timestamp - droneExit.start) / (DRONE_TRANSITION_SEC * 1000), 1));

        useGLParams.getState().set('camElevationDeg', lerp(droneExit.fromElev, droneSavedElevation, e));
        useGLParams.getState().set('camAzimuthDeg', lerp(droneExit.fromAz, droneSavedAzimuth, e));

        if (e >= 1) droneExit = null;
      }

      if (droneOn) {
        const f = delta / 1000;

        glScene.pan(DRONE_PAN_SPEED * f * droneEase, DRONE_PAN_SPEED * f * droneEase);
      }

      // Edge-scroll: hold the cursor near a screen edge to pan the map.
      if (!dragging && !boxSelecting && mouseX >= 0 && !droneOn) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        let ex = 0;
        let ey = 0;

        if (mouseX < EDGE_PAN_MARGIN) ex = (EDGE_PAN_MARGIN - mouseX) / EDGE_PAN_MARGIN;
        else if (mouseX > w - EDGE_PAN_MARGIN) ex = -(mouseX - (w - EDGE_PAN_MARGIN)) / EDGE_PAN_MARGIN;

        if (mouseY < EDGE_PAN_MARGIN) ey = (EDGE_PAN_MARGIN - mouseY) / EDGE_PAN_MARGIN;
        else if (mouseY > h - EDGE_PAN_MARGIN) ey = -(mouseY - (h - EDGE_PAN_MARGIN)) / EDGE_PAN_MARGIN;

        if (ex !== 0 || ey !== 0) glScene.pan(ex * EDGE_PAN_SPEED, ey * EDGE_PAN_SPEED);
      }

      const p = useGLParams.getState();
      const { game, ui } = useStore.getState();
      const sky = computeSky(game.tick, p.dayLengthSec, p.sunIntensity, p.hemiIntensity);
      glScene.applySky(sky);
      useWorldClock.getState().update(sky);
      glScene.syncEntities(game.buildings, game.units, new Set(ui.selectedUnitIds), delta / 1000);
      glScene.setSelectedBuilding(ui.selectedBuildingId);

      glScene.render();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      registerZoom(null);
      if (useDrone.getState().active) useDrone.getState().set(false);
      unsubMap();
      unsubParams();
      unsubDrone();
      unsubSel();
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('mouseleave', onMouseLeave);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      glScene.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', cursor: 'grab', userSelect: 'none' }}
    />
  );
};
