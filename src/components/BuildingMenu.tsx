import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { BuildingType } from '../game/types';
import { roadPreview } from '../renderer/placementPreview';

type BuildingDef  = { type: BuildingType; icon: string };
type Subcategory  = { id: string; label: string; buildings: BuildingDef[] };
type Category     = { id: string; label: string; icon: string; subcategories: Subcategory[] };

// --- menu data — add new buildings here only ---
const MENU: Category[] = [
  {
    id: 'economy',
    label: 'Economy',
    icon: '⚒️',
    subcategories: [
      {
        id: 'wood',
        label: 'Wood',
        buildings: [
          { type: BuildingType.WoodCutter,  icon: '🪓' },
          { type: BuildingType.LumberCamp,  icon: '🪵' },
        ],
      },
      {
        id: 'storage',
        label: 'Storage',
        buildings: [
          { type: BuildingType.Storehouse, icon: '📦' },
        ],
      },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infra',
    icon: '🛤️',
    subcategories: [
      {
        id: 'paths',
        label: 'Paths',
        buildings: [
          { type: BuildingType.Road, icon: '🛤️' },
        ],
      },
    ],
  },
];

// --- shared style primitives ---

const panel: React.CSSProperties = {
  background: 'rgba(20, 20, 50, 0.92)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  padding: 8,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const tabBase: React.CSSProperties = {
  padding: '5px 10px',
  background: 'transparent',
  color: 'rgba(255,255,255,0.65)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: 12,
};

const tabOn: React.CSSProperties = {
  background: 'rgba(80,120,255,0.25)',
  borderColor: 'rgba(80,120,255,0.65)',
  color: '#fff',
};

const tileBase: React.CSSProperties = {
  width: 52,
  height: 52,
  fontSize: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 7,
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.04)',
};

const tileOn: React.CSSProperties = {
  background: 'rgba(255,200,50,0.2)',
  borderColor: 'rgba(255,200,50,0.8)',
};

// --- component ---

export const BuildingMenu = () => {
  const [activeCatId, setActiveCatId]  = useState<string | null>(null);
  const [activeSubId, setActiveSubId]  = useState<string | null>(null);

  const selectedBuildingType = useStore(s => s.ui.selectedBuildingType);
  const selectBuildingType   = useStore(s => s.selectBuildingType);

  const activeCat = MENU.find(c => c.id === activeCatId);
  const activeSub = activeCat?.subcategories.find(s => s.id === activeSubId);

  const toggleCat = (id: string) => {
    if (activeCatId === id) { setActiveCatId(null); setActiveSubId(null); }
    else { setActiveCatId(id); setActiveSubId(null); }
  };

  const toggleSub = (id: string) => {
    setActiveSubId(activeSubId === id ? null : id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      selectBuildingType(null);
      setActiveCatId(null);
      setActiveSubId(null);
      roadPreview.active = false;
      roadPreview.hasAnchor = false;
      roadPreview.path = [];
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectBuildingType]);

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      left: 16,
      width: 220,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      zIndex: 10,
    }}>

      {/* Level 3 — icon-only building tiles */}
      {activeSub && (
        <div style={panel}>
          {activeSub.buildings.map(({ type, icon }) => {
            const on = selectedBuildingType === type;
            return (
              <button
                key={type}
                title={type}
                onClick={() => selectBuildingType(on ? null : type)}
                style={{ ...tileBase, ...(on ? tileOn : {}) }}
              >
                {icon}
              </button>
            );
          })}
        </div>
      )}

      {/* Level 2 — subcategory tabs */}
      {activeCat && (
        <div style={panel}>
          {activeCat.subcategories.map(s => (
            <button
              key={s.id}
              onClick={() => toggleSub(s.id)}
              style={{ ...tabBase, ...(activeSubId === s.id ? tabOn : {}) }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Level 1 — category tabs, always visible */}
      <div style={panel}>
        {MENU.map(c => (
          <button
            key={c.id}
            onClick={() => toggleCat(c.id)}
            style={{ ...tabBase, ...(activeCatId === c.id ? tabOn : {}) }}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

    </div>
  );
};
