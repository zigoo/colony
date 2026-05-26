import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { useGLParams } from '../renderer/gl/glParams';
import { UnitState } from '../game/types';
import { STAMINA_MAX, HEALTH_MAX } from '../game/constants';

const TICKS_PER_SEC = 10;

const ACTIVITY_LABEL: Record<UnitState, string> = {
  [UnitState.Idle]:       'Idle',
  [UnitState.Moving]:     'Walking',
  [UnitState.Collecting]: 'Gathering',
  [UnitState.Building]:   'Building',
  [UnitState.Depositing]: 'Hauling',
};

const panel: React.CSSProperties = {
  position: 'fixed',
  top: 8,
  right: 8,
  zIndex: 55,
  width: 210,
  padding: '10px 12px',
  background: 'rgba(20,24,30,0.88)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: '#e8eef6',
  font: '12px monospace',
  userSelect: 'none',
};

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', marginBottom: 3 };
const label: React.CSSProperties = { color: 'rgba(255,255,255,0.5)' };

const Bar = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div style={{ height: 7, background: 'rgba(255,255,255,0.12)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
    <div style={{ width: `${Math.round((value / max) * 100)}%`, height: '100%', background: color }} />
  </div>
);

export const UnitInfoPanel = () => {
  const { unit, tick } = useStore(useShallow(s => ({
    unit: s.ui.selectedUnitIds.length === 1 ? s.game.units[s.ui.selectedUnitIds[0]] : null,
    tick: s.game.tick,
  })));
  const dayLengthSec = useGLParams(s => s.dayLengthSec);

  if (!unit) return null;

  const ageDays = ((tick - unit.bornAtTick) / TICKS_PER_SEC / dayLengthSec).toFixed(1);
  const activity = unit.state === UnitState.Moving && unit.running ? 'Running' : ACTIVITY_LABEL[unit.state];
  const efficiency = Math.round(60 + 40 * (unit.stamina / unit.maxStamina));
  const staminaColor = unit.stamina > unit.maxStamina * 0.5 ? '#7dda7d' : unit.stamina > unit.maxStamina * 0.2 ? '#f0c060' : '#e05050';

  return (
    <div style={panel}>
      <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 8 }}>{unit.name}</div>

      <div style={row}><span style={label}>Activity</span><span>{activity}</span></div>
      <div style={row}><span style={label}>Age</span><span>{ageDays} days</span></div>
      <div style={row}><span style={label}>Traveled</span><span>{unit.distanceTraveled} tiles</span></div>
      <div style={row}><span style={label}>Role</span><span>{unit.gatherTier}</span></div>
      <div style={row}><span style={label}>Efficiency</span><span>{efficiency}%</span></div>

      <div style={{ ...label, marginTop: 8 }}>Stamina {Math.round(unit.stamina)}/{STAMINA_MAX}</div>
      <Bar value={unit.stamina} max={STAMINA_MAX} color={staminaColor} />

      <div style={label}>Health {Math.round(unit.health)}/{HEALTH_MAX}</div>
      <Bar value={unit.health} max={HEALTH_MAX} color="#e0708a" />
    </div>
  );
};
