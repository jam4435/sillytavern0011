/**
 * 指令队列按钮组件
 * 显示在ChatInput旁边，显示待发送指令数量
 */

import React from 'react';
import { PendingCommand } from '../types';

interface CommandQueueButtonProps {
  commands: PendingCommand[];
  onClick: () => void;
}

const CommandQueueButton: React.FC<CommandQueueButtonProps> = ({
  commands,
  onClick
}) => {
  const commandCount = commands.length;

  return (
    <button
      className="command-queue-btn"
      onClick={onClick}
      aria-label="查看指令队列"
      title={commandCount > 0 ? `${commandCount} 条待发送指令` : '指令队列'}
    >
      {/* 图标 */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6" />
        <path d="M9 16h6" />
      </svg>

      {/* 数量徽章 */}
      {commandCount > 0 && (
        <span className="command-count">{commandCount}</span>
      )}
    </button>
  );
};

export default CommandQueueButton;
