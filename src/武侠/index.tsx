import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/main.scss';
import { initLogger } from './utils/logger';

// 保存 root 实例以便卸载
let root: ReactDOM.Root | null = null;

// 使用 jQuery 加载方式（酒馆助手规范）
$(() => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    initLogger.error('Could not find root element to mount to');
    return;
  }
  
  root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  
  initLogger.log('✅ 墨剑录界面已加载');
});

// 卸载处理
$(window).on('pagehide', () => {
  if (root) {
    root.unmount();
    root = null;
  }
  initLogger.log('🔄 墨剑录界面已卸载');
});
