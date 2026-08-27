import { describe, expect, it } from 'vitest';
import { MOBILE_LAYOUT_BREAKPOINT } from './config.js';
import { isMobileViewportWidth } from './utils.js';

describe('世界书面板移动布局判定', () => {
  it('在共享断点及以下使用移动布局', () => {
    expect(isMobileViewportWidth(390)).toBe(true);
    expect(isMobileViewportWidth(MOBILE_LAYOUT_BREAKPOINT)).toBe(true);
  });

  it('在共享断点以上使用桌面布局，包括常见 iPad 竖屏宽度', () => {
    expect(isMobileViewportWidth(MOBILE_LAYOUT_BREAKPOINT + 1)).toBe(false);
    expect(isMobileViewportWidth(810)).toBe(false);
    expect(isMobileViewportWidth(820)).toBe(false);
    expect(isMobileViewportWidth(834)).toBe(false);
  });

  it('拒绝无效视口宽度，避免误切到移动布局', () => {
    expect(isMobileViewportWidth(Number.NaN)).toBe(false);
    expect(isMobileViewportWidth(Infinity)).toBe(false);
  });
});
