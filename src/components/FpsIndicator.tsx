import { useFps } from '../renderer/gl/fps';

const FPS_GOOD = 50;
const FPS_OK = 30;

const box: React.CSSProperties = {
  position: 'fixed',
  top: 8,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 60,
  padding: '2px 8px',
  background: 'rgba(20,24,30,0.6)',
  borderRadius: 4,
  font: 'bold 12px monospace',
  pointerEvents: 'none',
  userSelect: 'none',
};

export const FpsIndicator = () => {
  const { fps, treeCount, drawCalls, triangles } = useFps();
  const color = fps >= FPS_GOOD ? '#7dda7d' : fps >= FPS_OK ? '#f0c060' : '#e05050';

  return (
    <div style={{ ...box, color }}>
      {fps} FPS{' '}
      <span style={{ color: 'rgba(255,255,255,0.6)' }}>
        · calls:{drawCalls} · tris:{(triangles / 1e6).toFixed(2)}M · trees:{treeCount}
      </span>
    </div>
  );
};
