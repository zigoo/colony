import { useDrone } from '../renderer/gl/drone';

const wrap: React.CSSProperties = {
  position: 'fixed',
  top: 10,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 60,
  padding: '6px 14px',
  background: 'rgba(20,24,30,0.86)',
  border: '1px solid rgba(120,180,255,0.5)',
  borderRadius: 20,
  color: '#cfe3ff',
  font: '12px monospace',
  cursor: 'pointer',
  userSelect: 'none',
};

export const DroneIndicator = () => {
  const active = useDrone(s => s.active);

  if (!active) return null;

  return (
    <div style={wrap} onClick={() => useDrone.getState().set(false)} title="Click or press Esc to exit">
      🛸 Drone mode — Esc to exit
    </div>
  );
};
