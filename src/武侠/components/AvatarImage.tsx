import React, { useEffect, useMemo, useState } from 'react';
import {
  AvatarRasterMode,
  getCachedAvatarRasterizedSrc,
  rasterizeAvatarSource,
} from '../utils/avatarImage';

interface AvatarImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  src: string;
  alt: string;
  objectPosition?: string;
  fit?: React.CSSProperties['objectFit'];
  rasterMode?: AvatarRasterMode;
}

export const AvatarImage: React.FC<AvatarImageProps> = ({
  src,
  alt,
  objectPosition,
  fit = 'cover',
  rasterMode = 'square',
  style,
  onError,
  loading = 'lazy',
  ...rest
}) => {
  const [displaySrc, setDisplaySrc] = useState(() => getCachedAvatarRasterizedSrc(src, rasterMode) || src);
  const [hasLoadError, setHasLoadError] = useState(false);
  const fallbackSrc = useMemo(() => {
    const initial = alt.trim().charAt(0) || '侠';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#241b15"/><text x="50" y="58" text-anchor="middle" fill="#f4e8c9" font-size="52" font-family="serif">${initial}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }, [alt]);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedAvatarRasterizedSrc(src, rasterMode);
    setHasLoadError(false);
    setDisplaySrc(cached || src);

    rasterizeAvatarSource(src, rasterMode).then(rasterizedSrc => {
      if (!cancelled) {
        setDisplaySrc(rasterizedSrc || src);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [rasterMode, src]);

  const usingRasterizedSource = displaySrc !== src;
  const resolvedSrc = hasLoadError ? fallbackSrc : displaySrc;
  const imageStyle = useMemo(
    () => ({
      ...style,
      objectFit: fit,
      ...(!usingRasterizedSource && objectPosition ? { objectPosition } : {}),
    }),
    [fit, objectPosition, style, usingRasterizedSource],
  );

  return (
    <img
      {...rest}
      src={resolvedSrc}
      alt={alt}
      loading={loading}
      style={imageStyle}
      onError={event => {
        setHasLoadError(true);
        onError?.(event);
      }}
    />
  );
};

export default AvatarImage;
