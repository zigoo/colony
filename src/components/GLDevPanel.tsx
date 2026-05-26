import { useState } from 'react';
import { useGLParams } from '../renderer/gl/glParams';
import type { GLParams } from '../renderer/gl/glParams';
import { useStore } from '../store';

interface SliderDef {
  key: keyof GLParams;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: { group: string; items: SliderDef[] }[] = [
  {
    group: 'Camera',
    items: [
      { key: 'camElevationDeg', label: 'Elevation°', min: 10, max: 80, step: 1 },
      { key: 'camAzimuthDeg', label: 'Azimuth°', min: 0, max: 360, step: 1 },
      { key: 'viewSize', label: 'View size (zoom out)', min: 15, max: 160, step: 1 },
    ],
  },
  {
    group: 'Light & time',
    items: [
      { key: 'sunIntensity', label: 'Sun (daytime peak)', min: 0, max: 3, step: 0.05 },
      { key: 'hemiIntensity', label: 'Ambient', min: 0, max: 2.5, step: 0.05 },
      { key: 'dayLengthSec', label: 'Day length (s)', min: 30, max: 1200, step: 10 },
    ],
  },
  {
    group: 'Terrain (rebuilds mesh)',
    items: [
      { key: 'terrainSub', label: 'Resolution ×', min: 2, max: 12, step: 1 },
      { key: 'heightScale', label: 'Height', min: 0.2, max: 3, step: 0.05 },
      { key: 'mountainScale', label: 'Mountains', min: 0.5, max: 5, step: 0.05 },
      { key: 'noiseAmp', label: 'Noise', min: 0, max: 3, step: 0.05 },
    ],
  },
];

const panel: React.CSSProperties = {
  position: 'fixed',
  top: 34,
  left: 8,
  zIndex: 50,
  width: 230,
  padding: '8px 10px',
  background: 'rgba(20,24,30,0.86)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: '#dde',
  font: '11px monospace',
  userSelect: 'none',
};

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const btn: React.CSSProperties = {
  font: '10px monospace',
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.1)',
  color: '#dde',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 3,
  padding: '1px 6px',
};

export const GLDevPanel = () => {
  const params = useGLParams();
  const generateNewMap = useStore(s => s.generateNewMap);
  const [open, setOpen] = useState(false);

  return (
    <div style={panel}>
      <div style={headerRow}>
        <strong style={{ color: '#fff', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
          {open ? '▾' : '▸'} WebGL tuning
        </strong>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => generateNewMap()} style={btn}>new map</button>
          {open && <button onClick={params.reset} style={btn}>reset</button>}
        </div>
      </div>

      {open && SLIDERS.map(({ group, items }) => (
        <div key={group} style={{ marginTop: 8 }}>
          <div style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>{group}</div>
          {items.map(({ key, label, min, max, step }) => (
            <label key={key} style={{ display: 'block', marginBottom: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{label}</span>
                <span style={{ color: '#8fd' }}>{(params[key] as number).toFixed(step < 1 ? 2 : 0)}</span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={params[key] as number}
                onChange={(e) => params.set(key, Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>
          ))}
        </div>
      ))}
    </div>
  );
};
