import React, { useEffect, useState } from 'react';
import { ActivePanel } from '../types';
import Modal from './Modal';

const ALPHA_THRESHOLD = 8;

function trimTransparentEdges(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });

      if (!sourceContext) {
        resolve(null);
        return;
      }

      sourceContext.drawImage(image, 0, 0, width, height);

      let imageData: ImageData;
      try {
        imageData = sourceContext.getImageData(0, 0, width, height);
      } catch {
        resolve(null);
        return;
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
        resolve(null);
        return;
      }

      const cropWidth = maxX - minX + 1;
      const cropHeight = maxY - minY + 1;
      const unchanged = minX === 0 && minY === 0 && cropWidth === width && cropHeight === height;

      if (unchanged) {
        resolve(null);
        return;
      }

      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropWidth;
      croppedCanvas.height = cropHeight;
      const croppedContext = croppedCanvas.getContext('2d');

      if (!croppedContext) {
        resolve(null);
        return;
      }

      croppedContext.drawImage(
        image,
        minX,
        minY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
      );

      resolve(croppedCanvas.toDataURL('image/png'));
    };

    image.onerror = () => resolve(null);
    image.src = src;
  });
}

interface AvatarPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  src: string | null;
  type?: ActivePanel;
  objectPosition?: string;
  subtitle?: string;
}

export const AvatarPreviewModal: React.FC<AvatarPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  src,
  type = ActivePanel.CHARACTER,
  objectPosition,
  subtitle,
}) => {
  const [displaySrc, setDisplaySrc] = useState<string | null>(src);

  useEffect(() => {
    let cancelled = false;

    setDisplaySrc(src);

    if (!isOpen || !src) {
      return () => {
        cancelled = true;
      };
    }

    trimTransparentEdges(src).then(trimmedSrc => {
      if (!cancelled && trimmedSrc) {
        setDisplaySrc(trimmedSrc);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, src]);

  if (!src) {
    return null;
  }

  const usingTrimmedSource = displaySrc !== null && displaySrc !== src;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      type={type}
      overlayClassName="avatar-preview-overlay"
      boxClassName="avatar-preview-modal"
      contentClassName="avatar-preview-content"
      showPaperTexture={false}
    >
      <div className="avatar-preview-stage">
        <img
          src={displaySrc || src}
          alt={title}
          className="avatar-preview-image"
          style={!usingTrimmedSource && objectPosition ? { objectPosition } : undefined}
        />
      </div>
      {subtitle && <p className="avatar-preview-caption">{subtitle}</p>}
    </Modal>
  );
};

export default AvatarPreviewModal;
