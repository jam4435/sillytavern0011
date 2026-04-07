/**
 * 指令队列浮窗组件
 * 显示所有待发送的指令，支持取消和发送
 */

import React, { useRef, useEffect } from 'react';
import { PendingCommand } from '../types';

interface CommandQueuePopoverProps {
  commands: PendingCommand[];
  onCancel: (commandId: string) => void;
  onSendAll: () => void;
  onClose: () => void;
}

const CommandQueuePopover: React.FC<CommandQueuePopoverProps> = ({
  commands,
  onCancel,
  onSendAll,
  onClose
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭浮窗
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div ref={popoverRef} className="command-queue-popover">
      <div className="popover-header">
        <span className="popover-title">待发送指令</span>
        <span className="command-count-badge">{commands.length}</span>
      </div>

      <div className="command-list">
        {commands.length === 0 ? (
          <div className="empty-message">暂无待发送指令</div>
        ) : (
          commands.map((command) => (
            <div key={command.id} className="command-card">
              <div className="command-content">
                <div className="command-type-icon">
                  {command.type === 'TRAVEL' ? '🗺️' : '🧪'}
                </div>
                <div className="command-text">{command.text}</div>
              </div>
              <button
                className="cancel-btn"
                onClick={() => onCancel(command.id)}
                aria-label="取消指令"
                title="取消指令"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {commands.length > 0 && (
        <div className="popover-footer">
          <button className="clear-all-btn" onClick={onClose}>
            关闭
          </button>
          <button className="send-all-btn" onClick={onSendAll}>
            发送全部 ({commands.length})
          </button>
        </div>
      )}
    </div>
  );
};

export default CommandQueuePopover;
