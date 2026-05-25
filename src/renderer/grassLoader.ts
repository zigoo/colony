let grassImage: HTMLImageElement | null = null;

export const preloadGrassTextures = (): void => {
  const g = new Image();
  g.src = '/assets/textures/grass_2.png';
  g.onload = () => { grassImage = g; };
};

export const getGrassImage = (): HTMLImageElement | null => grassImage;
