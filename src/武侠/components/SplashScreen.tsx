import React from 'react';
import FullscreenButton from './FullscreenButton';

interface SplashScreenProps {
  hasSavedGame: boolean;
  onNewGame: () => void;
  onContinue: () => void;
}

/**
 * 标题页面组件
 * 显示新游戏/继续游戏选项
 */
const SplashScreen: React.FC<SplashScreenProps> = ({
  hasSavedGame,
  onNewGame,
  onContinue
}) => {
  return (
    <div className="splash-screen">
      {/* 背景装饰 */}
      <div className="splash-bg-layer">
        <div className="splash-bg-img"></div>
        <div className="splash-bg-overlay"></div>
      </div>

      {/* 全屏按钮 */}
      <FullscreenButton className="splash-fullscreen-btn" />

      {/* 主要内容 */}
      <div className="splash-content">
        {/* 标题区域 */}
        <div className="splash-header">
          <div className="splash-logo">
            <span className="logo-main">墨</span>
            <span className="logo-sub">剑录</span>
          </div>
          <p className="splash-tagline">侠骨柔情，笔墨江湖</p>
        </div>

        {/* 菜单按钮 */}
        <div className="splash-menu">
          <button 
            className="menu-btn primary"
            onClick={onNewGame}
          >
            <span className="btn-icon">⚔</span>
            <span className="btn-text">新的故事</span>
          </button>

          {hasSavedGame && (
            <button 
              className="menu-btn secondary"
              onClick={onContinue}
            >
              <span className="btn-icon">📜</span>
              <span className="btn-text">续写江湖</span>
            </button>
          )}
        </div>

        {/* 装饰元素 */}
        <div className="splash-decoration">
          <div className="deco-line left"></div>
          <div className="deco-symbol">☯</div>
          <div className="deco-line right"></div>
        </div>
      </div>

      {/* 底部信息 */}
      <div className="splash-footer">
        <p className="version-text">墨剑录 v1.0</p>
        <p className="credit-text">基于酒馆助手构建</p>
      </div>
    </div>
  );
};

export default SplashScreen;
