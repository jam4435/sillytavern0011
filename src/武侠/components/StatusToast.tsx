import { AlertCircle, Loader2, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

export type ToastStatus = 'idle' | 'loading' | 'error';

export interface ToastState {
  status: ToastStatus;
  message: string;
}

interface StatusToastProps {
  state: ToastState;
  onDismiss?: () => void;
  autoHideDelay?: number; // 错误消息自动隐藏延迟（毫秒），0 表示不自动隐藏
}

/**
 * 顶部状态提示组件
 * 用于显示加载状态和错误信息
 */
const StatusToast: React.FC<StatusToastProps> = ({
  state,
  onDismiss,
  autoHideDelay = 5000,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // 控制显示/隐藏动画
  useEffect(() => {
    if (state.status !== 'idle') {
      setIsVisible(true);
      setIsExiting(false);
    } else {
      // 先触发退出动画
      setIsExiting(true);
      // 动画结束后隐藏
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsExiting(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [state.status]);

  // 错误消息自动隐藏
  useEffect(() => {
    if (state.status === 'error' && autoHideDelay > 0 && onDismiss) {
      const timer = setTimeout(() => {
        onDismiss();
      }, autoHideDelay);
      return () => clearTimeout(timer);
    }
  }, [state.status, autoHideDelay, onDismiss]);

  // 如果不可见，不渲染任何内容
  if (!isVisible) {
    return null;
  }

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <div
      className={`status-toast ${state.status} ${isExiting ? 'exiting' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="status-toast-content">
        {/* 图标 */}
        <div className="status-toast-icon">
          {state.status === 'loading' && (
            <Loader2 className="spin" size={18} />
          )}
          {state.status === 'error' && (
            <AlertCircle size={18} />
          )}
        </div>

        {/* 消息 */}
        <span className="status-toast-message">{state.message}</span>

        {/* 关闭按钮（仅错误状态显示） */}
        {state.status === 'error' && onDismiss && (
          <button
            className="status-toast-close"
            onClick={handleDismiss}
            aria-label="关闭提示"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default StatusToast;
