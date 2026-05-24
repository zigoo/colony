// Mutable placement preview state written by useCamera on mousemove,
// read by the renderer each frame — avoids Zustand updates on every move event.
export const placementPreview = {
  active: false,
  col: 0,
  row: 0,
  valid: false,
};
