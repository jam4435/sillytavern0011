/**
 * 指令队列浮窗组件
 * 显示待发送指令和当前聊天最近发送记录
 */

import { CornerUpLeft, FlaskConical, History, MapPinned, X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { PendingCommand } from '../types';
import type { InputHistoryEntry } from '../utils/inputHistory';

interface CommandQueuePopoverProps {
  commands: PendingCommand[];
  recentHistory: InputHistoryEntry[];
  onCancel: (commandId: string) => void | Promise<void>;
  onHistorySelect: (entry: InputHistoryEntry) => void;
  onClose: () => void;
}

const CommandQueuePopover: React.FC<CommandQueuePopoverProps> = ({
  commands,
  recentHistory,
  onCancel,
  onHistorySelect,
  onClose,
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
        <span className="popover-title">指令与记录</span>
        <button type="button" className="popover-close-btn" onClick={onClose} title="关闭" aria-label="关闭指令队列">
          <X size={16} />
        </button>
      </div>

      <div className="command-popover-scroll">
        <section className="command-popover-section" aria-labelledby="pending-command-title">
          <div className="command-section-heading">
            <span id="pending-command-title" className="command-section-title">
              待发送指令
            </span>
            <span className="command-count-badge">{commands.length}</span>
          </div>
          <div className="command-list">
            {commands.length === 0 ? (
              <div className="empty-message">暂无待发送指令</div>
            ) : (
              commands.map(command => (
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
        </section>

        <section className="command-popover-section history-section" aria-labelledby="recent-input-title">
          <div className="command-section-heading">
            <span id="recent-input-title" className="command-section-title">
              <History size={15} aria-hidden="true" />
              最近发送
            </span>
          </div>
          <div className="history-list">
            {recentHistory.length === 0 ? (
              <div className="empty-message">暂无发送记录</div>
            ) : (
              recentHistory.map(entry => (
                <button
                  key={entry.messageId}
                  type="button"
                  className="history-card"
                  onClick={() => onHistorySelect(entry)}
                  title="填入输入栏"
                  aria-label={`填入输入栏：${entry.text}`}
                >
                  <span className="history-text">{entry.text}</span>
                  <CornerUpLeft className="history-recall-icon" size={15} aria-hidden="true" />
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CommandQueuePopover;
