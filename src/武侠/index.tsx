import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/main.scss';
import { ensureLoaderRegexSafety } from './utils/loaderRegexGuard';
import { getRuntimeDebugInfo, initLogger, variableTraceLogger } from './utils/logger';
import {
  clearPendingIframeReloadReason,
  readPendingIframeReloadReason,
  recordIframeLifecycleEvent,
} from './utils/iframeLifecycleBlackBox';

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
  const runtime = getRuntimeDebugInfo();
  const pendingReload = readPendingIframeReloadReason();
  recordIframeLifecycleEvent(
    'wuxia-frontend',
    'iframe-boot',
    {
      iframeName: runtime.iframeName,
      href: runtime.href,
      pendingReloadReason: pendingReload?.reason ?? 'none',
      pendingReloadSource: pendingReload?.source ?? '',
      pendingReloadMarkerId: pendingReload?.id ?? '',
    },
    runtime.runtimeId,
  );
  if (pendingReload) clearPendingIframeReloadReason(pendingReload.id);

  root = ReactDOM.createRoot(rootElement);
  root.render(<App />);

  void ensureLoaderRegexSafety().catch(error => {
    initLogger.error('修正游戏页面加载正则失败:', error);
  });

  initLogger.log('✅ 金庸群侠传界面已加载');
});

// 卸载处理
$(window).on('pagehide', () => {
  const runtime = getRuntimeDebugInfo();
  const pendingReload = readPendingIframeReloadReason();
  recordIframeLifecycleEvent(
    'wuxia-frontend',
    'iframe-pagehide',
    {
      iframeName: runtime.iframeName,
      reason: pendingReload?.reason ?? 'external-or-unknown',
      reasonSource: pendingReload?.source ?? '',
      reloadMarkerId: pendingReload?.id ?? '',
      hasRoot: Boolean(root),
    },
    runtime.runtimeId,
  );
  variableTraceLogger.warn('[index] 收到 pagehide，准备卸载 React root', {
    ...runtime,
    hasRoot: Boolean(root),
  });
  if (root) {
    root.unmount();
    root = null;
  }
  initLogger.log('🔄 金庸群侠传界面已卸载');
});
