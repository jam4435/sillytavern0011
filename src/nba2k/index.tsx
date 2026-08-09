import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import './styles/main.scss';

let root: Root | null = null;

$(() => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('[nba2k] 找不到 #root 挂载点');
    return;
  }
  root = createRoot(rootElement);
  root.render(<App />);
});

$(window).on('pagehide', () => {
  if (root) {
    root.unmount();
    root = null;
  }
});
