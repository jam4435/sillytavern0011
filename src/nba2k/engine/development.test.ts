import { describe, expect, it } from 'vitest';
import { GROUP_KEYS, badgeLevel, hotZoneState, initialGroups, overallOf, potentialLevelCap, ratingsFromGroups, upgradeCost } from './development';

describe('v3 development', () => {
  it('所有组从0到20的属性曲线单调，且不是线性平均增幅', () => {
    for (const group of GROUP_KEYS) {
      const values = [0, 5, 10, 15, 20].map(level => {
        const groups = initialGroups('2K16模式', '均衡'); groups[group] = level;
        return Object.values(ratingsFromGroups(groups, 88)).reduce((sum, value) => sum + value, 0);
      });
      expect(values).toEqual([...values].sort((a, b) => a - b));
    }
    const groups = initialGroups('2K16模式', '均衡');
    groups.playmaking = 5; const early = ratingsFromGroups(groups, 88).passAccuracy;
    groups.playmaking = 10; const middle = ratingsFromGroups(groups, 88).passAccuracy;
    groups.playmaking = 15; const late = ratingsFromGroups(groups, 88).passAccuracy;
    expect(middle - early).not.toBe(late - middle);
  });
  it('升级成本与潜力上限符合公式', () => {
    expect([0, 4, 8, 12, 16, 20].map(upgradeCost)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(potentialLevelCap(75)).toBe(14);
    expect(potentialLevelCap(88)).toBe(18);
    expect(potentialLevelCap(99)).toBe(20);
  });
  it('位置总评采用派生权重', () => {
    const ratings = ratingsFromGroups(initialGroups('2K16模式', '外线'), 88);
    expect(overallOf(ratings, 'PG')).not.toBe(overallOf(ratings, 'C'));
  });
  it('徽章与14区冷热规则按门槛工作', () => {
    expect(badgeLevel(20, 70)).toBe('铜'); expect(badgeLevel(60, 80)).toBe('银'); expect(badgeLevel(140, 90)).toBe('金');
    expect(hotZoneState('三分弧顶', 0, 7)).toBe('中性');
    expect(hotZoneState('三分弧顶', 8, 10)).toBe('热');
    expect(hotZoneState('三分弧顶', 1, 10)).toBe('冷');
  });
});
