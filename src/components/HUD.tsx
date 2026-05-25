import { useStore, PLAYER_ID } from '../store';
import { ResourceType, UnitState } from '../game/types';

export const HUD = () => {
  const resources  = useStore((state) => state.game.resources[PLAYER_ID]);
  const selectedCol = useStore((state) => state.ui.selectedCol);
  const selectedRow = useStore((state) => state.ui.selectedRow);
  const map        = useStore((state) => state.game.map);
  const units      = useStore((state) => state.game.units);
  const buildings  = useStore((state) => state.game.buildings);

  const mapUnits      = Object.values(units);
  const absorbedCount = Object.values(buildings).reduce((s, b) => s + b.workerIds.length, 0);
  const totalPeople   = mapUnits.length + absorbedCount;
  const workingCount  = absorbedCount + mapUnits.filter(u =>
    u.state === UnitState.Collecting ||
    u.state === UnitState.Depositing ||
    (u.state === UnitState.Moving && u.gatherTarget !== null)
  ).length;

  const selectedTile =
    selectedCol !== null && selectedRow !== null
      ? map.tiles[`${selectedCol},${selectedRow}`]
      : null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 16px',
      background: 'rgba(0,0,0,0.7)',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: '13px',
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', gap: '20px' }}>
        <span>Wood: {resources?.[ResourceType.Wood] ?? 0}</span>
        <span>Stone: {resources?.[ResourceType.Stone] ?? 0}</span>
        <span>Food: {resources?.[ResourceType.Food] ?? 0}</span>
        <span>Ore: {resources?.[ResourceType.Ore] ?? 0}</span>
      </div>

      {selectedTile && (
        <div style={{ textAlign: 'center' }}>
          <strong>{selectedTile.type}</strong>
          {' '}({selectedCol}, {selectedRow})
          {selectedTile.hasResource && (
            <span style={{ marginLeft: 8, color: '#ffd700' }}>
              {selectedTile.resourceType} x{selectedTile.resourceAmount}
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span>People: {totalPeople}</span>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>·</span>
        <span style={{ color: workingCount > 0 ? '#7dda7d' : 'rgba(255,255,255,0.45)' }}>
          {workingCount} working
        </span>
        {totalPeople > workingCount && (
          <span style={{ color: 'rgba(255,200,80,0.8)' }}>
            · {totalPeople - workingCount} idle
          </span>
        )}
      </div>
    </div>
  );
};
