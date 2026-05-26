import { requestZoom, ZOOM_BUTTON_IN, ZOOM_BUTTON_OUT } from '../renderer/gl/glControls';

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: 4,
};

const btn: React.CSSProperties = {
  width: 30,
  height: 28,
  background: 'rgba(20,24,30,0.82)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 6,
  color: '#e8eef6',
  font: 'bold 16px monospace',
  cursor: 'pointer',
  lineHeight: 1,
};

export const ZoomButtons = () => (
  <div style={wrap}>
    <button style={btn} onClick={() => requestZoom(ZOOM_BUTTON_IN)} title="Zoom in">+</button>
    <button style={btn} onClick={() => requestZoom(ZOOM_BUTTON_OUT)} title="Zoom out">−</button>
  </div>
);
