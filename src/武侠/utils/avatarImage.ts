export type AvatarRasterMode = 'square' | 'trim';

const ALPHA_THRESHOLD = 8;
const SQUARE_PADDING_RATIO = 0.06;

const avatarRasterCache = new Map<string, string | null>();
const avatarRasterPending = new Map<string, Promise<string | null>>();

function getCacheKey(src: string, mode: AvatarRasterMode): string {
  return `${mode}:${src}`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function getCachedAvatarRasterizedSrc(src: string, mode: AvatarRasterMode): string | null | undefined {
  return avatarRasterCache.get(getCacheKey(src, mode));
}

export function rasterizeAvatarSource(src: string, mode: AvatarRasterMode): Promise<string | null> {
  const cacheKey = getCacheKey(src, mode);
  if (avatarRasterCache.has(cacheKey)) {
    return Promise.resolve(avatarRasterCache.get(cacheKey) ?? null);
  }

  const pending = avatarRasterPending.get(cacheKey);
  if (pending) {
    return pending;
  }

  const task = loadImage(src)
    .then(image => {
      if (!image) {
        avatarRasterCache.set(cacheKey, null);
        return null;
      }

      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });

      if (!sourceContext) {
        avatarRasterCache.set(cacheKey, null);
        return null;
      }

      sourceContext.drawImage(image, 0, 0, width, height);

      let imageData: ImageData;
      try {
        imageData = sourceContext.getImageData(0, 0, width, height);
      } catch {
        avatarRasterCache.set(cacheKey, null);
        return null;
      }

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const alpha = imageData.data[(y * width + x) * 4 + 3];
          if (alpha <= ALPHA_THRESHOLD) {
            continue;
          }

          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      if (maxX < 0 || maxY < 0) {
        avatarRasterCache.set(cacheKey, null);
        return null;
      }

      const hasTransparentMargins = minX > 0 || minY > 0 || maxX < width - 1 || maxY < height - 1;
      if (!hasTransparentMargins) {
        avatarRasterCache.set(cacheKey, null);
        return null;
      }

      const cropWidth = maxX - minX + 1;
      const cropHeight = maxY - minY + 1;
      const outputCanvas = document.createElement('canvas');
      const outputContext = outputCanvas.getContext('2d');

      if (!outputContext) {
        avatarRasterCache.set(cacheKey, null);
        return null;
      }

      if (mode === 'square') {
        const squarePadding = Math.ceil(Math.max(cropWidth, cropHeight) * SQUARE_PADDING_RATIO);
        const squareSize = Math.max(cropWidth, cropHeight) + squarePadding * 2;
        const dx = Math.round((squareSize - cropWidth) / 2);
        const dy = Math.round((squareSize - cropHeight) / 2);

        outputCanvas.width = squareSize;
        outputCanvas.height = squareSize;
        outputContext.drawImage(image, minX, minY, cropWidth, cropHeight, dx, dy, cropWidth, cropHeight);
      } else {
        outputCanvas.width = cropWidth;
        outputCanvas.height = cropHeight;
        outputContext.drawImage(image, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      }

      const dataUrl = outputCanvas.toDataURL('image/png');
      avatarRasterCache.set(cacheKey, dataUrl);
      return dataUrl;
    })
    .finally(() => {
      avatarRasterPending.delete(cacheKey);
    });

  avatarRasterPending.set(cacheKey, task);
  return task;
}
