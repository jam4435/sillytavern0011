import { describe, expect, it } from 'vitest';
import { FREE_PRESETS, GROUP_KEYS, bodyBounds, defaultBody, groupBudget, initialGroups } from '../engine/development';
import type { CreationMode, Position } from '../engine/types';
import { ARCHETYPES, buildCustomPlayer, compatibleArchetypes, validateCreation } from './customPlayer';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

function form(pos: Position, mode: CreationMode = '2K16模式', preset = 'all_round') {
  const body = defaultBody(mode, pos);
  return {
    name: '测试新秀', pos, mode, style: '均衡' as const, archetypeId: preset,
    height_cm: body.heightCm, weight_kg: body.weightKg, wingspan_cm: body.wingspanCm,
    groups: initialGroups(mode, '均衡', preset), number: 8, teamId: 'GSW',
  };
}

describe('v3 custom player', () => {
  it('两种模式和全部合法位置/预设都能创建70–76总评新秀', () => {
    for (const pos of POSITIONS) {
      const classic = buildCustomPlayer(form(pos));
      expect(classic.overall).toBeGreaterThanOrEqual(70);
      expect(classic.overall).toBeLessThanOrEqual(76);
      expect(classic.attrs.potential).toBe(88);
      for (const archetype of compatibleArchetypes(pos)) {
        const free = buildCustomPlayer(form(pos, '自由模拟模式', archetype.id));
        expect(free.overall).toBeGreaterThanOrEqual(70);
        expect(free.overall).toBeLessThanOrEqual(76);
      }
    }
  });

  it('预设恰好使用100点且每组在4–14', () => {
    for (const groups of [initialGroups('2K16模式', '均衡'), initialGroups('2K16模式', '外线'), initialGroups('2K16模式', '内线'), ...Object.values(FREE_PRESETS)]) {
      expect(groupBudget(groups)).toBe(100);
      expect(GROUP_KEYS.every(key => groups[key] >= 4 && groups[key] <= 14)).toBe(true);
    }
  });

  it('身体边界按位置/模式校验，保存三项独立身体数据', () => {
    for (const pos of POSITIONS) {
      const built = buildCustomPlayer(form(pos));
      const bounds = bodyBounds('2K16模式', pos);
      expect(built.body.heightCm).toBe(bounds.height.def);
      expect(built.body.weightKg).toBe(bounds.weight.def);
      expect(built.body.wingspanCm).toBe(bounds.height.def + bounds.wingspanOffset.def);
    }
    const invalid = { ...form('PG'), weight_kg: 140 };
    expect(validateCreation(invalid)).toContain('体重超出当前模式/位置范围');
  });

  it('自由模板仍受位置 fits 限制', () => {
    expect(ARCHETYPES.find(item => item.id === 'sharpshooter')?.fits).not.toContain('C');
    expect(validateCreation({ ...form('C', '自由模拟模式', 'sharpshooter'), archetypeId: 'sharpshooter' })).toContain('模板不适配所选位置');
  });
});
