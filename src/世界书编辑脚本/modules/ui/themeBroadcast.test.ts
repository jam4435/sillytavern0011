import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildThemeBroadcastCss,
  removeThemeBroadcast,
  syncThemeBroadcast,
  THEME_BROADCAST_STYLE_ID,
} from './themeBroadcast.js';

describe('themeBroadcast 动态主题广播模块', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('正确编译 CSS 规则文本', () => {
    const css = buildThemeBroadcastCss(
      {
        '--panel-bg-color': '#112233',
        '--panel-accent-color': '#ff5500',
      },
      'dark',
      ['#test-modal-1', '#test-modal-2'],
    );

    expect(css).toContain('#test-modal-1,\n#test-modal-2 {');
    expect(css).toContain('--panel-bg-color: #112233;');
    expect(css).toContain('--panel-accent-color: #ff5500;');
    expect(css).toContain('color-scheme: dark;');
  });

  it('向 head 注入并原地更新单个 style 标签', () => {
    syncThemeBroadcast(document, { '--panel-bg-color': '#111' }, 'dark');

    const style = document.getElementById(THEME_BROADCAST_STYLE_ID);
    expect(style).not.toBeNull();
    expect(style?.tagName).toBe('STYLE');
    expect(style?.textContent).toContain('--panel-bg-color: #111;');

    // 再次调用更新，标签实例保持同一节点，文本更新
    syncThemeBroadcast(document, { '--panel-bg-color': '#222' }, 'light');
    const styles = document.querySelectorAll(`style#${THEME_BROADCAST_STYLE_ID}`);
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toContain('--panel-bg-color: #222;');
    expect(styles[0].textContent).toContain('color-scheme: light;');
  });

  it('正确编译表单控件规则并排除 entry-item-title', () => {
    const css = buildThemeBroadcastCss(
      {
        '--panel-input-bg-color': '#ff0000',
        '--panel-text-color': '#ffffff',
      },
      'dark',
      ['#test-modal'],
      ['#test-modal'],
    );

    expect(css).toContain('#test-modal input:not(.entry-item-title)');
    expect(css).toContain('background-color: var(--panel-input-bg-color) !important;');
    expect(css).toContain('background-color: var(--panel-input-focus-bg-color) !important;');
  });

  it('可安全彻底卸载广播样式表', () => {
    syncThemeBroadcast(document, { '--panel-bg-color': '#111' }, 'dark');
    expect(document.getElementById(THEME_BROADCAST_STYLE_ID)).not.toBeNull();

    removeThemeBroadcast(document);
    expect(document.getElementById(THEME_BROADCAST_STYLE_ID)).toBeNull();
  });
});
