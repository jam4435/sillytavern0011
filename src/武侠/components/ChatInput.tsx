import React, { useCallback, useRef, useState } from 'react';
import { uiLogger } from '../utils/logger';

interface ChatInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * 武侠风格聊天输入组件
 * 带有精美的玻璃拟态效果和微交互动画
 */
const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  placeholder = '书写你的江湖故事...',
  disabled = false
}) => {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSend = () => {
    uiLogger.log('');
    uiLogger.log('📤 [ChatInput.handleSend] 发送按钮被点击');
    uiLogger.log('   message:', message);
    uiLogger.log('   message.trim():', message.trim());
    uiLogger.log('   disabled:', disabled);
    uiLogger.log('   条件判断: message.trim() && !disabled =', !!(message.trim() && !disabled));
    
    if (message.trim() && !disabled) {
      uiLogger.log('✅ [ChatInput.handleSend] 条件满足，调用 onSend()');
      uiLogger.log('   发送内容:', message.trim());
      onSend(message.trim());
      uiLogger.log('   onSend() 调用完成');
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      uiLogger.log('   输入框已清空');
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
            disabled={disabled}
            rows={1}
          />
          
          {/* 字数提示 */}
          {message.length > 0 && (
            <span className="chat-input-count">{message.length}</span>
          )}
        </div>

        {/* 发送按钮 */}
        <button
          className={`chat-send-btn ${message.trim() ? 'active' : ''}`}
          onClick={handleSend}
          disabled={disabled || !message.trim()}
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
