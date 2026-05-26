let waterSheet: HTMLImageElement | null = null;

export const preloadWaterTexture = (): void => {
  const img = new Image();
  img.src = '/assets/textures/water_sheet.png';
  img.onload = () => { waterSheet = img; };
};

export const getWaterSheet = (): HTMLImageElement | null => waterSheet;
