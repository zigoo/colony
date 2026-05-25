import { useStore, spawnAtCenter } from '../store';
import { saveToFile, loadFromFile } from '../game/saveLoad';

interface ToolbarProps {
  minimapVisible: boolean;
  onToggleMinimap: () => void;
}

export const Toolbar = ({ minimapVisible, onToggleMinimap }: ToolbarProps) => {
  const { generateNewMap, loadGameState, saveTimestamp, game, ui } = useStore();
  const selectedUnits = ui.selectedUnitIds.map(id => game.units[id]).filter(Boolean);

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
        color: selectedUnits.length > 0 ? '#aaffaa' : 'rgba(255,255,255,0.35)',
        fontSize: '11px',
        alignSelf: 'center',
        fontFamily: 'monospace',
        marginLeft: 8,
      }}>
        {selectedUnits.length === 0 && 'no unit selected'}
        {selectedUnits.length === 1 && `unit: ${selectedUnits[0].id} | ${selectedUnits[0].gatherTier} | ${selectedUnits[0].state} | (${selectedUnits[0].col},${selectedUnits[0].row}) | path: ${selectedUnits[0].path.length}`}
        {selectedUnits.length > 1 && `${selectedUnits.length} units selected`}
      </span>

      <div style={{ width: 1, background: 'rgba(255,255,255,0.15)', alignSelf: 'stretch', marginLeft: 8 }} />

      <button
        onClick={onToggleMinimap}
        style={{
          padding: '8px 20px',
          background: minimapVisible ? 'rgba(80, 200, 255, 0.25)' : 'rgba(30, 30, 60, 0.9)',
          color: minimapVisible ? 'rgba(80, 200, 255, 0.9)' : 'rgba(255,255,255,0.5)',
          border: `1px solid ${minimapVisible ? 'rgba(80, 200, 255, 0.5)' : 'rgba(255,255,255,0.2)'}`,
          borderRadius: '6px',
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: '13px',
        }}
        onMouseEnter={event => (event.currentTarget.style.background = minimapVisible ? 'rgba(80, 200, 255, 0.35)' : 'rgba(60, 60, 120, 0.95)')}
        onMouseLeave={event => (event.currentTarget.style.background = minimapVisible ? 'rgba(80, 200, 255, 0.25)' : 'rgba(30, 30, 60, 0.9)')}
      >
        Minimap
      </button>
    </div>
  );
};
