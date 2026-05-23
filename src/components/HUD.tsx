import { useStore } from '../store';

export function HUD() {
  const resources = useStore((s) => s.game.resources['player1']);
  const selectedCol = useStore((s) => s.ui.selectedCol);
  const selectedRow = useStore((s) => s.ui.selectedRow);
  const map = useStore((s) => s.game.map);

  const selectedTile = selectedCol !== null && selectedRow !== null
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
        <span>Wood: {resources?.wood ?? 0}</span>
        <span>Stone: {resources?.stone ?? 0}</span>
        <span>Food: {resources?.food ?? 0}</span>
        <span>Ore: {resources?.ore ?? 0}</span>
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
      <div style={{ opacity: 0.6 }}>Drag to pan · Scroll to zoom</div>
    </div>
  );
}
