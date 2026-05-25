import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';
import { BuildingType, ResourceType, UnitState } from '../game/types';
import { STOREHOUSE_MAX_ITEMS, TILE_H } from '../game/constants';
import { gridToWorld, worldToScreen } from '../game/isoMath';
import { BUILDING_FOOTPRINT, getWorkerCapacity, getCurrentOutput, getEfficiency, BUILDING_LEVEL_CONFIG, BUILDING_PRODUCTION } from '../game/buildingConfig';

const PANEL_W = 200;

const BUILDING_LABEL: Record<BuildingType, string> = {
  [BuildingType.LumberCamp]: 'Lumber Camp',
  [BuildingType.Quarry]:     'Quarry',
  [BuildingType.Farm]:       'Farm',
  [BuildingType.Settlement]: 'Settlement',
  [BuildingType.Road]:       'Road',
  [BuildingType.Storehouse]: 'Storehouse',
  [BuildingType.WoodCutter]: 'Woodcutter',
};

const RESOURCE_ICON: Partial<Record<ResourceType, string>> = {
  [ResourceType.Wood]:   '🪵',
  [ResourceType.Stone]:  '🪨',
  [ResourceType.Food]:   '🌾',
  [ResourceType.Ore]:    '⛏️',
  [ResourceType.Lumber]: '🪵',
  [ResourceType.Planks]: '🪚',
};

const BUILDING_SPRITE_HALF_W: Partial<Record<BuildingType, number>> = {
  [BuildingType.LumberCamp]: 32,
  [BuildingType.Storehouse]: 32,
  [BuildingType.WoodCutter]: 32,
};

const BUILDING_SPRITE_H: Partial<Record<BuildingType, number>> = {
  [BuildingType.LumberCamp]: 96,
  [BuildingType.Storehouse]: 213,
  [BuildingType.WoodCutter]: 96,
};

// ── styles ──────────────────────────────────────────────────────────────────

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
  margin: '7px 0',
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

const dismissBtn: React.CSSProperties = {
  background: 'rgba(220,80,80,0.18)',
  border: '1px solid rgba(220,80,80,0.4)',
  borderRadius: 4,
  color: 'rgba(220,120,120,0.9)',
  cursor: 'pointer',
  fontSize: 11,
  lineHeight: 1,
  padding: '1px 5px',
  fontFamily: 'monospace',
};

const fillBarOuter: React.CSSProperties = {
  height: 5,
  borderRadius: 3,
  background: 'rgba(255,255,255,0.1)',
  overflow: 'hidden',
  marginTop: 4,
};

// ── component ────────────────────────────────────────────────────────────────

