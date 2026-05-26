import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { BuildingType, ResourceType, UnitState } from '../game/types';
import { STOREHOUSE_CAPACITY_BY_LEVEL, CONSTRUCTION_MAX_WORKERS } from '../game/constants';
import {
  getWorkerCapacity, getCurrentOutput, getEfficiency, BUILDING_LEVEL_CONFIG,
  BUILDING_PRODUCTION, CONSTRUCTION_TICKS, BUILDING_CONSTRUCTION_MATERIALS, BUILDING_UPGRADE_COST,
} from '../game/buildingConfig';

const STOREHOUSE_FALLBACK_CAPACITY = 40;
const EFF_GOOD = 80;
const EFF_OK = 40;
const FILL_FULL = 100;
const FILL_HIGH = 75;

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

const panel: React.CSSProperties = {
  position: 'fixed',
  top: 8,
  right: 8,
  zIndex: 55,
  width: 210,
  maxHeight: 'calc(100vh - 16px)',
  overflowY: 'auto',
  background: 'rgba(20,24,30,0.88)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: '#e8eef6',
  font: '12px monospace',
  userSelect: 'none',
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px 6px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const body: React.CSSProperties = { padding: '8px 12px 10px' };
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 };
const label: React.CSSProperties = { color: 'rgba(255,255,255,0.5)' };
const groupLabel: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 };
const divider: React.CSSProperties = { borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '7px 0' };
const fillOuter: React.CSSProperties = { height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: 4 };

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
  cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0,
};

const dismissBtn: React.CSSProperties = {
  background: 'rgba(220,80,80,0.18)', border: '1px solid rgba(220,80,80,0.4)', borderRadius: 4,
  color: 'rgba(220,120,120,0.9)', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: '1px 5px', fontFamily: 'monospace',
};

const slot = (state: 'filled' | 'pending' | 'open' | 'locked'): React.CSSProperties => ({
  width: 30, height: 30, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
  background: state === 'filled' ? 'rgba(80,160,80,0.25)' : state === 'pending' ? 'rgba(200,160,40,0.18)' : state === 'open' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
  border: state === 'filled' ? '1.5px solid rgba(100,200,100,0.55)' : state === 'pending' ? '1.5px solid rgba(220,180,60,0.5)' : state === 'open' ? '1.5px solid rgba(255,255,255,0.35)' : '1.5px solid rgba(255,255,255,0.12)',
  cursor: state === 'open' ? 'pointer' : 'default',
  opacity: state === 'locked' ? 0.4 : 1,
});

const effColorFor = (pct: number): string => (pct >= EFF_GOOD ? '#7dda7d' : pct >= EFF_OK ? '#f0c060' : '#e05050');
const fillColorFor = (pct: number): string => (pct >= FILL_FULL ? '#e05050' : pct >= FILL_HIGH ? '#f0c060' : '#5aaa5a');

