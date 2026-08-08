import { describe, expect, it } from 'vitest';
import {
  getLocationScene,
  getLocationScopePath,
  isSameLocationScene,
  isSameLocationScope,
  normalizeLocationPath,
  parseLocationPath,
} from './locationPath.js';

describe('locationPath', () => {
  it('accepts strict three-level and optional four-level paths', () => {
    expect(parseLocationPath('大宋 / 临安府 / 牛家村')).toMatchObject({
      scopePath: '大宋/临安府/牛家村',
      fullPath: '大宋/临安府/牛家村',
      scene: null,
    });
    expect(parseLocationPath('大宋＞临安府＞牛家村＞村西树林')).toMatchObject({
      scopePath: '大宋/临安府/牛家村',
      fullPath: '大宋/临安府/牛家村/村西树林',
      scene: '村西树林',
    });
  });

  it('rejects abbreviated, overlong, and empty-segment paths', () => {
    expect(parseLocationPath('牛家村')).toBeNull();
    expect(parseLocationPath('临安府/牛家村')).toBeNull();
    expect(parseLocationPath('大宋/临安府//牛家村')).toBeNull();
    expect(parseLocationPath('大宋/临安府/牛家村/村西树林/树下')).toBeNull();
    expect(normalizeLocationPath('大宋/临安府/')).toBe('');
  });

  it('compares scopes separately from full narrative scenes', () => {
    const woods = '大宋/临安府/牛家村/村西树林';
    const inn = '大宋/临安府/牛家村/曲三酒馆';
    expect(getLocationScopePath(woods)).toBe('大宋/临安府/牛家村');
    expect(getLocationScene(woods)).toBe('村西树林');
    expect(isSameLocationScope(woods, inn)).toBe(true);
    expect(isSameLocationScene(woods, inn)).toBe(false);
    expect(isSameLocationScope(woods, '大宋/临安府/临安城/皇宫')).toBe(false);
  });
});
