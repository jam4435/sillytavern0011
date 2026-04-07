import React from 'react';
import { useFullscreen } from '../utils/useFullscreen';

interface FullscreenButtonProps {
  className?: string;
}

/**
 * 全屏切换按钮组件
 */
const FullscreenButton: React.FC<FullscreenButtonProps> = ({ className }) => {
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  return (
    <button
      className={`fullscreen-btn ${className || ''}`}
      onClick={toggleFullscreen}
      title={isFullscreen ? '退出全屏' : '进入全屏'}
    >
      {isFullscreen ? (
        // 退出全屏图标
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
        </svg>
      ) : (
        // 进入全屏图标
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      )}
    </button>
  );
};

export default FullscreenButton;