export const BuildingInfoPanel = () => {
  const selectedBuildingId = useStore(s => s.ui.selectedBuildingId);
  const selectBuilding     = useStore(s => s.selectBuilding);
  const building           = useStore(s => selectedBuildingId ? s.game.buildings[selectedBuildingId] : null);
  const camera             = useStore(s => s.camera);
  const dismissWorker      = useStore(s => s.dismissWorker);
  const assignWorker       = useStore(s => s.assignWorker);
  const enRoute            = useStore(s =>
    selectedBuildingId
      ? Object.values(s.game.units).filter(u => u.reportingTo === selectedBuildingId).length
      : 0,
  );
  const hasFreeUnit        = useStore(s =>
    Object.values(s.game.units).some(u =>
      u.state === UnitState.Idle && !u.reportingTo && !u.assignedBuilding,
    ),
  );

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragging  = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

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

  // ── position ──────────────────────────────────────────────────────────────
  const { x: wx, y: wyBase } = gridToWorld(building.col, building.row);
  const [fcols, frows] = BUILDING_FOOTPRINT[building.type] ?? [1, 1];
  const anchorY = wyBase + (fcols + frows - 1) * TILE_H / 2;
  const { x: screenX, y: screenY } = worldToScreen(wx, anchorY, camera.x, camera.y, camera.zoom, camera.screenWidth, camera.screenHeight);

  const spriteHalfW = (BUILDING_SPRITE_HALF_W[building.type] ?? 32) * camera.zoom;
  const spriteH     = (BUILDING_SPRITE_H[building.type] ?? 96) * camera.zoom;
  const margin      = 12;
  const PANEL_H_EST = 260;

  const baseLeft = screenX + spriteHalfW + margin + PANEL_W <= camera.screenWidth
    ? screenX + spriteHalfW + margin
    : screenX - spriteHalfW - margin - PANEL_W;

  const baseTop = screenY - spriteH / 2 - PANEL_H_EST / 2;
  const left    = baseLeft + dragOffset.x;
  const top     = baseTop  + dragOffset.y;

  // ── derived data ──────────────────────────────────────────────────────────
  const label       = BUILDING_LABEL[building.type] ?? building.type;
  const prod        = BUILDING_PRODUCTION[building.type] ?? null;
  const prodKeys    = prod ? new Set([...Object.keys(prod.input), ...Object.keys(prod.output)]) : new Set<string>();
  const inventory   = (Object.entries(building.inventory) as [ResourceType, number][]).filter(([k]) => !prodKeys.has(k));
  const hasItems    = inventory.some(([, v]) => v > 0);
  const total       = inventory.reduce((s, [, v]) => s + (v ?? 0), 0);
  const isStore     = building.type === BuildingType.Storehouse;
  const fillPct     = isStore ? Math.round((total / STOREHOUSE_MAX_ITEMS) * 100) : null;

  const capacity    = getWorkerCapacity(building.type, building.level);
  const workers     = building.workerIds.length;
  const output      = getCurrentOutput(building.type, building.level, workers);
  const efficiency  = getEfficiency(building.type, building.level, workers);
  const effPct      = Math.round(efficiency * 100);
  const maxLevel    = (BUILDING_LEVEL_CONFIG[building.type]?.length ?? 1);
  const hasWorkers  = capacity > 0;

  const effColor = effPct >= 80 ? '#7dda7d' : effPct >= 40 ? '#f0c060' : '#e05050';

  return (
    <div style={{ position: 'fixed', left, top, zIndex: 20, ...panelStyle }}>

      {/* Draggable header */}
      <div style={headerStyle} onMouseDown={onHeaderMouseDown}>
        <span style={{ fontSize: 13, fontWeight: 'bold' }}>{label}</span>
        <button
          style={closeBtn}
          onMouseDown={e => e.stopPropagation()}
          onClick={() => selectBuilding(null)}
        >✕</button>
      </div>

      <div style={bodyStyle}>

        {/* Level */}
        <div style={rowStyle}>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>Level</span>
          <span>{building.level} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>/ {maxLevel}</span></span>
        </div>

        {/* Construction */}
        {building.constructionProgress < 100 && (
          <div style={rowStyle}>
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>Construction</span>
            <span style={{ color: '#f0c060' }}>{building.constructionProgress}%</span>
          </div>
        )}

        {/* Worker slots */}
        {hasWorkers && (
          <>
            <div style={divider} />
            <div style={labelStyle}>Workers</div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
              {Array.from({ length: capacity }).map((_, i) => {
                const filled  = i < workers;
                const pending = !filled && i < workers + enRoute;
                const canAssign = !filled && !pending && hasFreeUnit;

                return (
                  <div
                    key={i}
                    onClick={canAssign ? () => assignWorker(building.id) : undefined}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      background: filled ? 'rgba(80,160,80,0.25)' : pending ? 'rgba(200,160,40,0.18)' : canAssign ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                      border: filled ? '1.5px solid rgba(100,200,100,0.55)' : pending ? '1.5px solid rgba(220,180,60,0.5)' : canAssign ? '1.5px solid rgba(255,255,255,0.35)' : '1.5px solid rgba(255,255,255,0.12)',
                      cursor: canAssign ? 'pointer' : 'default',
                      opacity: !filled && !pending && !canAssign ? 0.4 : 1,
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    {filled ? '👤' : pending ? '🚶' : canAssign ? '👤' : ''}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              {Array.from({ length: capacity }).map((_, i) => (
                <div key={i} style={{ width: 30, display: 'flex', justifyContent: 'center' }}>
                  {i < workers && (
                    <button
                      style={dismissBtn}
                      onClick={() => dismissWorker(building.id)}
                    >−</button>
                  )}
                </div>
              ))}
            </div>

            {/* Output + efficiency */}
            <div style={rowStyle}>
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>Output</span>
              <span style={{ color: workers > 0 ? '#7dda7d' : 'rgba(255,255,255,0.3)' }}>
                {workers > 0 ? `${output}×` : '—'}
              </span>
            </div>

            <div style={rowStyle}>
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>Efficiency</span>
              <span style={{ color: workers > 0 ? effColor : 'rgba(255,255,255,0.3)' }}>
                {workers > 0 ? `${effPct}%` : '—'}
              </span>
            </div>

            {workers > 0 && (
              <div style={fillBarOuter}>
                <div style={{
                  height: '100%',
                  width: `${effPct}%`,
                  borderRadius: 3,
                  background: effColor,
                  transition: 'width 0.3s',
                }} />
              </div>
            )}
          </>
        )}

        {/* Production */}
        {prod && (
          <>
            <div style={divider} />
            <div style={labelStyle}>Production</div>

            {(Object.entries(prod.input) as [ResourceType, number][]).map(([res, needed]) => {
              const have = building.inventory[res] ?? 0;
              const cap  = prod.inputCapacity?.[res] ?? needed;

              return (
                <div key={res} style={rowStyle}>
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {RESOURCE_ICON[res] ?? ''} {res}
                  </span>
                  <span style={{ color: have >= needed ? '#7dda7d' : '#e05050' }}>
                    {have} / {cap}
                  </span>
                </div>
              );
            })}

            {(Object.entries(prod.output) as [ResourceType, number][]).map(([res, amount]) => {
              const buffered = building.inventory[res] ?? 0;
              const outCap   = prod.outputCapacity[res];
              const full     = outCap !== undefined && buffered >= outCap;

              return (
                <div key={res} style={rowStyle}>
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {RESOURCE_ICON[res] ?? ''} {res}
                  </span>
                  <span>
                    <span style={{ color: full ? '#e05050' : buffered > 0 ? '#e8c87a' : 'rgba(255,255,255,0.3)', marginRight: 4 }}>
                      {outCap !== undefined ? `${buffered} / ${outCap}` : buffered > 0 ? `${buffered} ready` : '—'}
                    </span>
                    {prod.cycleTime > 0 && (
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>+{amount}/cycle</span>
                    )}
                  </span>
                </div>
              );
            })}

            {workers > 0 && prod.cycleTime > 0 && (
              <>
                <div style={{ ...rowStyle, marginTop: 4 }}>
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>Progress</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
                    {building.productionProgress} / {prod.cycleTime}
                  </span>
                </div>
                <div style={fillBarOuter}>
                  <div style={{
                    height: '100%',
                    width: `${Math.round((building.productionProgress / prod.cycleTime) * 100)}%`,
                    borderRadius: 3,
                    background: building.productionProgress > 0 ? '#7abacc' : 'rgba(255,255,255,0.15)',
                    transition: 'width 0.2s',
                  }} />
                </div>
              </>
            )}
          </>
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
