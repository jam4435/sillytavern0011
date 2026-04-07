import React from 'react';

interface EmptyStateProps {
  message: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#78716c', gap: '1rem' }}>
    <div style={{ width: '50px', height: '50px', border: '1px solid #44403c', transform: 'rotate(45deg)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: '30px', height: '30px', border: '1px solid #1c1917', transform: 'rotate(-45deg)', background: 'rgba(28,25,23,0.5)' }}></div>
    </div>
    <p style={{ fontFamily: 'serif', fontSize: '1rem' }}>{message}</p>
  </div>
);
