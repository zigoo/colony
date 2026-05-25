import type { Building, CameraState } from '../../game/types';
import { BuildingType, BuildingStage } from '../../game/types';
import { gridToWorld } from '../../game/isoMath';
import { TILE_H, STOREHOUSE_MAX_ITEMS } from '../../game/constants';
import { getBuildingSprite } from '../sprites/BuildingLoader';
import { BUILDING_FOOTPRINT } from '../../game/buildingConfig';
import { placementPreview } from '../placementPreview';

const STOREHOUSE_SRC_H  = 1024;
const STOREHOUSE_DEST_W = 64;
const STOREHOUSE_DEST_H = 213; // aspect ratio: 64 * 1024 / ~307 ≈ 213

// Measured pixel boundaries — sprites are NOT equal width (w=259..306, growing).
// Split points chosen at gap midpoints so every frame captures its full content.
const STOREHOUSE_FRAME_RECTS: Array<{ sx: number; sw: number }> = [
  { sx: 0,    sw: 293 },   // frame 0 content: 17–275
  { sx: 293,  sw: 301 },   // frame 1 content: 311–581
  { sx: 594,  sw: 297 },   // frame 2 content: 607–879
  { sx: 891,  sw: 300 },   // frame 3 content: 903–1182
  { sx: 1191, sw: 345 },   // frame 4 content: 1201–1506
];

const storehouseFrameRect = (frame: number) => STOREHOUSE_FRAME_RECTS[frame];

const getStorehouseFrame = (building: Building): number => {
  const total = Object.values(building.inventory).reduce((sum, v) => sum + (v ?? 0), 0);
  if (total === 0) return 0;
  if (total <= STOREHOUSE_MAX_ITEMS * 0.25) return 1;
  if (total <= STOREHOUSE_MAX_ITEMS * 0.5)  return 2;
  if (total <= STOREHOUSE_MAX_ITEMS * 0.75) return 3;

  return 4;
};

type StageRenderConfig = {
  key: string;
  srcW: number;
  srcH: number;
  destW: number;
  destH: number;
  frames: number;
  fps: number;
};

// Per building-type, per stage: which sprite + how to render it.
// frames=1 → static sprite (frame always 0), frames>1 → animated sheet.
// BuildingTypes without a config entry are silently skipped in renderBuildings.
const STAGE_CONFIG: Partial<Record<BuildingType, Record<BuildingStage, StageRenderConfig>>> = {
  [BuildingType.LumberCamp]: {
    [BuildingStage.Unoccupied]: { key: 'sawmill_unoccupied', srcW: 1024, srcH: 1024, destW: 64, destH: 96, frames: 1, fps: 1 },
    [BuildingStage.Settled]:    { key: 'sawmill_settled',    srcW: 1024, srcH: 1024, destW: 64, destH: 96, frames: 1, fps: 1 },
    [BuildingStage.Working]:    { key: 'sawmill_working',    srcW: 64,   srcH: 96,   destW: 64, destH: 96, frames: 11, fps: 11 },
  },
};

const footprintAnchorY = (type: BuildingType, wy: number): number => {
  const [fcols, frows] = BUILDING_FOOTPRINT[type] ?? [1, 1];
  return wy + (fcols + frows - 1) * TILE_H / 2;
};

const getBuildingStage = (building: Building): BuildingStage => {
  if (building.workerIds.length > 0) return BuildingStage.Working;
  if (Object.values(building.inventory).some(v => (v ?? 0) > 0)) return BuildingStage.Settled;
  return BuildingStage.Unoccupied;
};

export const renderPlacementPreview = (
  ctx: CanvasRenderingContext2D,
  selectedBuildingType: BuildingType | null,
  timestamp: number,
): void => {
  if (!selectedBuildingType || !placementPreview.active) return;

  const { col, row } = placementPreview;
  const { x: wx, y: wy } = gridToWorld(col, row);
  const anchorY = footprintAnchorY(selectedBuildingType, wy);

  ctx.save();
  ctx.globalAlpha = 0.72;

  if (selectedBuildingType === BuildingType.Storehouse) {
    const img = getBuildingSprite('storehouse_sheet');
    if (!img?.complete) { ctx.restore(); return; }
    const destX = wx - STOREHOUSE_DEST_W / 2;
    const destY = anchorY - STOREHOUSE_DEST_H;
    const { sx: psx, sw: psw } = storehouseFrameRect(0);
    ctx.drawImage(img, psx, 0, psw, STOREHOUSE_SRC_H, destX, destY, STOREHOUSE_DEST_W, STOREHOUSE_DEST_H);
    if (!placementPreview.valid) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = 'rgb(220, 40, 40)';
      ctx.fillRect(destX, destY, STOREHOUSE_DEST_W, STOREHOUSE_DEST_H);
    }
    ctx.restore();
    return;
  }

  const cfg = STAGE_CONFIG[selectedBuildingType]?.[BuildingStage.Unoccupied];
  if (!cfg) { ctx.restore(); return; }

  const img = getBuildingSprite(cfg.key);
  if (!img?.complete) { ctx.restore(); return; }

  const frame = cfg.frames > 1 ? Math.floor(timestamp / (1000 / cfg.fps)) % cfg.frames : 0;
  const destX = wx - cfg.destW / 2;
  const destY = anchorY - cfg.destH;
  ctx.drawImage(img, frame * cfg.srcW, 0, cfg.srcW, cfg.srcH, destX, destY, cfg.destW, cfg.destH);

  if (!placementPreview.valid) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = 'rgb(220, 40, 40)';
    ctx.fillRect(destX, destY, cfg.destW, cfg.destH);
  }
  ctx.restore();
};

export const renderBuildings = (
  ctx: CanvasRenderingContext2D,
  buildings: Record<string, Building>,
  timestamp: number,
  _camera: CameraState,
): void => {
  const sorted = Object.values(buildings).sort((a, b) => (a.row + a.col) - (b.row + b.col));

  for (const building of sorted) {
    if (building.constructionProgress < 100) continue;

    const { x: wx, y: wy } = gridToWorld(building.col, building.row);
    const anchorY = footprintAnchorY(building.type, wy);

    if (building.type === BuildingType.Storehouse) {
      const img = getBuildingSprite('storehouse_sheet');
      if (!img?.complete) continue;
      const frame = getStorehouseFrame(building);
      const { sx, sw } = storehouseFrameRect(frame);
      ctx.drawImage(
        img,
        sx, 0, sw, STOREHOUSE_SRC_H,
        wx - STOREHOUSE_DEST_W / 2, anchorY - STOREHOUSE_DEST_H,
        STOREHOUSE_DEST_W, STOREHOUSE_DEST_H,
      );
      continue;
    }

    const stage = getBuildingStage(building);
    const cfg = STAGE_CONFIG[building.type]?.[stage];
    if (!cfg) continue;

    const img = getBuildingSprite(cfg.key);
    if (!img?.complete) continue;

    const frame = cfg.frames > 1
      ? Math.floor(timestamp / (1000 / cfg.fps)) % cfg.frames
      : 0;

    ctx.drawImage(
      img,
      frame * cfg.srcW, 0, cfg.srcW, cfg.srcH,
      wx - cfg.destW / 2, anchorY - cfg.destH,
      cfg.destW, cfg.destH,
    );
  }
};
