// Bridges imperative viewport commands (e.g. the +/- zoom buttons) to the live
// GLScene, which is owned by GameCanvasGL's effect rather than React state.

type ZoomFn = (factor: number) => void;

let zoomFn: ZoomFn | null = null;

export const ZOOM_BUTTON_IN = 1.25;
export const ZOOM_BUTTON_OUT = 0.8;

export const registerZoom = (fn: ZoomFn | null): void => {
  zoomFn = fn;
};

export const requestZoom = (factor: number): void => {
  zoomFn?.(factor);
};
