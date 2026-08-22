import { Check, Loader2 } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { ActivePanel } from '../types';
import Modal from './Modal';

interface ChatRenameDialogProps {
  isOpen: boolean;
  mode: 'initial' | 'manual';
  value: string;
  error: string | null;
  isSubmitting: boolean;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onKeepCurrent?: () => void;
  onClose: () => void;
}

const ChatRenameDialog: React.FC<ChatRenameDialogProps> = ({
  isOpen,
  mode,
  value,
  error,
  isSubmitting,
  onChange,
  onConfirm,
  onKeepCurrent,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isInitial = mode === 'initial';

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.select(), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const keepCurrent = onKeepCurrent ?? onClose;
  return (
    <Modal
      isOpen={isOpen}
      onClose={isSubmitting || isInitial ? () => undefined : keepCurrent}
      title={isInitial ? '为这一卷江湖命名' : '重命名聊天存档'}
      type={ActivePanel.SAVE_LOAD}
      showCloseButton={!isInitial}
      overlayClassName="chat-rename-overlay"
      boxClassName="chat-rename-modal"
      contentClassName="chat-rename-modal-content"
    >
      <div className="chat-rename-dialog">
        <p className="chat-rename-dialog__lead">
          {isInitial
            ? '角色已经创建完成。这个名称会显示在酒馆的实际聊天存档列表中，之后仍可在谱牒里修改。'
            : '修改的是当前酒馆实际聊天存档名；节点题名与剧情内容不会改变。'}
        </p>
        <label className="chat-rename-dialog__field">
          <span>聊天存档名称</span>
          <input
            ref={inputRef}
            value={value}
            onChange={event => onChange(event.target.value)}
            maxLength={80}
            disabled={isSubmitting}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'chat-rename-error' : undefined}
            onKeyDown={event => {
              if (event.key === 'Enter') onConfirm();
            }}
          />
        </label>
        {error && (
          <p id="chat-rename-error" className="chat-rename-dialog__error" role="alert">
            {error}
          </p>
        )}
        <div className="chat-rename-dialog__actions">
          <button
            type="button"
            className="history-primary-action"
            disabled={isSubmitting || !value.trim()}
            onClick={onConfirm}
          >
            {isSubmitting ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
            确认命名
          </button>
          {isInitial ? (
            <button type="button" className="history-secondary-action" disabled={isSubmitting} onClick={keepCurrent}>
              保留当前名称
            </button>
          ) : (
            <button type="button" className="history-secondary-action" disabled={isSubmitting} onClick={onClose}>
              取消
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ChatRenameDialog;
