import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPEARANCE_TEMPLATES,
  DEFAULT_ATTRIBUTES,
  STORY_EVENTS,
  generateVariableData,
  getRandomAppearance,
  initializeNewGameSession,
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

const initializeGlobalMock = vi.fn();
const eventEmitMock = vi.fn().mockResolvedValue(undefined);
const setChatMessagesMock = vi.fn().mockResolvedValue(undefined);
const updateVariablesWithMock = globalThis.updateVariablesWith as ReturnType<typeof vi.fn>;
const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;

beforeEach(() => {
  updateVariablesWithMock.mockReset();
  getVariablesMock.mockReset();
  initializeGlobalMock.mockReset();
  eventEmitMock.mockReset().mockResolvedValue(undefined);
  setChatMessagesMock.mockReset().mockResolvedValue(undefined);
  Object.assign(globalThis, {
    initializeGlobal: initializeGlobalMock,
    eventEmit: eventEmitMock,
    setChatMessages: setChatMessagesMock,
  });
});

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

describe('opening event time', () => {
  it('开局事件汇总提供小时并使用所选事件的真实触发小时', () => {
    const selectedEvent = STORY_EVENTS.find(event => event.name === '射雕第7回-02-初遇黄蓉');
    expect(selectedEvent).toMatchObject({
      year: 1219,
      month: 10,
      day: 20,
      hour: 13,
      location: '金国/张家口/张家口镇',
    });

    const data = generateVariableData({
      ...createFormData(),
      locationInfo: {
        year: selectedEvent!.year,
        month: selectedEvent!.month,
        day: selectedEvent!.day,
        hour: selectedEvent!.hour,
        location: selectedEvent!.location,
        eventName: selectedEvent!.name,
      },
    }) as { 世界信息: { 时间: { 时: number; 分: number } } };

    expect(data.世界信息.时间.时).toBe(13);
    expect(data.世界信息.时间.分).toBe(0);
  });

  it('没有小时的旧数据和自定义开局继续回退到11时0分', () => {
    const data = generateVariableData(createFormData()) as { 世界信息: { 时间: { 时: number; 分: number } } };
    expect(data.世界信息.时间.时).toBe(11);
    expect(data.世界信息.时间.分).toBe(0);
  });
});

describe('initializeNewGameSession startup signal', () => {
  it('等待变量写入并回读确认后才发送 GameInitialized', async () => {
    let chatVariables: Record<string, any> = {};
    updateVariablesWithMock.mockImplementation(async updater => {
      chatVariables = await updater(chatVariables);
      return chatVariables;
    });
    getVariablesMock.mockImplementation(() => chatVariables);

    const result = await initializeNewGameSession(createFormData());

    expect(result.success).toBe(true);
    expect(updateVariablesWithMock).toHaveBeenCalledTimes(1);
    expect(getVariablesMock).toHaveBeenCalledWith({ type: 'chat' });
    expect(initializeGlobalMock).toHaveBeenCalledWith(
      'GameInitialized',
      expect.objectContaining({ formData: expect.any(Object) }),
    );
    expect(eventEmitMock).toHaveBeenCalledWith(
      'GameInitialized',
      expect.objectContaining({ formData: expect.any(Object) }),
    );
    expect(getVariablesMock.mock.invocationCallOrder[0]).toBeLessThan(initializeGlobalMock.mock.invocationCallOrder[0]);
    expect(getVariablesMock.mock.invocationCallOrder[0]).toBeLessThan(eventEmitMock.mock.invocationCallOrder[0]);
  });

  it('回读的世界时间或运行时键版本不一致时失败且不发送信号', async () => {
    updateVariablesWithMock.mockResolvedValue({ stat_data: {} });
    getVariablesMock.mockReturnValue({
      stat_data: {
        世界信息: { 时间: { 年: 1, 月: 1, 日: 1, 时: 1 } },
        前端变量: { 事件运行时键版本: 2 },
      },
    });

    const result = await initializeNewGameSession(createFormData());

    expect(result.success).toBe(false);
    expect(result.error).toContain('回读校验失败');
    expect(initializeGlobalMock).not.toHaveBeenCalled();
    expect(eventEmitMock).not.toHaveBeenCalled();
    expect(setChatMessagesMock).not.toHaveBeenCalled();
  });

  it('新游戏回读缺少分时失败且不发送初始化信号', async () => {
    let chatVariables: Record<string, any> = {};
    updateVariablesWithMock.mockImplementation(async updater => {
      chatVariables = JSON.parse(JSON.stringify(await updater(chatVariables)));
      delete chatVariables.stat_data.世界信息.时间.分;
      return chatVariables;
    });
    getVariablesMock.mockImplementation(() => chatVariables);

    const result = await initializeNewGameSession(createFormData());

    expect(result.success).toBe(false);
    expect(result.error).toContain('回读校验失败');
    expect(initializeGlobalMock).not.toHaveBeenCalled();
    expect(eventEmitMock).not.toHaveBeenCalled();
    expect(setChatMessagesMock).not.toHaveBeenCalled();
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
        expect(
          template.templates.length,
          `${label} ${template.range.min}-${template.range.max} 至少需要四条模板`,
        ).toBeGreaterThanOrEqual(4);
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
    ['低风姿、强臂力、弱根骨', '男' as const, appearanceAttributes(0, 20, 0), true],
    ['高风姿、弱臂力、强根骨', '女' as const, appearanceAttributes(20, 0, 20), true],
    ['双低体魄', '男' as const, appearanceAttributes(6, 0, 0), false],
    ['双高体魄', '女' as const, appearanceAttributes(6, 20, 20), false],
    ['默认属性组合', '男' as const, appearanceAttributes(6, 6, 6), false],
  ])('%s会组合三个对应区间的描述', (_name, gender, attributes, shouldContrast) => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const appearance = getRandomAppearance(gender, attributes);
    expectAppearanceParts(appearance, gender, attributes);
    expect(appearance.includes('，却')).toBe(shouldContrast);
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
