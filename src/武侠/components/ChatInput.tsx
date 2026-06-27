import { RotateCcw } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';
import { uiLogger } from '../utils/logger';

interface ChatInputProps {
  onSend: (message: string) => void | Promise<unknown>;
  extraActions?: React.ReactNode;
  onRegenerate?: () => void | Promise<void>;
  canRegenerate?: boolean;
  isRegenerating?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * 武侠风格聊天输入组件
 * 带有精美的玻璃拟态效果和微交互动画
 */
const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  extraActions,
  onRegenerate,
  canRegenerate = false,
  isRegenerating = false,
  placeholder = '书写你的江湖故事...',
  disabled = false
}) => {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputDisabled = disabled || isSubmitting;
  const regenerateDisabled = disabled || isSubmitting || isRegenerating || !canRegenerate || !onRegenerate;

  // 自动调整文本框高度
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 150);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    adjustHeight();
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
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRegenerate = async () => {
    if (regenerateDisabled || !onRegenerate) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onRegenerate();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`chat-input-wrapper ${isFocused ? 'focused' : ''}`}>
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
        <div className="chat-input-field-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input-field"
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
          {message.length > 0 && (
            <span className="chat-input-count">{message.length}</span>
          )}
        </div>

        {extraActions}

        {/* 重新生成按钮 */}
        <button
          className={`chat-regenerate-btn ${isRegenerating ? 'spinning' : ''}`}
          onClick={handleRegenerate}
          disabled={regenerateDisabled}
          title={canRegenerate ? '重新生成上一条回复' : '暂无可重新生成的回复'}
        >
          <RotateCcw size={18} />
        </button>

        {/* 发送按钮 */}
        <button
          className={`chat-send-btn ${message.trim() ? 'active' : ''}`}
          onClick={handleSend}
          disabled={inputDisabled || !message.trim()}
          title="发送 (Enter)"
        >
          <div className="send-btn-bg"></div>
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
