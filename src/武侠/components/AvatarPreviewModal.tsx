import React from 'react';
import { ActivePanel } from '../types';
import AvatarImage from './AvatarImage';
import Modal from './Modal';

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
  if (!src) {
    return null;
  }

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
        <AvatarImage
          src={src}
          alt={title}
          className="avatar-preview-image"
          objectPosition={objectPosition}
          fit="contain"
          rasterMode="trim"
        />
      </div>
      {subtitle && <p className="avatar-preview-caption">{subtitle}</p>}
    </Modal>
  );
};

export default AvatarPreviewModal;
