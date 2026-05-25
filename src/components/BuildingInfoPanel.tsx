import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';
import { BuildingType, ResourceType } from '../game/types';
import { STOREHOUSE_MAX_ITEMS, TILE_H } from '../game/constants';
import { gridToWorld, worldToScreen } from '../game/isoMath';
import { BUILDING_FOOTPRINT } from '../game/buildingConfig';

const PANEL_W = 190;

const BUILDING_LABEL: Record<BuildingType, string> = {
  [BuildingType.LumberCamp]: 'Lumber Camp',
  [BuildingType.Quarry]:     'Quarry',
  [BuildingType.Farm]:       'Farm',
  [BuildingType.Settlement]: 'Settlement',
  [BuildingType.Road]:       'Road',
  [BuildingType.Storehouse]: 'Storehouse',
};

const RESOURCE_ICON: Partial<Record<ResourceType, string>> = {
  [ResourceType.Wood]:  '🪵',
  [ResourceType.Stone]: '🪨',
  [ResourceType.Food]:  '🌾',
  [ResourceType.Ore]:   '⛏️',
};

// Sprite half-widths — must match BuildingLayer constants.
const BUILDING_SPRITE_HALF_W: Partial<Record<BuildingType, number>> = {
  [BuildingType.LumberCamp]: 32,
  [BuildingType.Storehouse]: 32,
};

const BUILDING_SPRITE_H: Partial<Record<BuildingType, number>> = {
  [BuildingType.LumberCamp]: 96,
  [BuildingType.Storehouse]: 213,
};

const panelStyle: React.CSSProperties = {
  background: 'rgba(20, 20, 50, 0.92)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  fontFamily: 'monospace',
  color: '#fff',
  width: PANEL_W,
  boxSizing: 'border-box',
  userSelect: 'none',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '7px 10px 6px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  cursor: 'grab',
};

const bodyStyle: React.CSSProperties = {
  padding: '8px 12px 10px',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.45)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
};

const divider: React.CSSProperties = {
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  margin: '6px 0',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 13,
  marginBottom: 3,
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.4)',
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
  padding: 0,
  flexShrink: 0,
};

const fillBarOuter: React.CSSProperties = {
  height: 5,
  borderRadius: 3,
  background: 'rgba(255,255,255,0.1)',
  overflow: 'hidden',
  marginTop: 4,
};

export const BuildingInfoPanel = () => {
  const selectedBuildingId = useStore(s => s.ui.selectedBuildingId);
  const selectBuilding     = useStore(s => s.selectBuilding);
  const building           = useStore(s => selectedBuildingId ? s.game.buildings[selectedBuildingId] : null);
  const camera             = useStore(s => s.camera);

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragging   = useRef(false);
  const dragStart  = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  // Reset drag offset whenever a new building is selected.
  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
  }, [selectedBuildingId]);

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: dragOffset.x, oy: dragOffset.y };
  }, [dragOffset]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setDragOffset({
        x: dragStart.current.ox + e.clientX - dragStart.current.mx,
        y: dragStart.current.oy + e.clientY - dragStart.current.my,
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (!building) return null;

  // Compute building anchor in screen space.
  const { x: wx, y: wyBase } = gridToWorld(building.col, building.row);
  const [fcols, frows] = BUILDING_FOOTPRINT[building.type] ?? [1, 1];
  const anchorY = wyBase + (fcols + frows - 1) * TILE_H / 2;
  const { x: screenX, y: screenY } = worldToScreen(wx, anchorY, camera.x, camera.y, camera.zoom, camera.screenWidth, camera.screenHeight);

  const spriteHalfW = (BUILDING_SPRITE_HALF_W[building.type] ?? 32) * camera.zoom;
  const spriteH     = (BUILDING_SPRITE_H[building.type] ?? 96) * camera.zoom;
  const margin      = 12;

  // Default: right of sprite; fall back to left if it would overflow.
  const baseLeft = screenX + spriteHalfW + margin + PANEL_W <= camera.screenWidth
    ? screenX + spriteHalfW + margin
    : screenX - spriteHalfW - margin - PANEL_W;

  // Vertically centered on the sprite's visual midpoint.
  const spriteTop    = screenY - spriteH;
  const baseMidY     = spriteTop + spriteH / 2;
  const PANEL_H_EST  = 220;
  const baseTop      = baseMidY - PANEL_H_EST / 2;

  const left = baseLeft + dragOffset.x;
  const top  = baseTop  + dragOffset.y;

  const label    = BUILDING_LABEL[building.type] ?? building.type;
  const inventory = Object.entries(building.inventory) as [ResourceType, number][];
  const hasItems  = inventory.some(([, v]) => v > 0);
  const total     = inventory.reduce((s, [, v]) => s + (v ?? 0), 0);
  const isStore   = building.type === BuildingType.Storehouse;
  const fillPct   = isStore ? Math.round((total / STOREHOUSE_MAX_ITEMS) * 100) : null;

  return (
    <div style={{ position: 'fixed', left, top, zIndex: 20, ...panelStyle }}>

      {/* Draggable header */}
      <div style={headerStyle} onMouseDown={onHeaderMouseDown}>
        <span style={{ fontSize: 13, fontWeight: 'bold' }}>{label}</span>
        <button style={closeBtn} onMouseDown={e => e.stopPropagation()} onClick={() => selectBuilding(null)}>✕</button>
      </div>

      <div style={bodyStyle}>

        {/* Level + workers */}
        <div style={rowStyle}>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>Level</span>
          <span>{building.level}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>Workers</span>
          <span style={{ color: building.workerIds.length > 0 ? '#7dda7d' : 'rgba(255,255,255,0.35)' }}>
            {building.workerIds.length > 0 ? `${building.workerIds.length} assigned` : 'none'}
          </span>
        </div>

        {/* Construction progress */}
        {building.constructionProgress < 100 && (
          <div style={rowStyle}>
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>Construction</span>
            <span style={{ color: '#f0c060' }}>{building.constructionProgress}%</span>
          </div>
        )}

        {/* Inventory */}
        {hasItems && (
          <>
            <div style={divider} />
            <div style={labelStyle}>Inventory</div>
            {inventory.map(([type, amount]) => {
              if (!amount) return null;

              return (
                <div key={type} style={rowStyle}>
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {RESOURCE_ICON[type] ?? ''} {type}
                  </span>
                  <span>{amount}</span>
                </div>
              );
            })}
          </>
        )}

        {/* Storehouse capacity */}
        {isStore && (
          <>
            <div style={divider} />
            <div style={rowStyle}>
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>Capacity</span>
              <span style={{ color: fillPct! >= 100 ? '#e05050' : fillPct! >= 75 ? '#f0c060' : '#7dda7d' }}>
                {total} / {STOREHOUSE_MAX_ITEMS}
              </span>
            </div>
            <div style={fillBarOuter}>
              <div style={{
                height: '100%',
                width: `${fillPct}%`,
                borderRadius: 3,
                background: fillPct! >= 100 ? '#e05050' : fillPct! >= 75 ? '#f0c060' : '#5aaa5a',
                transition: 'width 0.2s',
              }} />
            </div>
          </>
        )}

      </div>
    </div>
  );
};
