import $ from 'jquery';
import _ from 'lodash';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let loadTheme: typeof import('./theme.js').loadTheme;

beforeAll(async () => {
  vi.stubGlobal('$', $);
  vi.stubGlobal('_', _);
  ({ loadTheme } = await import('./theme.js'));
});

beforeEach(() => {
  localStorage.clear();
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
