import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { screenToGrid, screenToWorld, worldToScreen, gridToWorld, isWithinBounds } from '../game/isoMath';
import { CAMERA_ZOOM_STEP_IN, CAMERA_ZOOM_STEP_OUT, MIN_DRAG_DISTANCE, ANIMATION_FRAME_SIZE, SPRITE_Y_OFFSET, TILE_H } from '../game/constants';
import type { Unit, CameraState, Building } from '../game/types';
import { BuildingType } from '../game/types';
import { canPlaceBuilding, BUILDING_FOOTPRINT } from '../game/buildingConfig';
import { findRoadPath } from '../game/pathfinding';
import { placementPreview, roadPreview } from '../renderer/placementPreview';
import { foodHover, stoneHover } from '../renderer/layers/ResourceLayer';

const SPRITE_HIT = ANIMATION_FRAME_SIZE['idle'];

const findUnitAtWorld = (
  worldX: number,
  worldY: number,
  units: Record<string, Unit>,
): string | undefined => {
  const sorted = Object.values(units).sort((a, b) => (b.row + b.col) - (a.row + a.col));

  for (const unit of sorted) {
    const col = unit.prevCol + (unit.col - unit.prevCol) * unit.moveProgress;
    const row = unit.prevRow + (unit.row - unit.prevRow) * unit.moveProgress;
    const { x: wx, y: wy } = gridToWorld(col, row);

    if (
      worldX >= wx - SPRITE_HIT.width / 2 &&
      worldX <= wx + SPRITE_HIT.width / 2 &&
      worldY >= wy - SPRITE_HIT.height + SPRITE_Y_OFFSET &&
      worldY <= wy + SPRITE_Y_OFFSET
    ) {
      return unit.id;
    }
  }

  return undefined;
};

// World-space hit sizes match what BuildingLayer renders.
const BUILDING_HIT_SIZE: Partial<Record<BuildingType, { w: number; h: number }>> = {
  [BuildingType.LumberCamp]: { w: 64, h: 96 },
  [BuildingType.Storehouse]: { w: 64, h: 213 },
  [BuildingType.WoodCutter]: { w: 64, h: 96 },
};

const findBuildingAtWorld = (
  worldX: number,
  worldY: number,
  buildings: Record<string, Building>,
): Building | undefined => {
  for (const building of Object.values(buildings)) {
    if (building.constructionProgress < 100) continue;

    const size = BUILDING_HIT_SIZE[building.type];

    if (!size) continue;
    const [fcols, frows] = BUILDING_FOOTPRINT[building.type] ?? [1, 1];
    const { x: wx, y: wyBase } = gridToWorld(building.col, building.row);
    const anchorY = wyBase + (fcols + frows - 1) * TILE_H / 2;

    if (
      worldX >= wx - size.w / 2 &&
      worldX <= wx + size.w / 2 &&
      worldY >= anchorY - size.h &&
      worldY <= anchorY
    ) return building;
  }

  return undefined;
};

const findUnitsInScreenBox = (
  x1: number, y1: number, x2: number, y2: number,
  units: Record<string, Unit>,
  camera: CameraState,
): string[] => {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  return Object.values(units)
    .filter(unit => {
      const col = unit.prevCol + (unit.col - unit.prevCol) * unit.moveProgress;
      const row = unit.prevRow + (unit.row - unit.prevRow) * unit.moveProgress;
      const { x: worldX, y: worldY } = gridToWorld(col, row);
      const { x: screenX, y: screenY } = worldToScreen(
        worldX, worldY, camera.x, camera.y, camera.zoom, camera.screenWidth, camera.screenHeight,
      );
      return screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY;
    })
    .map(unit => unit.id);
};

