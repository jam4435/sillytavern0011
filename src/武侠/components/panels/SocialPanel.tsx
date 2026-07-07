import React from 'react';
import type { NPC } from '../../types';
import { EmptyState } from './EmptyState';

interface SocialPanelProps {
  npcs: NPC[];
}

export const SocialPanel: React.FC<SocialPanelProps> = ({ npcs }) => {
  void npcs;
  return <EmptyState message="侠缘页 UI 已移除，等待重构" />;
};
