import $ from 'jquery';
import _ from 'lodash';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendToThemePortal,
  buildThemeSurfaceVariables,
  ensureThemePortal,
  syncThemeSurfaces,
  THEME_PORTAL_ID,
} from './themeSurface.js';

let loadTheme: typeof import('./theme.js').loadTheme;
let normalizeHexColor: typeof import('./theme.js').normalizeHexColor;
let buildThemeCssVariables: typeof import('./theme.js').buildThemeCssVariables;

beforeAll(async () => {
  vi.stubGlobal('$', $);
  vi.stubGlobal('_', _);
  ({ buildThemeCssVariables, loadTheme, normalizeHexColor } = await import('./theme.js'));
});

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('世界书面板主题可见性', () => {
  it('把旧主题中的完全透明面板迁移到可读下限', () => {
    localStorage.setItem(
      'enhanced-lorebook-theme',
      JSON.stringify({
        version: 3,
        shared: {},
        layouts: {
          drawer: { panelOpacity: 0 },
          'master-detail': { panelOpacity: 0 },
        },
      }),
    );

    expect(loadTheme('drawer').panelOpacity).toBe(0.35);
    expect(JSON.parse(localStorage.getItem('enhanced-lorebook-theme') || '{}').version).toBe(4);
  });

  it('保留默认主题的不透明面板', () => {
    expect(loadTheme('drawer').panelOpacity).toBe(1);
  });
});

describe('世界书面板主题颜色输入', () => {
  it('规范化完整和简写的十六进制颜色值', () => {
    expect(normalizeHexColor('A1B2C3')).toBe('#a1b2c3');
    expect(normalizeHexColor('#AbC')).toBe('#aabbcc');
  });

  it('在输入过程只接受完整的六位颜色值', () => {
    expect(normalizeHexColor('#abc', { allowShort: false })).toBeNull();
    expect(normalizeHexColor('#abcdef', { allowShort: false })).toBe('#abcdef');
    expect(normalizeHexColor('#gggggg')).toBeNull();
  });
});

describe('世界书面板主题 portal', () => {
  it('幂等创建共享挂载点，并可追加 HTML、DOM 与 jQuery 内容', () => {
    const portal = ensureThemePortal(document);
    expect(portal.id).toBe(THEME_PORTAL_ID);
    expect(portal.classList.contains('lorebook-theme-scope')).toBe(true);
    expect(portal.style.display).toBe('none');
    expect(portal.style.position).toBe('');
    expect(portal.style.inset).toBe('');
    expect(portal.style.zIndex).toBe('');
    expect(portal.style.pointerEvents).toBe('');
    expect(ensureThemePortal(document)).toBe(portal);

    appendToThemePortal('<dialog id="html-overlay"></dialog>', document);
    const domOverlay = document.createElement('div');
    domOverlay.id = 'dom-overlay';
    appendToThemePortal(domOverlay, document);
    appendToThemePortal($('<div id="jquery-overlay"></div>'), document);

    expect(portal.children).toHaveLength(0);
    ['html-overlay', 'dom-overlay', 'jquery-overlay'].forEach(id => {
      const overlay = document.getElementById(id);
      expect(overlay?.parentElement).toBe(document.body);
      expect(overlay?.classList.contains('lorebook-theme-scope')).toBe(true);
      expect(overlay?.dataset.lorebookThemeSurface).toBe('overlay');
    });
  });

  it('把旧 portal 中的弹窗迁移为 body 直接子节点', () => {
    const legacyPortal = document.createElement('div');
    legacyPortal.id = THEME_PORTAL_ID;
    legacyPortal.innerHTML = '<div id="legacy-overlay" class="lorebook-themed-modal"></div>';
    document.body.appendChild(legacyPortal);

    const portal = ensureThemePortal(document);
    const overlay = document.getElementById('legacy-overlay');

    expect(portal.style.display).toBe('none');
    expect(portal.children).toHaveLength(0);
    expect(overlay?.parentElement).toBe(document.body);
    expect(overlay?.classList.contains('lorebook-theme-scope')).toBe(true);
    expect(overlay?.dataset.lorebookThemeSurface).toBe('overlay');
  });

  it('让主面板与 portal 共享完整变量和 color-scheme', () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    appendToThemePortal('<div id="themed-overlay"></div>', document);
    const overlay = document.getElementById('themed-overlay')!;
    const variables = buildThemeSurfaceVariables({
      semanticTokens: { '--panel-border-color': '#345678' },
      panelBgColor: '#ffffff',
      textColor: '#111111',
      accentColor: '#336699',
      entryBgColor: '#f5f5f5',
      inputBgColor: '#eeeeee',
      inputFocusBgColor: '#dddddd',
      dropdownActiveBgColor: '#cccccc',
      entryHoverBgColor: '#ededed',
      selectedBgColor: '#ddeeff',
      backgroundImage: 'none',
      backgroundImageOpacity: '0',
      iconBgColor: '#bbbbbb',
      iconHoverBgColor: '#aaaaaa',
      panelAccentTextColor: '#ffffff',
      lorebookNameWhiteSpace: 'nowrap',
      lorebookNameTextOverflow: 'ellipsis',
      lorebookNameOverflowWrap: 'normal',
      lorebookNameWordBreak: 'normal',
      lorebookTitleAlignItems: 'center',
    });

    const portal = syncThemeSurfaces(document, panel, variables, 'light');

    [panel, portal, overlay].forEach(surface => {
      expect(surface.style.getPropertyValue('--panel-bg-color')).toBe('#ffffff');
      expect(surface.style.getPropertyValue('--panel-text-color')).toBe('#111111');
      expect(surface.style.getPropertyValue('--modal-bg-color')).toBe('#ffffff');
      expect(surface.style.getPropertyValue('--modal-text-color')).toBe('#111111');
      expect(surface.style.getPropertyValue('--yaml-input-bg-color')).toBe('#eeeeee');
      expect(surface.style.getPropertyValue('--panel-border-color')).toBe('#345678');
      expect(surface.style.colorScheme).toBe('light');
    });
  });

  it('从布局主题生成弹窗可复用的完整 CSS 变量', () => {
    const variables = buildThemeCssVariables({
      bgColor: '#ffffff',
      textColor: '#111111',
      accentColor: '#336699',
      entryBgColor: '#f5f5f5',
      inputBgColor: '#eeeeee',
      panelOpacity: 1,
    });

    expect(variables['--panel-bg-color']).toBe('#ffffff');
    expect(variables['--modal-bg-color']).toBe('#ffffff');
    expect(variables['--panel-text-color']).toBe('#111111');
    expect(variables['--panel-input-bg-color']).toBe('#eeeeee');
    expect(variables['--ai-border-color']).toBeTruthy();
  });

  it('面板半透明时仍忠实保留输入框颜色，不与宿主背景混成灰色', () => {
    const variables = buildThemeCssVariables({
      bgColor: '#ffffff',
      textColor: '#111111',
      accentColor: '#33aadd',
      entryBgColor: '#ffffff',
      inputBgColor: '#ffffff',
      panelOpacity: 0.35,
    });

    expect(variables['--panel-bg-color']).toContain('color-mix');
    expect(variables['--panel-input-bg-color']).toBe('#ffffff');
    expect(variables['--panel-dropdown-bg-color']).toBe('#ffffff');
    expect(variables['--search-input-bg-color']).toBe('#ffffff');
    expect(variables['--yaml-input-bg-color']).toBe('#ffffff');
  });
});
