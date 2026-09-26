import { ChevronDown, RotateCcw, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { uiLogger } from '../utils/logger';

export type RegenerateDraftMode = 'user-input' | 'assistant-append';

export interface RegenerateDraftSubmission {
  replacementUserInput?: string;
  previousAssistantAppendText?: string;
}

interface ChatInputProps {
  onSend: (message: string) => void | Promise<unknown>;
  prefill?: { key: string; message: string } | null;
  onMessageChange?: (message: string) => void;
  extraActions?: React.ReactNode;
  onRegenerate?: (draft?: RegenerateDraftSubmission) => void | Promise<boolean | void>;
  onEditRegenerateInput?: () => void;
  onRegenerateDraftModeChange?: (mode: RegenerateDraftMode) => void;
  onCancelRegenerateDraft?: () => void;
  canRegenerate?: boolean;
  isRegenerating?: boolean;
  regenerateDraftMode?: RegenerateDraftMode | null;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * 武侠风格聊天输入组件
 * 普通模式负责新回合发送；修改上一轮输入时切换为单一“重新生成”提交模式。
 */
const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  prefill = null,
  onMessageChange,
  extraActions,
  onRegenerate,
  onEditRegenerateInput,
  onRegenerateDraftModeChange,
  onCancelRegenerateDraft,
  canRegenerate = false,
  isRegenerating = false,
  regenerateDraftMode = null,
  placeholder = '书写你的江湖故事...',
  disabled = false,
}) => {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegenerateMenuOpen, setIsRegenerateMenuOpen] = useState(false);
  const [regenerateDrafts, setRegenerateDrafts] = useState<Record<RegenerateDraftMode, string>>({
    'user-input': '',
    'assistant-append': '',
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputDisabled = disabled || isSubmitting;
  const effectiveRegenerateDrafts =
    regenerateDraftMode === 'user-input'
      ? { ...regenerateDrafts, 'user-input': message }
      : regenerateDraftMode === 'assistant-append'
        ? { ...regenerateDrafts, 'assistant-append': message }
        : regenerateDrafts;
  const hasRegenerateDraftContent =
    Boolean(effectiveRegenerateDrafts['user-input'].trim()) ||
    Boolean(effectiveRegenerateDrafts['assistant-append'].trim());
  const regenerateDisabled =
    disabled ||
    isSubmitting ||
    isRegenerating ||
    !canRegenerate ||
    !onRegenerate ||
    (Boolean(regenerateDraftMode) && !hasRegenerateDraftContent);
  const prefillKey = prefill?.key ?? null;
  const prefillMessage = prefill?.message ?? '';

  // 自动调整文本框高度
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 150);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    if (!prefillKey) return;
    setMessage(prefillMessage);
    if (regenerateDraftMode) {
      setRegenerateDrafts(previous => ({
        ...previous,
        [regenerateDraftMode]: prefillMessage,
      }));
    }
    const frame = window.requestAnimationFrame(adjustHeight);
    return () => window.cancelAnimationFrame(frame);
  }, [adjustHeight, prefillKey, prefillMessage]);

  useEffect(() => {
    if (!prefillKey || inputDisabled) return;
    textareaRef.current?.focus();
  }, [inputDisabled, prefillKey]);

  useEffect(() => {
    if (regenerateDraftMode || !canRegenerate || disabled) {
      setIsRegenerateMenuOpen(false);
    }
  }, [canRegenerate, disabled, regenerateDraftMode]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextMessage = e.target.value;
    setMessage(nextMessage);
    if (regenerateDraftMode) {
      setRegenerateDrafts(previous => ({
        ...previous,
        [regenerateDraftMode]: nextMessage,
      }));
    } else {
      onMessageChange?.(nextMessage);
    }
    adjustHeight();
  };

  const clearInput = (notify = true) => {
    setMessage('');
    if (notify) onMessageChange?.('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSend = async () => {
    uiLogger.log('');
    uiLogger.log('📤 [ChatInput.handleSend] 发送按钮被点击');
    uiLogger.log('   message:', message);
    uiLogger.log('   message.trim():', message.trim());
    uiLogger.log('   disabled:', inputDisabled);
    uiLogger.log('   条件判断: message.trim() && !disabled =', !!(message.trim() && !inputDisabled));

    if (message.trim() && !inputDisabled) {
      uiLogger.log('✅ [ChatInput.handleSend] 条件满足，调用 onSend()');
      const trimmedMessage = message.trim();
      uiLogger.log('   发送内容:', trimmedMessage);
      clearInput();
      uiLogger.log('   输入框已清空');
      setIsSubmitting(true);
      try {
        await onSend(trimmedMessage);
        uiLogger.log('   onSend() 调用完成');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      uiLogger.log('⚠️ [ChatInput.handleSend] 条件不满足，未发送');
    }
  };

  const handleRegenerate = async () => {
    if (regenerateDisabled || !onRegenerate) {
      return;
    }

    setIsRegenerateMenuOpen(false);
    setIsSubmitting(true);
    try {
      const result = await onRegenerate(
        regenerateDraftMode
          ? {
              replacementUserInput: effectiveRegenerateDrafts['user-input'].trim() || undefined,
              previousAssistantAppendText: effectiveRegenerateDrafts['assistant-append'].trim() || undefined,
            }
          : undefined,
      );
      if (result === true && regenerateDraftMode) {
        clearInput(false);
        setRegenerateDrafts({ 'user-input': '', 'assistant-append': '' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (regenerateDraftMode) {
      await handleRegenerate();
      return;
    }
    await handleSend();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handlePrimaryAction();
    }
  };

  const handlePrepareRegenerateInput = () => {
    setIsRegenerateMenuOpen(false);
    onEditRegenerateInput?.();
  };

  const handleRegenerateDraftModeChange = (mode: RegenerateDraftMode) => {
    if (mode === regenerateDraftMode || inputDisabled) return;
    if (regenerateDraftMode) {
      setRegenerateDrafts(previous => ({
        ...previous,
        [regenerateDraftMode]: message,
      }));
    }
    setMessage(regenerateDrafts[mode]);
    onRegenerateDraftModeChange?.(mode);
    window.requestAnimationFrame(adjustHeight);
  };

  const handleCancelRegenerateDraft = () => {
    clearInput(false);
    setRegenerateDrafts({ 'user-input': '', 'assistant-append': '' });
    setIsRegenerateMenuOpen(false);
    onCancelRegenerateDraft?.();
  };

  const handleRegenerateGroupBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsRegenerateMenuOpen(false);
    }
  };

  const primaryDisabled = regenerateDraftMode ? regenerateDisabled : inputDisabled || !message.trim();

  return (
    <div
      className={`chat-input-wrapper ${isFocused ? 'focused' : ''} ${regenerateDraftMode ? 'regenerate-draft-mode' : ''}`}
    >
      {/* 装饰性顶部边框 */}
      <div className="chat-input-top-border"></div>

      <div className="chat-input-container">
        {/* 左侧装饰 */}
        <div className="chat-input-decor left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 12l10 10 10-10L12 2z" />
          </svg>
        </div>

        {/* 输入区域 */}
        <div className={`chat-input-field-wrapper ${regenerateDraftMode ? 'has-mode-badge' : ''}`}>
          {regenerateDraftMode && (
            <div className="chat-input-mode-switcher" role="group" aria-label="重新生成编辑模式">
              <button
                type="button"
                className={`chat-input-mode-tab ${regenerateDraftMode === 'user-input' ? 'active' : ''}`}
                onClick={() => handleRegenerateDraftModeChange('user-input')}
                disabled={inputDisabled}
                aria-pressed={regenerateDraftMode === 'user-input'}
              >
                修改上一轮输入
              </button>
              <button
                type="button"
                className={`chat-input-mode-tab ${regenerateDraftMode === 'assistant-append' ? 'active' : ''}`}
                onClick={() => handleRegenerateDraftModeChange('assistant-append')}
                disabled={inputDisabled}
                aria-pressed={regenerateDraftMode === 'assistant-append'}
              >
                追加上一轮输出
              </button>
              <button
                type="button"
                className="chat-input-mode-cancel"
                onClick={handleCancelRegenerateDraft}
                disabled={inputDisabled}
                aria-label="退出重新生成编辑模式"
                title="退出并返回普通输入"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="chat-input-field"
            aria-label="玩家行动"
            data-wuxia-automation="player-input"
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={inputDisabled}
            rows={1}
          />

          {/* 字数提示 */}
          {message.length > 0 && <span className="chat-input-count">{message.length}</span>}
        </div>

        {!regenerateDraftMode && extraActions}

        {/* 普通模式：直接重生 + 紧凑的“修改上一轮输入”二级入口 */}
        {!regenerateDraftMode && (
          <div className="chat-regenerate-group" onBlur={handleRegenerateGroupBlur}>
            <button
              className={`chat-regenerate-btn chat-regenerate-main ${isRegenerating ? 'spinning' : ''}`}
              aria-label="重新生成上一条回复"
              data-wuxia-automation="generation-state regenerate-last-reply"
              data-wuxia-generating={isRegenerating ? 'true' : 'false'}
              onClick={handleRegenerate}
              disabled={regenerateDisabled}
              title={canRegenerate ? '重新生成上一条回复' : '暂无可重新生成的回复'}
              type="button"
            >
              <RotateCcw size={18} />
            </button>
            {onEditRegenerateInput && (
              <button
                className="chat-regenerate-btn chat-regenerate-menu-btn"
                type="button"
                aria-label="重新生成选项"
                aria-haspopup="menu"
                aria-expanded={isRegenerateMenuOpen}
                onClick={() => setIsRegenerateMenuOpen(open => !open)}
                disabled={regenerateDisabled}
                title="更多重新生成方式"
              >
                <ChevronDown size={13} aria-hidden="true" />
              </button>
            )}
            {isRegenerateMenuOpen && onEditRegenerateInput && (
              <div className="chat-regenerate-menu" role="menu">
                <button type="button" role="menuitem" onClick={handlePrepareRegenerateInput}>
                  修改上一轮输入后重新生成
                </button>
              </div>
            )}
          </div>
        )}

        {/* 主操作：普通模式发送；修改上一轮输入时直接变为重新生成 */}
        <button
          className={`chat-send-btn ${message.trim() ? 'active' : ''} ${regenerateDraftMode ? 'regenerate-mode' : ''} ${isRegenerating ? 'spinning' : ''}`}
          aria-label={
            regenerateDraftMode === 'user-input'
              ? '使用修改后的上一轮输入重新生成'
              : regenerateDraftMode === 'assistant-append'
                ? '追加信息到上一轮输出并重新生成'
                : '发送玩家行动'
          }
          data-wuxia-automation={regenerateDraftMode ? 'generation-state regenerate-last-reply' : 'send-turn'}
          onClick={handlePrimaryAction}
          disabled={primaryDisabled}
          title={
            regenerateDraftMode === 'user-input'
              ? '使用修改内容重新生成 (Enter)'
              : regenerateDraftMode === 'assistant-append'
                ? '追加信息并重新生成 (Enter)'
                : '发送 (Enter)'
          }
          type="button"
        >
          <div className="send-btn-bg"></div>
          {regenerateDraftMode ? (
            <>
              <RotateCcw className="send-btn-icon" size={19} aria-hidden="true" />
              <span className="send-btn-label">重新生成</span>
            </>
          ) : (
            <svg
              className="send-btn-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          )}
        </button>

        {/* 右侧装饰 */}
        <div className="chat-input-decor right">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 12l10 10 10-10L12 2z" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
