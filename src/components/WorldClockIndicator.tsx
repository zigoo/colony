import { useWorldClock } from '../renderer/gl/worldClock';
import { SEASONS } from '../renderer/gl/dayNightCycle';

const SEASON_ICON = ['🌱', '☀️', '🍂', '❄️'];

const box: React.CSSProperties = {
  padding: '6px 12px',
  background: 'rgba(20,24,30,0.82)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e8eef6',
  font: '13px monospace',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  userSelect: 'none',
  pointerEvents: 'none',
};

export const WorldClockIndicator = () => {
  const { day, hour, minute, seasonIndex, isNight } = useWorldClock();
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');

  return (
    <div style={box}>
      <span style={{ fontSize: 16 }}>{SEASON_ICON[seasonIndex]}</span>
      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{SEASONS[seasonIndex]}</span>
      <span>Day {day}</span>
      <span style={{ color: '#8fd' }}>
        {isNight ? '🌙' : '🌞'} {hh}:{mm}
      </span>
    </div>
  );
};
