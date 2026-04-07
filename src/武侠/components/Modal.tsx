import React from 'react';
import { Icons } from './Icons';
import { ActivePanel } from '../types';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type: ActivePanel;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, type, children }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        
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
        <div className="modal-content">
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(https://www.transparenttextures.com/patterns/chinese-style.png)', opacity: 0.05, pointerEvents: 'none' }}></div>
            {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;