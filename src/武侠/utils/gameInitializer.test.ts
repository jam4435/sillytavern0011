import { describe, expect, it, vi } from 'vitest';
import {
  APPEARANCE_TEMPLATES,
  DEFAULT_ATTRIBUTES,
  generateVariableData,
  getRandomAppearance,
  type NewGameFormData,
} from './gameInitializer';

type AppearanceRangeTemplate = (typeof APPEARANCE_TEMPLATES.frame)[number];

const appearanceAttributes = (风姿: number, 臂力: number, 根骨: number) => ({ 风姿, 臂力, 根骨 });

function findAppearanceRange(templates: AppearanceRangeTemplate[], value: number): AppearanceRangeTemplate {
  const matches = templates.filter(template => value >= template.range.min && value <= template.range.max);
  expect(matches, `属性值 ${value} 应恰好命中一个外貌模板区间`).toHaveLength(1);
  return matches[0];
}

function expectAppearanceParts(
  appearance: string,
  gender: '男' | '女',
  attributes: ReturnType<typeof appearanceAttributes>,
  templateIndex = 0,
) {
  const face = findAppearanceRange(APPEARANCE_TEMPLATES.face[gender], attributes.风姿);
  const frame = findAppearanceRange(APPEARANCE_TEMPLATES.frame, attributes.根骨);
  const strength = findAppearanceRange(APPEARANCE_TEMPLATES.strength, attributes.臂力);

  expect(appearance).toContain(face.templates[templateIndex]);
  expect(appearance).toContain(frame.templates[templateIndex]);
  expect(appearance).toContain(strength.templates[templateIndex]);
}

function createFormData(avatarRef?: string): NewGameFormData {
  return {
    name: '测试少侠',
    gender: '男',
    avatarRef,
    appearance: '剑眉星目',
    age: 18,
    locationInfo: {
      year: 1199,
      month: 8,
      day: 15,
      location: '牛家村',
    },
    initialAttributes: DEFAULT_ATTRIBUTES,
    martialArtId: '',
    origin: '自定义',
    originId: 'custom',
    customRealm: '三流圆满',
  };
}

describe('generateVariableData avatar fields', () => {
  it('内置头像只写入前端变量', () => {
    const data = generateVariableData(createFormData('preset:guo_jing_fc2')) as {
      前端变量: { 头像: { 玩家: string; 人物: Record<string, string> }; 头像版本: number; 事件运行时键版本: number };
      user数据: Record<string, unknown>;
      角色数据: { $template: Record<string, unknown> };
    };

    expect(data.前端变量.头像).toEqual({ 玩家: 'preset:guo_jing_fc2', 人物: {} });
    expect(data.前端变量.头像版本).toBe(1);
    expect(data.前端变量.事件运行时键版本).toBe(2);
    expect(data.user数据).not.toHaveProperty('头像');
    expect(data.角色数据.$template).not.toHaveProperty('头像');
  });

  it('自定义头像只写 custom marker，不写 base64', () => {
    const data = generateVariableData(createFormData('custom:player')) as {
      前端变量: { 头像: { 玩家: string } };
      user数据: Record<string, unknown>;
    };

    expect(data.前端变量.头像.玩家).toBe('custom:player');
    expect(data.user数据).not.toHaveProperty('头像');
    expect(JSON.stringify(data)).not.toContain('data:image');
    expect(JSON.stringify(data)).not.toContain('base64');
  });
});

describe('getRandomAppearance', () => {
  it('所有模板池在0到20之间均恰好覆盖一次且没有空模板', () => {
    const templateGroups: Array<[string, AppearanceRangeTemplate[]]> = [
      ['男性风姿', APPEARANCE_TEMPLATES.face.男],
      ['女性风姿', APPEARANCE_TEMPLATES.face.女],
      ['根骨', APPEARANCE_TEMPLATES.frame],
      ['臂力', APPEARANCE_TEMPLATES.strength],
    ];

    for (const [label, templates] of templateGroups) {
      for (const template of templates) {
        expect(template.templates.length, `${label} ${template.range.min}-${template.range.max} 不能是空模板池`).toBeGreaterThan(0);
      }

      for (let value = 0; value <= 20; value += 1) {
        const matches = templates.filter(template => value >= template.range.min && value <= template.range.max);
        expect(matches, `${label}=${value} 应恰好命中一个模板区间`).toHaveLength(1);
      }
    }
  });

  it('风姿、臂力和根骨分别只替换自己的描述部分', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const baselineAttributes = appearanceAttributes(6, 6, 6);
    const baseline = getRandomAppearance('男', baselineAttributes);

    const lowCharismaAttributes = appearanceAttributes(0, 6, 6);
    const lowCharisma = getRandomAppearance('男', lowCharismaAttributes);
    expectAppearanceParts(lowCharisma, '男', lowCharismaAttributes);
    expect(lowCharisma).not.toBe(baseline);
    expect(lowCharisma).toContain(findAppearanceRange(APPEARANCE_TEMPLATES.frame, 6).templates[0]);
    expect(lowCharisma).toContain(findAppearanceRange(APPEARANCE_TEMPLATES.strength, 6).templates[0]);

    const highStrengthAttributes = appearanceAttributes(6, 20, 6);
    const highStrength = getRandomAppearance('男', highStrengthAttributes);
    expectAppearanceParts(highStrength, '男', highStrengthAttributes);
    expect(highStrength).not.toBe(baseline);
    expect(highStrength).toContain(findAppearanceRange(APPEARANCE_TEMPLATES.face.男, 6).templates[0]);
    expect(highStrength).toContain(findAppearanceRange(APPEARANCE_TEMPLATES.frame, 6).templates[0]);

    const highFrameAttributes = appearanceAttributes(6, 6, 20);
    const highFrame = getRandomAppearance('男', highFrameAttributes);
    expectAppearanceParts(highFrame, '男', highFrameAttributes);
    expect(highFrame).not.toBe(baseline);
    expect(highFrame).toContain(findAppearanceRange(APPEARANCE_TEMPLATES.face.男, 6).templates[0]);
    expect(highFrame).toContain(findAppearanceRange(APPEARANCE_TEMPLATES.strength, 6).templates[0]);
  });

  it.each([
    ['低风姿、强臂力、弱根骨', '男' as const, appearanceAttributes(0, 20, 0)],
    ['高风姿、弱臂力、强根骨', '女' as const, appearanceAttributes(20, 0, 20)],
    ['默认属性组合', '男' as const, appearanceAttributes(6, 6, 6)],
  ])('%s会组合三个对应区间的描述', (_name, gender, attributes) => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expectAppearanceParts(getRandomAppearance(gender, attributes), gender, attributes);
  });

  it('随机数位于首尾时会分别选择三个模板池的首项和末项', () => {
    const attributes = appearanceAttributes(6, 6, 6);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    expectAppearanceParts(getRandomAppearance('男', attributes), '男', attributes, 0);

    randomSpy.mockReturnValue(0.999999);
    const face = findAppearanceRange(APPEARANCE_TEMPLATES.face.男, attributes.风姿);
    const frame = findAppearanceRange(APPEARANCE_TEMPLATES.frame, attributes.根骨);
    const strength = findAppearanceRange(APPEARANCE_TEMPLATES.strength, attributes.臂力);
    const lastAppearance = getRandomAppearance('男', attributes);

    expect(lastAppearance).toContain(face.templates.at(-1));
    expect(lastAppearance).toContain(frame.templates.at(-1));
    expect(lastAppearance).toContain(strength.templates.at(-1));
  });
});