export const BuildingInfoPanelGL = () => {
  const { building, selectBuilding, assignWorker, dismissWorker, upgradeBuilding, enRoute, hasFreeUnit } = useStore(useShallow(s => ({
    building:        s.ui.selectedBuildingId ? s.game.buildings[s.ui.selectedBuildingId] : null,
    selectBuilding:  s.selectBuilding,
    assignWorker:    s.assignWorker,
    dismissWorker:   s.dismissWorker,
    upgradeBuilding: s.upgradeBuilding,
    enRoute:         s.ui.selectedBuildingId
      ? Object.values(s.game.units).filter(u => u.reportingTo === s.ui.selectedBuildingId).length
      : 0,
    hasFreeUnit:     Object.values(s.game.units).some(u => u.state === UnitState.Idle && !u.reportingTo && !u.assignedBuilding),
  })));

  if (!building) return null;

  const lbl = BUILDING_LABEL[building.type] ?? building.type;
  const maxLevel = BUILDING_LEVEL_CONFIG[building.type]?.length ?? 1;

  const constructionMax = CONSTRUCTION_TICKS[building.type] ?? 0;
  const underConstruction = constructionMax > 0 && building.constructionProgress < constructionMax;
  const constructionPct = underConstruction ? Math.round((building.constructionProgress / constructionMax) * 100) : 100;

  const capacity = underConstruction
    ? Math.max(getWorkerCapacity(building.type, building.level), CONSTRUCTION_MAX_WORKERS)
    : getWorkerCapacity(building.type, building.level);
  const workers = building.workerIds.length;
  const output = getCurrentOutput(building.type, building.level, workers);
  const effPct = Math.round(getEfficiency(building.type, building.level, workers) * 100);
  const hasWorkers = capacity > 0;

  const prod = BUILDING_PRODUCTION[building.type] ?? null;
  const prodKeys = prod ? new Set([...Object.keys(prod.input), ...Object.keys(prod.output)]) : new Set<string>();
  const inventory = (Object.entries(building.inventory) as [ResourceType, number][]).filter(([k, v]) => !prodKeys.has(k) && v > 0);
  const total = (Object.entries(building.inventory) as [ResourceType, number][]).reduce((s, [, v]) => s + (v ?? 0), 0);

  const isStore = building.type === BuildingType.Storehouse;
  const storeCap = isStore ? (STOREHOUSE_CAPACITY_BY_LEVEL[(building.level ?? 1) - 1] ?? STOREHOUSE_FALLBACK_CAPACITY) : 0;
  const fillPct = isStore ? Math.round((total / storeCap) * 100) : 0;

  const canUpgrade = building.level < maxLevel && !underConstruction;
  const upgradeCost = BUILDING_UPGRADE_COST[building.type]?.[building.level + 1];
  const canAffordUpgrade = !upgradeCost || (Object.entries(upgradeCost) as [ResourceType, number][])
    .every(([res, amount]) => (building.inventory[res] ?? 0) >= amount);

  const workerSlots = Array.from({ length: capacity }).map((_, i) => {
    const filled = i < workers;
    const pending = !filled && i < workers + enRoute;
    const open = !filled && !pending && hasFreeUnit;

    return { i, filled, pending, open };
  });

  return (
    <div style={panel}>
      <div style={header}>
        <span style={{ fontWeight: 'bold', fontSize: 13 }}>{lbl}</span>
        <button style={closeBtn} onClick={() => selectBuilding(null)}>✕</button>
      </div>

      <div style={body}>
        <div style={row}>
          <span style={label}>Level</span>
          <span>{building.level} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>/ {maxLevel}</span></span>
        </div>

        {underConstruction && (
          <>
            <div style={divider} />
            <div style={row}><span style={label}>Building…</span><span style={{ color: '#f0c060' }}>{constructionPct}%</span></div>
            <div style={fillOuter}><div style={{ height: '100%', width: `${constructionPct}%`, borderRadius: 3, background: '#f0c060' }} /></div>

            {(() => {
              const mats = Object.entries(BUILDING_CONSTRUCTION_MATERIALS[building.type] ?? {}) as [ResourceType, number][];

              if (mats.length === 0) return null;

              return (
                <div style={{ marginTop: 6 }}>
                  {mats.map(([res, needed]) => {
                    const have = building.inventory[res] ?? 0;

                    return (
                      <div key={res} style={{ ...row, fontSize: 12 }}>
                        <span style={label}>{RESOURCE_ICON[res] ?? ''} {res}</span>
                        <span style={{ color: have >= needed ? '#7dda7d' : '#e05050' }}>{have} / {needed}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
              {workers > 0 ? `${workers} worker${workers > 1 ? 's' : ''} constructing` : 'Assign a worker to build'}
            </div>
          </>
        )}

        {hasWorkers && (
          <>
            <div style={divider} />
            <div style={groupLabel}>Workers</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
              {workerSlots.map(({ i, filled, pending, open }) => (
                <div
                  key={i}
                  onClick={open ? () => assignWorker(building.id) : undefined}
                  style={slot(filled ? 'filled' : pending ? 'pending' : open ? 'open' : 'locked')}
                >
                  {filled ? (underConstruction ? '🔨' : '👤') : pending ? '🚶' : open ? (underConstruction ? '🔨' : '👤') : ''}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              {workerSlots.map(({ i, filled }) => (
                <div key={i} style={{ width: 30, display: 'flex', justifyContent: 'center' }}>
                  {filled && <button style={dismissBtn} onClick={() => dismissWorker(building.id)}>−</button>}
                </div>
              ))}
            </div>

            {!underConstruction && (
              <>
                <div style={row}>
                  <span style={label}>Output</span>
                  <span style={{ color: workers > 0 ? '#7dda7d' : 'rgba(255,255,255,0.3)' }}>{workers > 0 ? `${output}×` : '—'}</span>
                </div>
                <div style={row}>
                  <span style={label}>Efficiency</span>
                  <span style={{ color: workers > 0 ? effColorFor(effPct) : 'rgba(255,255,255,0.3)' }}>{workers > 0 ? `${effPct}%` : '—'}</span>
                </div>
                {workers > 0 && (
                  <div style={fillOuter}><div style={{ height: '100%', width: `${effPct}%`, borderRadius: 3, background: effColorFor(effPct) }} /></div>
                )}
              </>
            )}
          </>
        )}

        {prod && !underConstruction && (
          <>
            <div style={divider} />
            <div style={groupLabel}>Production</div>
            {(Object.entries(prod.input) as [ResourceType, number][]).map(([res, needed]) => {
              const have = building.inventory[res] ?? 0;
              const cap = prod.inputCapacity?.[res] ?? needed;

              return (
                <div key={res} style={row}>
                  <span style={label}>{RESOURCE_ICON[res] ?? ''} {res}</span>
                  <span style={{ color: have >= needed ? '#7dda7d' : '#e05050' }}>{have} / {cap}</span>
                </div>
              );
            })}
            {(Object.entries(prod.output) as [ResourceType, number][]).map(([res, amount]) => {
              const buffered = building.inventory[res] ?? 0;
              const outCap = prod.outputCapacity[res];
              const full = outCap !== undefined && buffered >= outCap;

              return (
                <div key={res} style={row}>
                  <span style={label}>{RESOURCE_ICON[res] ?? ''} {res}</span>
                  <span>
                    <span style={{ color: full ? '#e05050' : buffered > 0 ? '#e8c87a' : 'rgba(255,255,255,0.3)', marginRight: 4 }}>
                      {outCap !== undefined ? `${buffered} / ${outCap}` : buffered > 0 ? `${buffered} ready` : '—'}
                    </span>
                    {prod.cycleTime > 0 && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>+{amount}/cycle</span>}
                  </span>
                </div>
              );
            })}
            {workers > 0 && prod.cycleTime > 0 && (
              <>
                <div style={{ ...row, marginTop: 4 }}>
                  <span style={label}>Progress</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{building.productionProgress} / {prod.cycleTime}</span>
                </div>
                <div style={fillOuter}><div style={{ height: '100%', width: `${Math.round((building.productionProgress / prod.cycleTime) * 100)}%`, borderRadius: 3, background: building.productionProgress > 0 ? '#7abacc' : 'rgba(255,255,255,0.15)' }} /></div>
              </>
            )}
          </>
        )}

        {inventory.length > 0 && (
          <>
            <div style={divider} />
            <div style={groupLabel}>Inventory</div>
            {inventory.map(([type, amount]) => (
              <div key={type} style={row}>
                <span style={label}>{RESOURCE_ICON[type] ?? ''} {type}</span>
                <span>{amount}</span>
              </div>
            ))}
          </>
        )}

        {isStore && (
          <>
            <div style={divider} />
            <div style={row}>
              <span style={label}>Capacity</span>
              <span style={{ color: fillColorFor(fillPct) }}>{total} / {storeCap}</span>
            </div>
            <div style={fillOuter}><div style={{ height: '100%', width: `${fillPct}%`, borderRadius: 3, background: fillColorFor(fillPct) }} /></div>
          </>
        )}

        {canUpgrade && (
          <>
            <div style={divider} />
            {upgradeCost && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                Cost:{' '}
                {(Object.entries(upgradeCost) as [ResourceType, number][]).map(([res, amt]) => (
                  <span key={res} style={{ color: canAffordUpgrade ? '#f0c060' : '#e05050' }}>{amt} {res} </span>
                ))}
              </div>
            )}
            <button
              onClick={canAffordUpgrade ? () => upgradeBuilding(building.id) : undefined}
              style={{
                width: '100%', padding: '5px 0', borderRadius: 4,
                border: `1px solid ${canAffordUpgrade ? 'rgba(240,192,96,0.6)' : 'rgba(255,255,255,0.15)'}`,
                background: canAffordUpgrade ? 'rgba(240,192,96,0.15)' : 'rgba(255,255,255,0.04)',
                color: canAffordUpgrade ? '#f0c060' : 'rgba(255,255,255,0.3)',
                fontSize: 12, cursor: canAffordUpgrade ? 'pointer' : 'default',
              }}
            >
              Upgrade to Level {building.level + 1}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
