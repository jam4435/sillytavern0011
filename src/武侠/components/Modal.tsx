import React from 'react';
import { Icons } from './Icons';
import { ActivePanel } from '../types';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type: ActivePanel;
  children: React.ReactNode;
  overlayClassName?: string;
  boxClassName?: string;
  contentClassName?: string;
  showPaperTexture?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  type,
  children,
  overlayClassName = '',
  boxClassName = '',
  contentClassName = '',
  showPaperTexture = true,
}) => {
  if (!isOpen) return null;

  return (
    <div className={`modal-overlay ${overlayClassName}`.trim()} onClick={onClose}>
      <div className={`modal-box modal-${type.toLowerCase()} ${boxClassName}`.trim()} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="title-bar"></div>
            <h2 className="modal-title">{title}</h2>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <Icons.Close />
          </button>
        </div>

        {/* Decorative Corners */}
        <div className="corner-dec corner-tl"></div>
        <div className="corner-dec corner-tr"></div>
        <div className="corner-dec corner-bl"></div>
        <div className="corner-dec corner-br"></div>

        {/* Body */}
        <div className={`modal-content ${contentClassName}`.trim()}>
          {showPaperTexture && <div className="modal-paper-texture" aria-hidden="true"></div>}
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
