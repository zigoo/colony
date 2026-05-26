import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { BuildingType, ResourceType } from '../game/types';
import { BUILDING_CONSTRUCTION_MATERIALS } from '../game/buildingConfig';

const BUILDINGS: { type: BuildingType; icon: string; label: string }[] = [
  { type: BuildingType.WoodCutter, icon: '🪓', label: 'Woodcutter' },
  { type: BuildingType.LumberCamp, icon: '🪵', label: 'Sawmill' },
  { type: BuildingType.Storehouse, icon: '📦', label: 'Storehouse' },
];

const bar: React.CSSProperties = {
  position: 'fixed',
  bottom: 14,
  left: 14,
  zIndex: 50,
  display: 'flex',
  gap: 8,
  padding: 8,
  background: 'rgba(20,24,30,0.86)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
};

const tileBase: React.CSSProperties = {
  width: 64,
  padding: '6px 4px',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  color: '#e8eef6',
  font: '10px monospace',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
};

const tileOn: React.CSSProperties = {
  background: 'rgba(255,200,50,0.2)',
  borderColor: 'rgba(255,200,50,0.8)',
};

const costLabel = (type: BuildingType): string => {
  const mats = BUILDING_CONSTRUCTION_MATERIALS[type];

  if (!mats) return '';

  return (Object.entries(mats) as [ResourceType, number][])
    .map(([res, n]) => `${n} ${res.toLowerCase()}`)
    .join(', ');
};

export const BuildingMenuGL = () => {
  const { selectedBuildingType, selectBuildingType } = useStore(useShallow(s => ({
    selectedBuildingType: s.ui.selectedBuildingType,
    selectBuildingType: s.selectBuildingType,
  })));

  return (
    <div style={bar}>
      {BUILDINGS.map(({ type, icon, label }) => {
        const on = selectedBuildingType === type;

        return (
          <button
            key={type}
            title={`${label} — ${costLabel(type) || 'free'}`}
            onClick={() => selectBuildingType(on ? null : type)}
            style={{ ...tileBase, ...(on ? tileOn : {}) }}
          >
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
};
