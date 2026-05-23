import { useStore } from '../store';
import { saveToFile, loadFromFile } from '../game/saveLoad';

export function Toolbar() {
  const { generateNewMap, loadGameState, saveTimestamp, game } = useStore();

  const handleSave = () => {
    saveTimestamp();
    saveToFile(useStore.getState().game);
  };

  const handleLoad = async () => {
    try {
      const state = await loadFromFile();
      loadGameState(state);
    } catch (e) {
      console.error('Load failed:', e);
    }
  };

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: '8px',
      zIndex: 10,
    }}>
      {[
        { label: 'New Map', onClick: () => generateNewMap() },
        { label: 'Save', onClick: handleSave },
        { label: 'Load', onClick: handleLoad },
      ].map(({ label, onClick }) => (
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
    </div>
  );
}
