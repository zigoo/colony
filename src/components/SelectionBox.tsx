import { useStore } from '../store';

export const SelectionBox = () => {
  const selectionBox = useStore(state => state.ui.selectionBox);
  if (!selectionBox) return null;

  const { x1, y1, x2, y2 } = selectionBox;

  return (
    <div style={{
      position: 'fixed',
      left:   Math.min(x1, x2),
      top:    Math.min(y1, y2),
      width:  Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
      border: '1px solid rgba(80, 200, 255, 0.8)',
      background: 'rgba(80, 200, 255, 0.08)',
      pointerEvents: 'none',
      zIndex: 5,
    }} />
  );
};
