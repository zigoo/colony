// Mutable state written by useCamera on mousemove, read by the renderer each
// frame — avoids Zustand updates on every move event.
export const placementPreview = {
  active: false,
  col: 0,
  row: 0,
  valid: false,
};

export const roadPreview = {
  active:    false,
  hasAnchor: false,
  anchorCol: 0,
  anchorRow: 0,
  path:      [] as Array<{ col: number; row: number }>,
};
