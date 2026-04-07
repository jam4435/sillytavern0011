import React from 'react';
import { useFullscreen } from '../utils/useFullscreen';

interface StartScreenProps {
  onStart: () => void;
}

/**
 * 开始屏幕组件
 * 点击任意处进入标题页面
 */
const StartScreen: React.FC<StartScreenProps> = ({ onStart }) => {
  const { requestFullscreen } = useFullscreen();

  const handleStart = () => {
    requestFullscreen(); // 自动请求全屏
    onStart();
  };

  return (
    <div
      className="start-screen"
      onClick={handleStart}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleStart();
        }
      }}
    >
      {/* 背景装饰 */}
      <div className="start-bg-layer">
        <div className="start-bg-ink"></div>
        <div className="start-bg-gradient"></div>
      </div>

      {/* 主要内容 */}
      <div className="start-content">
        {/* 书法标题 */}
        <div className="start-title-group">
          <h1 className="start-title">墨剑录</h1>
          <p className="start-subtitle">Ink & Blade</p>
        </div>

        {/* 装饰线 */}
        <div className="start-divider">
          <span className="divider-line"></span>
          <span className="divider-dot"></span>
          <span className="divider-line"></span>
        </div>

        {/* 提示文字 */}
        <div className="start-hint">
          <span className="hint-text">点击任意处开始</span>
          <span className="hint-cursor"></span>
        </div>
      </div>

      {/* 底部版权 */}
      <div className="start-footer">
        <span className="footer-text">基于酒馆助手 · Tavern Helper</span>
      </div>
    </div>
  );
};

export default StartScreen;
