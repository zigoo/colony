import { ResourceType } from '../../game/types';
import type { MapState } from '../../game/types';
import { gridToWorld } from '../../game/isoMath';

const DOT_COLOR: Partial<Record<ResourceType, string>> = {
  [ResourceType.Wood]:  '#4fc04f',
  [ResourceType.Stone]: '#aaaaaa',
  [ResourceType.Food]:  '#f0d050',
  [ResourceType.Ore]:   '#e07030',
};

export const renderDebugResourceDots = (ctx: CanvasRenderingContext2D, map: MapState): void => {
  for (const tile of Object.values(map.tiles)) {
    if (!tile.hasResource || tile.resourceType === ResourceType.None) continue;

    const { x, y } = gridToWorld(tile.col, tile.row);
    const color = DOT_COLOR[tile.resourceType] ?? '#ffffff';

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
};