export const useCamera = (canvas: React.RefObject<HTMLCanvasElement | null>): void => {
  const { panCamera, zoomCamera, setScreenSize, selectTile, selectUnits, selectBuildingType, selectBuilding, setSelectionBox, moveUnitTo, commandGather, placeBuilding, placeRoadPath, rebuildOccupants, toggleDebug } = useStore();
  const isDragging = useRef(false);
  const isShiftSelecting = useRef(false);
  const lastRoadCursorKey = useRef<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  useEffect(() => {
    rebuildOccupants();
  }, [rebuildOccupants]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      hasMoved.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY };
      lastPos.current = { x: e.clientX, y: e.clientY };

      const { ui, camera: cam } = useStore.getState();

      if (ui.selectedBuildingType === BuildingType.Road) {
        const { col, row } = screenToGrid(e.clientX, e.clientY, cam.x, cam.y, cam.zoom, cam.screenWidth, cam.screenHeight);

        if (!roadPreview.hasAnchor) {
          roadPreview.hasAnchor = true;
          roadPreview.anchorCol = col;
          roadPreview.anchorRow = row;
          roadPreview.path = [];
          roadPreview.active = true;
        } else {
          placeRoadPath(roadPreview.path);
          roadPreview.anchorCol = col;
          roadPreview.anchorRow = row;
          roadPreview.path = [];
          lastRoadCursorKey.current = null;
        }

        return;
      }

      if (e.shiftKey) {
        isShiftSelecting.current = true;
      } else {
        isDragging.current = true;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const totalDx = e.clientX - dragStart.current.x;
      const totalDy = e.clientY - dragStart.current.y;
      if (Math.abs(totalDx) > MIN_DRAG_DISTANCE || Math.abs(totalDy) > MIN_DRAG_DISTANCE) {
        hasMoved.current = true;
      }

      const { ui, camera: cam, game } = useStore.getState();
      const { col, row } = screenToGrid(e.clientX, e.clientY, cam.x, cam.y, cam.zoom, cam.screenWidth, cam.screenHeight);
      const mouseWorld = screenToWorld(e.clientX, e.clientY, cam.x, cam.y, cam.zoom, cam.screenWidth, cam.screenHeight);
      foodHover.active = true;
      foodHover.worldX = mouseWorld.x;
      foodHover.worldY = mouseWorld.y;
      stoneHover.active = true;
      stoneHover.worldX = mouseWorld.x;
      stoneHover.worldY = mouseWorld.y;

      if (ui.selectedBuildingType === BuildingType.Road) {
        placementPreview.active = false;
        roadPreview.active = true;

        const cursorKey = `${col},${row}`;
        if (cursorKey !== lastRoadCursorKey.current) {
          lastRoadCursorKey.current = cursorKey;

          if (roadPreview.hasAnchor && (col !== roadPreview.anchorCol || row !== roadPreview.anchorRow)) {
            roadPreview.path = findRoadPath(game.map, roadPreview.anchorCol, roadPreview.anchorRow, col, row);
          } else if (!roadPreview.hasAnchor) {
            roadPreview.path = [{ col, row }];
          }
        }

        return;
      }

      roadPreview.active = false;
      roadPreview.hasAnchor = false;

      if (ui.selectedBuildingType) {
        placementPreview.active = true;
        placementPreview.col = col;
        placementPreview.row = row;
        placementPreview.valid = isWithinBounds(col, row) && canPlaceBuilding(ui.selectedBuildingType, col, row, game.map.tiles, game.buildings);
      } else {
        placementPreview.active = false;
      }

      if (isShiftSelecting.current && hasMoved.current) {
        setSelectionBox({ x1: dragStart.current.x, y1: dragStart.current.y, x2: e.clientX, y2: e.clientY });
        return;
      }

      if (!isDragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      panCamera(dx, dy);
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseLeave = () => { placementPreview.active = false; roadPreview.active = false; foodHover.active = false; stoneHover.active = false; };

    const onMouseUp = (e: MouseEvent) => {
      if (isShiftSelecting.current) {
        isShiftSelecting.current = false;
        setSelectionBox(null);

        const { game, ui, camera } = useStore.getState();

        if (hasMoved.current) {
          const ids = findUnitsInScreenBox(
            dragStart.current.x, dragStart.current.y, e.clientX, e.clientY,
            game.units, camera,
          );
          selectUnits([...new Set([...ui.selectedUnitIds, ...ids])]);
        } else {
          // shift+click: toggle one unit
          const worldPos = screenToWorld(e.clientX, e.clientY, camera.x, camera.y, camera.zoom, camera.screenWidth, camera.screenHeight);
          const clickedUnitId = findUnitAtWorld(worldPos.x, worldPos.y, game.units);
          if (clickedUnitId) {
            const alreadySelected = ui.selectedUnitIds.includes(clickedUnitId);
            selectUnits(
              alreadySelected
                ? ui.selectedUnitIds.filter(id => id !== clickedUnitId)
                : [...ui.selectedUnitIds, clickedUnitId],
            );
          }
        }
      }

      if (isDragging.current && !hasMoved.current) {
        const { camera, game, ui } = useStore.getState();
        const { col, row } = screenToGrid(e.clientX, e.clientY, camera.x, camera.y, camera.zoom, camera.screenWidth, camera.screenHeight);

        // Building placement takes priority over all other click actions
        if (ui.selectedBuildingType && ui.selectedBuildingType !== BuildingType.Road) {
          const placed = isWithinBounds(col, row) && canPlaceBuilding(ui.selectedBuildingType, col, row, game.map.tiles, game.buildings);
          if (placed) {
            placeBuilding(ui.selectedBuildingType, col, row);
            selectBuildingType(null);
            placementPreview.active = false;
          }
        } else {
          const worldPos = screenToWorld(e.clientX, e.clientY, camera.x, camera.y, camera.zoom, camera.screenWidth, camera.screenHeight);
          const clickedUnitId = findUnitAtWorld(worldPos.x, worldPos.y, game.units);

          if (clickedUnitId) {
            const isOnlySelected = ui.selectedUnitIds.length === 1 && ui.selectedUnitIds[0] === clickedUnitId;
            selectUnits(isOnlySelected ? [] : [clickedUnitId]);
          } else if (isWithinBounds(col, row)) {
            if (ui.selectedUnitIds.length > 0) {
              const tile = game.map.tiles[`${col},${row}`];

              if (tile?.hasResource) {
                commandGather(ui.selectedUnitIds, col, row);
              } else {
                ui.selectedUnitIds.forEach((id, index) => moveUnitTo(id, col, row, index * 2));
              }

              if (!e.metaKey) selectUnits([]);
            } else {
              const clickedBuilding = findBuildingAtWorld(worldPos.x, worldPos.y, game.buildings);

              if (clickedBuilding) {
                selectBuilding(clickedBuilding.id);
              } else {
                selectBuilding(null);
                selectTile(col, row);
              }
            }
          } else {
            selectBuilding(null);
            selectTile(null, null);
            selectUnits([]);
          }
        }
      }

      isDragging.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? CAMERA_ZOOM_STEP_IN : CAMERA_ZOOM_STEP_OUT;
      zoomCamera(factor, e.clientX, e.clientY);
    };

    const onResize = () => {
      setScreenSize(window.innerWidth, window.innerHeight);
      el.width = window.innerWidth;
      el.height = window.innerHeight;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') toggleDebug();
    };

    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [canvas, panCamera, zoomCamera, setScreenSize, selectTile, selectUnits, selectBuildingType, selectBuilding, setSelectionBox, moveUnitTo, commandGather, placeBuilding, placeRoadPath, toggleDebug]);
};
