import type { Building, CameraState } from '../../game/types';
import { BuildingType, BuildingStage } from '../../game/types';
import { gridToWorld } from '../../game/isoMath';
import { TILE_H, STOREHOUSE_MAX_ITEMS } from '../../game/constants';
import { getBuildingSprite } from '../sprites/BuildingLoader';
import { BUILDING_FOOTPRINT, CONSTRUCTION_TICKS } from '../../game/buildingConfig';
import { placementPreview } from '../placementPreview';

const STOREHOUSE_SRC_H  = 1024;
const STOREHOUSE_DEST_W = 96;
const STOREHOUSE_DEST_H = 320; // aspect ratio: 96 * 1024 / ~307 ≈ 320

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
    [BuildingStage.Unoccupied]: { key: 'sawmill_unoccupied', srcW: 512, srcH: 768, destW: 96, destH: 144, frames: 1, fps: 1 },
    [BuildingStage.Settled]:    { key: 'sawmill_settled',    srcW: 512, srcH: 768, destW: 96, destH: 144, frames: 1, fps: 1 },
    [BuildingStage.Working]:    { key: 'sawmill_working',    srcW: 512, srcH: 768, destW: 96, destH: 144, frames: 8, fps: 8 },
  },
  [BuildingType.WoodCutter]: {
    [BuildingStage.Unoccupied]: { key: 'woodcutter_unoccupied', srcW: 512, srcH: 768, destW: 96, destH: 144, frames: 1, fps: 1 },
    [BuildingStage.Settled]:    { key: 'woodcutter_settled',    srcW: 512, srcH: 768, destW: 96, destH: 144, frames: 1, fps: 1 },
    [BuildingStage.Working]:    { key: 'woodcutter_working',    srcW: 512, srcH: 768, destW: 96, destH: 144, frames: 8, fps: 8 },
  },
  [BuildingType.Farm]: {
    [BuildingStage.Unoccupied]: { key: 'farm_unoccupied', srcW: 512, srcH: 768, destW: 96, destH: 144, frames: 1, fps: 1 },
    [BuildingStage.Settled]:    { key: 'farm_settled',    srcW: 512, srcH: 768, destW: 96, destH: 144, frames: 1, fps: 1 },
    [BuildingStage.Working]:    { key: 'farm_working',    srcW: 512, srcH: 768, destW: 96, destH: 144, frames: 8, fps: 8 },
  },
};

const footprintAnchorY = (type: BuildingType, wy: number): number => {
  const [fcols, frows] = BUILDING_FOOTPRINT[type] ?? [1, 1];
  return wy + (fcols + frows - 1) * TILE_H / 2;
};

const getBuildingStage = (building: Building): BuildingStage => {
  if (building.workerIds.length === 0) return BuildingStage.Unoccupied;
  if (building.type === BuildingType.WoodCutter) return BuildingStage.Working;
  if (building.productionProgress > 0) return BuildingStage.Working;
  return BuildingStage.Settled;
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

  if (!cfg) {
    ctx.restore();
    drawMissingSprite(ctx, wx, anchorY);
    if (!placementPreview.valid) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'rgb(220,40,40)';
      ctx.fillRect(wx - 24, anchorY - 48, 48, 48);
      ctx.restore();
    }
    return;
  }

  const img = getBuildingSprite(cfg.key);
  if (!img?.complete) {
    ctx.restore();
    drawMissingSprite(ctx, wx, anchorY);
    return;
  }

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

const drawMissingSprite = (ctx: CanvasRenderingContext2D, wx: number, anchorY: number): void => {
  const w = 48, h = 48;
  ctx.save();
  ctx.fillStyle = 'rgba(200,30,30,0.85)';
  ctx.strokeStyle = 'rgba(255,80,80,0.9)';
  ctx.lineWidth = 2;
  ctx.fillRect(wx - w / 2, anchorY - h, w, h);
  ctx.strokeRect(wx - w / 2, anchorY - h, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', wx, anchorY - h / 2);
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
    const { x: wx, y: wy } = gridToWorld(building.col, building.row);
    const anchorY = footprintAnchorY(building.type, wy);
    const constructionMax = CONSTRUCTION_TICKS[building.type] ?? 0;
    const underConstruction = constructionMax > 0 && building.constructionProgress < constructionMax;

    if (underConstruction) {
      const pct   = building.constructionProgress / constructionMax;
      const stage = pct < 0.5 ? 1 : 2;
      const cImg  = getBuildingSprite(`construction_${stage}`);
      const srcW  = 512, srcH = 768, frames = 4, fps = 4;
      const dW    = 96,  dH   = 144;
      const dX    = wx - dW / 2;
      const dY    = anchorY - dH;

      if (cImg?.complete && cImg.naturalWidth > 0) {
        const frame = Math.floor(timestamp / (1000 / fps)) % frames;
        ctx.drawImage(cImg, frame * srcW, 0, srcW, srcH, dX, dY, dW, dH);
      } else {
        // Programmatic scaffold fallback (shown before image loads)
        ctx.save();
        ctx.strokeStyle = '#c8a020';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(dX + 4, dY + 4, dW - 8, dH - 8);
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Progress bar in world space (scales with zoom)
      const barW = 48, barH = 5;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(wx - barW / 2, dY - 9, barW, barH);
      ctx.fillStyle = '#f0c060';
      ctx.fillRect(wx - barW / 2, dY - 9, Math.round(barW * pct), barH);
      ctx.restore();
      continue;
    }

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

    if (!cfg) {
      drawMissingSprite(ctx, wx, anchorY);
      continue;
    }

    const img = getBuildingSprite(cfg.key);
    if (!img?.complete) {
      drawMissingSprite(ctx, wx, anchorY);
      continue;
    }

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
