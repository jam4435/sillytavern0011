import { describe, expect, it } from 'vitest';
import { buildDebutShellRecoveryPatch, isDebutShellRecoveryApplied, isTemplateNpcShell } from './era-debut-shell.js';

const debut = {
  风波恶: {
    性别: '男', 外貌: '武人装束', 性格: '好斗', 境界: '二流-中期',
    初始属性: { 臂力: 11, 根骨: 10, 机敏: 15, 悟性: 7, 洞察: 5 },
    出生年份: 1168, 状态: '健康',
    所在位置: '大理/无量山/山脚废农舍/舍外',
    身份: { 姑苏慕容氏家臣: '玄霜庄庄主' },
    功法: { 劈风刀法: { 掌握程度: '融会贯通' } },
    人物经历: {},
  },
};

function makeShell() {
  return {
    性别: '', 外貌: '', 性格: '', 境界: '',
    初始属性: { 臂力: 0, 根骨: 0, 机敏: 0, 悟性: 0, 洞察: 0 },
    属性: { 气血: '0/0', 内力: '0/0', 臂力: 0 },
    出生年份: 0, 状态: '',
    所在位置: '大理/无量山/山脚废农舍/屋内',
    身份: {}, 功法: {}, 人物经历: { 历史剧情: '不可删除' }, 关系网: {},
  };
}

describe('正式登场时防止 ERA 模板空壳卡住 NPC', () => {
  it('识别提前写入经历生成的默认空壳，只编辑仍为占位值的叶子', () => {
    const shell = makeShell();
    expect(isTemplateNpcShell(shell)).toBe(true);
    const patch = buildDebutShellRecoveryPatch({ 风波恶: shell }, debut);
    expect(patch).toEqual({
      风波恶: {
        性别: '男', 外貌: '武人装束', 性格: '好斗', 境界: '二流-中期',
        初始属性: { 臂力: 11, 根骨: 10, 机敏: 15, 悟性: 7, 洞察: 5 },
        出生年份: 1168, 状态: '健康',
      },
    });
    expect(patch.风波恶).not.toHaveProperty('所在位置');
    expect(patch.风波恶).not.toHaveProperty('人物经历');
    expect(patch.风波恶).not.toHaveProperty('功法');
    expect(isDebutShellRecoveryApplied({ 风波恶: shell }, patch)).toBe(false);
    expect(isDebutShellRecoveryApplied({ 风波恶: { ...shell, ...patch.风波恶 } }, patch)).toBe(true);
  });

  it('既有真实 NPC、非默认资料及不存在的人物不会被强制重置', () => {
    const genuine = { ...makeShell(), 境界: '一流-初期' };
    expect(isTemplateNpcShell(genuine)).toBe(false);
    expect(buildDebutShellRecoveryPatch({ 风波恶: genuine }, debut)).toEqual({});
    expect(buildDebutShellRecoveryPatch({}, debut)).toEqual({});
    expect(buildDebutShellRecoveryPatch({ 风波恶: { 境界: '' } }, debut)).toEqual({});
  });
});
