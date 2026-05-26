import { useUnitHover } from '../renderer/gl/unitHover';

const TOOLTIP_OFFSET_X = 14;
const TOOLTIP_OFFSET_Y = 14;

const tip: React.CSSProperties = {
  position: 'fixed',
  zIndex: 60,
  padding: '3px 8px',
  background: 'rgba(20,24,30,0.9)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 5,
  color: '#fff',
  font: '12px monospace',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
};

export const UnitTooltip = () => {
  const { name, x, y } = useUnitHover();

  if (!name) return null;

  return (
    <div style={{ ...tip, left: x + TOOLTIP_OFFSET_X, top: y + TOOLTIP_OFFSET_Y }}>
      {name}
    </div>
  );
};
