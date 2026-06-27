/**
 * 指令队列按钮组件
 * 显示在ChatInput旁边，显示待发送指令数量
 */

import { ListTodo } from 'lucide-react';
import React from 'react';
import { PendingCommand } from '../types';

interface CommandQueueButtonProps {
  commands: PendingCommand[];
  onClick: () => void;
}

const CommandQueueButton: React.FC<CommandQueueButtonProps> = ({ commands, onClick }) => {
  const commandCount = commands.length;

  return (
    <button
      className="command-queue-btn"
      onClick={onClick}
      aria-label="查看指令队列"
      title={commandCount > 0 ? `${commandCount} 条待发送指令` : '指令队列'}
    >
      <ListTodo size={20} />

      {/* 数量徽章 */}
      {commandCount > 0 && <span className="command-count">{commandCount}</span>}
    </button>
  );
};

export default CommandQueueButton;
