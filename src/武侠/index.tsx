import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/main.scss';
import { ensureLoaderRegexSafety } from './utils/loaderRegexGuard';
import { getRuntimeDebugInfo, initLogger, variableTraceLogger } from './utils/logger';

// 保存 root 实例以便卸载
let root: ReactDOM.Root | null = null;

// 使用 jQuery 加载方式（酒馆助手规范）
$(() => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    initLogger.error('Could not find root element to mount to');
    return;
  }

  variableTraceLogger.log('[index] React root 即将挂载', {
    ...getRuntimeDebugInfo(),
    hasRootElement: true,
  });

  root = ReactDOM.createRoot(rootElement);
  root.render(<App />);

  void ensureLoaderRegexSafety().catch(error => {
    initLogger.error('修正游戏页面加载正则失败:', error);
  });
  
  initLogger.log('✅ 墨剑录界面已加载');
});

// 卸载处理
$(window).on('pagehide', () => {
  variableTraceLogger.warn('[index] 收到 pagehide，准备卸载 React root', {
    ...getRuntimeDebugInfo(),
    hasRoot: Boolean(root),
  });
  if (root) {
    root.unmount();
    root = null;
  }
  initLogger.log('🔄 墨剑录界面已卸载');
});
