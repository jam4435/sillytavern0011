/**
 * 指令队列浮窗组件
 * 显示所有待发送的指令，支持取消和发送
 */

import { FlaskConical, MapPinned, X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { PendingCommand } from '../types';

interface CommandQueuePopoverProps {
  commands: PendingCommand[];
  onCancel: (commandId: string) => void | Promise<void>;
  onSendAll: () => void | Promise<void>;
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
      const target = event.target as Element;
      if (popoverRef.current && !popoverRef.current.contains(target) && !target.closest('.command-queue-anchor')) {
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
        <div className="popover-heading">
          <span className="popover-title">待发送指令</span>
          <span className="command-count-badge">{commands.length}</span>
        </div>
        <button type="button" className="popover-close-btn" onClick={onClose} title="关闭" aria-label="关闭指令队列">
          <X size={16} />
        </button>
      </div>

      <div className="command-list">
        {commands.length === 0 ? (
          <div className="empty-message">暂无待发送指令</div>
        ) : (
          commands.map((command) => (
            <div key={command.id} className="command-card">
              <div className="command-content">
                <div className="command-type-icon">
                  {command.type === 'TRAVEL' ? <MapPinned size={17} /> : <FlaskConical size={17} />}
                </div>
                <div className="command-text">{command.text}</div>
              </div>
              <button
                className="cancel-btn"
                onClick={() => onCancel(command.id)}
                aria-label="取消指令"
                title="取消指令"
              >
                <X size={15} />
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
