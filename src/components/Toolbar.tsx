import { useStore, spawnAtCenter } from '../store';
import { saveToFile, loadFromFile } from '../game/saveLoad';

export const Toolbar = () => {
  const { generateNewMap, loadGameState, saveTimestamp, game, ui } = useStore();
  const selectedUnit = ui.selectedUnitId ? game.units[ui.selectedUnitId] : null;

  const handleSave = async () => {
    try {
      saveTimestamp();
      await saveToFile(useStore.getState().game);
    } catch (e) {
      console.error('Save failed:', e);
    }
  };

  const handleLoad = async () => {
    try {
      const state = await loadFromFile();
      loadGameState(state);
    } catch (e) {
      console.error('Load failed:', e);
    }
  };

  const buttons = [
    { label: 'New Map',    onClick: () => generateNewMap() },
    { label: 'Spawn Unit', onClick: () => spawnAtCenter() },
    { label: 'Save',       onClick: handleSave },
    { label: 'Load',       onClick: handleLoad },
  ];

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: '8px',
      zIndex: 10,
    }}>
      {buttons.map(({ label, onClick }) => (
        <button
          key={label}
          onClick={onClick}
          style={{
            padding: '8px 20px',
            background: 'rgba(30, 30, 60, 0.9)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '13px',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(60, 60, 120, 0.95)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(30, 30, 60, 0.9)')}
        >
          {label}
        </button>
      ))}

      {game.savedAt && (
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', alignSelf: 'center', fontFamily: 'monospace' }}>
          Saved {new Date(game.savedAt).toLocaleTimeString()}
        </span>
      )}

      <span style={{
        color: selectedUnit ? '#aaffaa' : 'rgba(255,255,255,0.35)',
        fontSize: '11px',
        alignSelf: 'center',
        fontFamily: 'monospace',
        marginLeft: 8,
      }}>
        {selectedUnit
          ? `unit: ${selectedUnit.id} | ${selectedUnit.state} | (${selectedUnit.col},${selectedUnit.row}) | path: ${selectedUnit.path.length}`
          : 'no unit selected'}
      </span>
    </div>
  );
};
