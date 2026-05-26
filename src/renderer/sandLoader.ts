let sandImage: HTMLImageElement | null = null;

export const preloadSandTexture = (): void => {
  const img = new Image();
  img.src = '/assets/textures/sand.png';
  img.onload = () => { sandImage = img; };
};

export const getSandImage = (): HTMLImageElement | null => sandImage;
