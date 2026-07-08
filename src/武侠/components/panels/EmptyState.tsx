import React from 'react';
import { Icons } from '../Icons';

interface EmptyStateProps {
  message: string;
  variant?: 'default' | 'inventory' | 'manual';
}

function buildEmptyStateIcon(variant: NonNullable<EmptyStateProps['variant']>) {
  switch (variant) {
    case 'inventory':
      return <Icons.Inventory size={28} />;
    case 'manual':
      return <Icons.Manual size={28} />;
    default:
      return <Icons.Scroll size={28} />;
  }
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message, variant = 'default' }) => (
  <div className={`empty-state empty-state--${variant}`}>
    <div className="empty-state-emblem" aria-hidden="true">
      <div className="empty-state-icon-shell">{buildEmptyStateIcon(variant)}</div>
    </div>
    <p className="empty-state-text">{message}</p>
  </div>
);
