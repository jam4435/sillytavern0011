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
  ...rest
}) => {
  const [displaySrc, setDisplaySrc] = useState(() => getCachedAvatarRasterizedSrc(src, rasterMode) || src);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedAvatarRasterizedSrc(src, rasterMode);
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
  const imageStyle = useMemo(
    () => ({
      ...style,
      objectFit: fit,
      ...(!usingRasterizedSource && objectPosition ? { objectPosition } : {}),
    }),
    [fit, objectPosition, style, usingRasterizedSource],
  );

  return <img {...rest} src={displaySrc} alt={alt} style={imageStyle} />;
};

export default AvatarImage;
