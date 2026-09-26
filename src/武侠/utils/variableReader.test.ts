import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./martialArtsDatabase', () => ({
  completeMartialArts: vi.fn(),
  getMartialArtData: vi.fn(),
  loadMartialArtsDatabase: vi.fn(async () => true),
}));

vi.mock('../../shared/directVariableWrite', () => ({
  emitSourcedEraVariableWriteAndWait: vi.fn(),
}));

vi.mock('./logger', () => ({
  dataLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import { completeMartialArts, getMartialArtData, loadMartialArtsDatabase } from './martialArtsDatabase';
import {
  __resetVariableReaderTestState,
  autoUpdateMartialArts,
  detectGameSessionState,
  getGameVariables,
  normalizeAssistantReplyForPersistence,
  parseFactions,
  parseFactionTasks,
  readGameDataSync,
  sanitizeNumericAttributeDelta,
} from './variableReader';

type JsonRecord = Record<string, unknown>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const emitSourcedEraVariableWriteAndWaitMock = vi.mocked(emitSourcedEraVariableWriteAndWait);
const completeMartialArtsMock = vi.mocked(completeMartialArts);
const getMartialArtDataMock = vi.mocked(getMartialArtData);
const loadMartialArtsDatabaseMock = vi.mocked(loadMartialArtsDatabase);
const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;
const getAllVariablesMock = globalThis.getAllVariables as ReturnType<typeof vi.fn>;

describe('normalizeAssistantReplyForPersistence', () => {
  it('压缩 tucao 后的大段空行并统一换行与行尾空白', () => {
    const rawReply = '\r\n<tucao>\r\n吐槽内容  \r\n</tucao>\r\n \t\r\n\r\n\r\n正文\r\n\r\n\r\n';

    expect(normalizeAssistantReplyForPersistence(rawReply)).toBe('<tucao>\n吐槽内容\n</tucao>\n\n正文');
  });

  it('相邻变量块之间只保留一个换行，不影响正文正常段落', () => {
    const rawReply = [
      '第一段',
      '',
      '第二段',
      '<VariableThink>',
      '无变化',
      '</VariableThink>',
      '',
      '',
      '<VariableEdit>',
      '{"user数据":{"修为":120}}',
      '</VariableEdit>',
      '',
      '<VariableInsert>',
      '{"user数据":{"人物经历":{"初遇":"记录"}}}',
      '</VariableInsert>',
    ].join('\n');

    expect(normalizeAssistantReplyForPersistence(rawReply)).toBe(
      [
        '第一段',
        '',
        '第二段',
        '<VariableThink>',
        '无变化',
        '</VariableThink>',
        '<VariableEdit>',
        '{"user数据":{"修为":120}}',
        '</VariableEdit>',
        '<VariableInsert>',
        '{"user数据":{"人物经历":{"初遇":"记录"}}}',
        '</VariableInsert>',
      ].join('\n'),
    );
  });

  it('保留正常段落、结构块内容和非行尾缩进', () => {
    const reply = [
      '第一段',
      '',
      '第二段',
      '<VariableEdit>',
      '{',
      '  "user数据": { "修为": 120 }',
      '}',
      '</VariableEdit>',
      '<option>',
      '  继续前进',
      '</option>',
    ].join('\n');

    expect(normalizeAssistantReplyForPersistence(reply)).toBe(reply);
    expect(normalizeAssistantReplyForPersistence(normalizeAssistantReplyForPersistence(reply))).toBe(reply);
  });
});

describe('getGameVariables ERA 展示投影', () => {
  it('读取合并变量时递归反转义特殊字符占位符', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        角色数据: {
          郭靖: {
            功法: {
              全真剑法: {
                功法描述: '招式严谨，如__SQUOTE__白虹经天__SQUOTE__。',
              },
            },
          },
        },
      },
    });

    const variables = getGameVariables() as Record<string, any>;
    expect(variables.角色数据.郭靖.功法.全真剑法.功法描述).toBe("招式严谨，如'白虹经天'。");
  });

  it('侠缘 NPC 投影保留角色数据中的全部功法条目', () => {
    completeMartialArtsMock.mockImplementation(arts =>
      Object.fromEntries(
        Object.entries(arts).map(([name, art]) => [
          name,
          {
            type: art.类型 || '',
            description: art.功法描述 || '',
            rank: art.功法品阶 || '',
            mastery: art.掌握程度 || '',
            traits: art.特性 || {},
            unlockedTraits: art.特性 || {},
            canUpgrade: false,
            upgradeCost: 0,
            nextMastery: null,
          },
        ]),
      ),
    );
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '玩家',
          性别: '男',
          境界: '不入流',
          所在位置: '大宋/临安府',
          初始属性: { 臂力: 10, 根骨: 10, 机敏: 10, 悟性: 10, 洞察: 10 },
          关系网: { 郭靖: '旧识' },
        },
        角色数据: {
          郭靖: {
            所在位置: '大宋/临安府',
            功法: {
              全真剑法: {
                类型: '剑法',
                掌握程度: '炉火纯青',
                功法描述: '如__SQUOTE__白虹经天__SQUOTE__。',
                功法品阶: '上乘',
                特性: { 初窥门径: '', 炉火纯青: '格挡成功率提升20%' },
              },
              金雁功: {
                类型: '轻功',
                掌握程度: '炉火纯青',
                功法描述: '全真派上乘轻功。',
                功法品阶: '上乘',
                特性: { 炉火纯青: '移动时不触发敌人的反击' },
              },
            },
          },
        },
      },
    });

    const state = readGameDataSync();
    const npc = state?.social?.find(item => item.name === '郭靖');
    expect(npc?.template.martialArts && Object.keys(npc.template.martialArts)).toEqual(['全真剑法', '金雁功']);
    expect(npc?.template.martialArts?.全真剑法.martialArtsDescription).toBe("如'白虹经天'。");
  });

  it('侠缘“同处一地”只比较前三层地点，第四级场景不同仍归为 local', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '玩家',
          性别: '男',
          境界: '不入流',
          所在位置: '大宋/临安府/牛家村/郭家旧宅',
          初始属性: { 臂力: 10, 根骨: 10, 机敏: 10, 悟性: 10, 洞察: 10 },
          关系网: {},
        },
        角色数据: {
          穆念慈: {
            所在位置: '大宋/临安府/牛家村/村口',
          },
          黄药师: {
            所在位置: '大宋/嘉兴府/烟雨楼',
          },
        },
      },
    });

    const state = readGameDataSync();
    const localNames = state?.social?.filter(item => item.category === 'local').map(item => item.name) || [];
    expect(localNames).toContain('穆念慈');
    expect(localNames).not.toContain('黄药师');
  });

  it('侠缘投影分离人物身份与功法类型，并保留角色外貌', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '玩家',
          性别: '男',
          境界: '不入流',
          所在位置: '大宋/临安府/牛家村',
          初始属性: { 臂力: 10, 根骨: 10, 机敏: 10, 悟性: 10, 洞察: 10 },
          关系网: { 郭靖: '旧识' },
        },
        角色数据: {
          郭靖: {
            外貌: '浓眉大眼，神情敦厚。',
            所在位置: '大宋/临安府/牛家村',
            身份: {
              丐帮帮主: '执掌丐帮',
            },
            功法: {
              降龙十八掌: {
                类型: '掌法',
                掌握程度: '炉火纯青',
                功法描述: '刚猛无俦。',
                功法品阶: '镇派',
                特性: { 炉火纯青: '掌力雄浑' },
              },
            },
          },
        },
      },
    });

    const state = readGameDataSync();
    const npc = state?.social?.find(item => item.name === '郭靖');
    expect(npc).toMatchObject({
      role: '丐帮帮主',
      appearance: '浓眉大眼，神情敦厚。',
      template: {
        type: '掌法',
      },
    });
    expect(npc?.template.martialArts?.降龙十八掌.type).toBe('掌法');
  });

  it('兼容旧聊天关系网中的数字关系值，不让状态、功法、行囊和侠缘整体读取失败', () => {
    completeMartialArtsMock.mockImplementation(arts =>
      Object.fromEntries(
        Object.entries(arts).map(([name, art]) => [
          name,
          {
            type: art.类型 || '',
            description: art.功法描述 || '',
            rank: art.功法品阶 || '',
            mastery: art.掌握程度 || '',
            traits: art.特性 || {},
            unlockedTraits: art.特性 || {},
            canUpgrade: false,
            upgradeCost: 0,
            nextMastery: null,
          },
        ]),
      ),
    );
    getMartialArtDataMock.mockReturnValue(null);
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        世界信息: { 时间: { 年: 1219, 月: 3, 日: 12, 时: 10 } },
        user数据: {
          用户名: '墨逸',
          性别: '男',
          出生年份: 1181,
          境界: '二流中期',
          修为: 3987,
          所在位置: '大宋/嘉兴府/嘉兴城/北行马车车厢',
          初始属性: { 臂力: 17, 根骨: 17, 机敏: 6, 悟性: 6, 洞察: 6, 风姿: 6, 福缘: 0 },
          功法: {
            九阳神功: {
              类型: '内功',
              功法描述: '九阳真气浑厚无比。',
              功法品阶: '绝世',
              掌握程度: '初窥门径',
              特性: { 初窥门径: '' },
            },
          },
          包裹: {
            碎银子: {
              类型: '杂物',
              品阶: '凡品',
              物品描述: '可用于市井花费。',
              数量: 1,
            },
          },
          关系网: {
            韩小莹: 68,
          },
        },
        角色数据: {
          韩小莹: {
            性别: '女',
            所在位置: '大宋/嘉兴府/嘉兴城/北行马车车厢',
          },
        },
      },
    });

    const state = readGameDataSync();

    expect(state?.stats).toMatchObject({
      name: '墨逸',
      birthYear: 1181,
      realm: '二流中期',
      cultivation: 3987,
    });
    expect(Object.keys(state?.stats?.martialArts || {})).toContain('九阳神功');
    expect(state?.inventory?.map(item => item.name)).toContain('碎银子');

    const npc = state?.social?.find(item => item.name === '韩小莹');
    expect(npc).toMatchObject({
      name: '韩小莹',
      relationship: 68,
      category: 'acquaintance',
    });
    expect(npc?.relationshipLabel).toBeUndefined();
  });

  it('侠缘投影遇到畸形旧角色数据时只降级侠缘，保留其他已解析页面数据', () => {
    getMartialArtDataMock.mockReturnValue(null);
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '墨逸',
          性别: '男',
          境界: '二流中期',
          修为: 3987,
          初始属性: { 臂力: 17, 根骨: 17, 机敏: 6, 悟性: 6, 洞察: 6, 风姿: 6, 福缘: 0 },
          包裹: {
            碎银子: {
              类型: '杂物',
              品阶: '凡品',
              物品描述: '可用于市井花费。',
              数量: 1,
            },
          },
          关系网: {
            韩小莹: 68,
          },
        },
        角色数据: {
          韩小莹: {
            外貌: 123,
          },
        },
      },
    });

    const state = readGameDataSync();

    expect(state?.stats?.realm).toBe('二流中期');
    expect(state?.stats?.cultivation).toBe(3987);
    expect(state?.inventory?.map(item => item.name)).toContain('碎银子');
    expect(state?.social).toEqual([]);
  });

  it('优先把前端事件线索档案投影为长期线索，并与三回合 AI 线索去重', () => {
    const eventName = '射雕第二十九回04-锦囊求医';
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        世界信息: { 时间: { 年: 1220, 月: 12, 日: 20, 时: 10 } },
        user数据: {
          用户名: '玩家',
          性别: '男',
          境界: '不入流',
          所在位置: '大宋/川边/黑沼',
          初始属性: { 臂力: 10, 根骨: 10, 机敏: 10, 悟性: 10, 洞察: 10 },
        },
        事件系统: {
          未发生事件: { [eventName]: {} },
          进行中事件: {},
          已完成事件: {},
          已失效事件: {},
        },
        前端变量: {
          事件线索档案: {
            [eventName]: {
              来源事件: '射雕第二十九回03-瑛姑试探',
              线索: '瑛姑似乎愿意为黄蓉指一条生路。',
              开始时间: { 年: 1220, 月: 12, 日: 22, 时: 10 },
              结束时间: { 年: 1220, 月: 12, 日: 22, 时: 12 },
              地点: '大宋/川边/黑沼',
            },
          },
        },
        后续事件线索: {
          [eventName]: '开始：1220年12月22日10时｜地点：大宋/川边/黑沼｜可能会发生的事件脉络：旧短期线索',
        },
        后续事件线索计数: { [eventName]: 1 },
      },
    });

    const state = readGameDataSync();
    const matchingEvents = state?.events?.filter(event => event.title.includes('锦囊求医')) || [];
    expect(matchingEvents).toHaveLength(1);
    expect(matchingEvents[0]).toMatchObject({
      type: 'AFTERMATH',
      description: '瑛姑似乎愿意为黄蓉指一条生路。',
      location: '大宋/川边/黑沼',
      timeText: '1220年12月22日10时',
      startsInDays: 2,
    });
    expect(matchingEvents[0].remainingTurns).toBeUndefined();
  });

  it('目标事件已经进入进行中时立即隐藏长期线索', () => {
    const eventName = '射雕第二十九回04-锦囊求医';
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        世界信息: { 时间: { 年: 1220, 月: 12, 日: 22, 时: 10 } },
        user数据: {
          用户名: '玩家',
          性别: '男',
          境界: '不入流',
          所在位置: '大宋/川边/黑沼',
          初始属性: { 臂力: 10, 根骨: 10, 机敏: 10, 悟性: 10, 洞察: 10 },
        },
        事件系统: {
          进行中事件: { [eventName]: { 年: 1220, 月: 12, 日: 22, 时: 12 } },
          已完成事件: {},
          已失效事件: {},
        },
        前端变量: {
          事件线索档案: {
            [eventName]: {
              线索: '这条线索不应再出现在未来线索栏。',
              开始时间: { 年: 1220, 月: 12, 日: 22, 时: 10 },
              地点: '大宋/川边/黑沼',
            },
          },
        },
      },
    });

    const state = readGameDataSync();
    expect(state?.events?.some(event => event.type === 'AFTERMATH' && event.title.includes('锦囊求医'))).toBe(false);
  });

  it('玩家参与中的奇遇会完整投影描述、结局、时间和地点，而不是只剩事件名', () => {
    const eventName = '奇遇事件-射雕-王府药房饮蛇血';
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        世界信息: { 时间: { 年: 1219, 月: 3, 日: 10, 时: 17 } },
        user数据: {
          用户名: '玩家',
          性别: '男',
          境界: '不入流',
          所在位置: '金国/中都/赵王府',
          初始属性: { 臂力: 10, 根骨: 10, 机敏: 10, 悟性: 10, 洞察: 10 },
        },
        事件系统: {
          未发生事件: {},
          进行中事件: {
            [eventName]: { 年: 1219, 月: 3, 日: 10, 时: 19 },
          },
          已完成事件: {},
          已失效事件: {},
        },
        参与事件: {
          [eventName]: {
            描述: '1219年3月10日17时 到 1219年3月10日19时，药房深处腥气扑鼻，巨蛇盘踞药架之间。',
            结局: '蛇血机缘尚未定局。',
            地点: '金国/中都/赵王府/药房',
            insert: {},
            update: {},
            delete: {},
          },
        },
      },
    });

    const state = readGameDataSync();
    const event = state?.events?.find(item => item.category === 'participation');

    expect(event).toMatchObject({
      type: 'ACTIVE',
      category: 'participation',
      description: '1219年3月10日17时 到 1219年3月10日19时，药房深处腥气扑鼻，巨蛇盘踞药架之间。',
      details: '蛇血机缘尚未定局。',
      timeText: '1219年3月10日19时',
      location: '金国/中都/赵王府/药房',
    });
  });

  it('将全域可发现事件投影为带开始倒计时和地点的唯一风闻', () => {
    const eventName = '射雕第一回03-远方风波';
    const rumor = '临安府近来暗流涌动。 [1200年8月20日11时/大宋/临安府/牛家村]';
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        世界信息: { 时间: { 年: 1200, 月: 8, 日: 15, 时: 11 } },
        user数据: {
          用户名: '玩家',
          性别: '男',
          境界: '不入流',
          所在位置: '大理/大理城/城南',
          初始属性: { 臂力: 10, 根骨: 10, 机敏: 10, 悟性: 10, 洞察: 10 },
        },
        前端变量: { 可发现事件: { [eventName]: rumor } },
        附近传闻: { [eventName]: rumor },
      },
    });

    const state = readGameDataSync();
    const matchingEvents = state?.events?.filter(event => event.description === '临安府近来暗流涌动。') || [];
    expect(matchingEvents).toHaveLength(1);
    expect(matchingEvents[0]).toMatchObject({
      type: 'RUMOR',
      location: '大宋/临安府/牛家村',
      timeText: '1200年8月20日11时',
      startsInDays: 5,
    });
  });
});

const 金雁功数据库 = {
  类型: '轻功',
  功法描述: '一门偏向轻身提纵的轻功。',
  功法品阶: '上乘',
  特性: {
    初窥门径: '身法轻灵，步伐更稳。',
    略有小成: '凌空借力，纵跃更远。',
    融会贯通: '身随意动，可借势转折。',
  },
};

const isPlainObject = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function setNestedValue(target: JsonRecord, path: string[], value: unknown): void {
  let cursor = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const nextValue = cursor[segment];
    if (!isPlainObject(nextValue)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as JsonRecord;
  }
  cursor[path[path.length - 1]] = clone(value);
}

function applyInsertByObject(target: JsonRecord, patch: JsonRecord): void {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in target)) {
      target[key] = clone(value);
      continue;
    }

    const currentValue = target[key];
    if (isPlainObject(currentValue) && isPlainObject(value)) {
      applyInsertByObject(currentValue, value);
    }
  }
}

function applyUpdateByObject(target: JsonRecord, patch: JsonRecord): void {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in target)) {
      continue;
    }

    const currentValue = target[key];
    if (isPlainObject(currentValue) && isPlainObject(value)) {
      applyUpdateByObject(currentValue, value);
      continue;
    }

    target[key] = clone(value);
  }
}

describe('autoUpdateMartialArts', () => {
  let currentChatStatData: JsonRecord;

  beforeEach(() => {
    __resetVariableReaderTestState();
    currentChatStatData = {};

    loadMartialArtsDatabaseMock.mockResolvedValue(true);
    getMartialArtDataMock.mockImplementation((name: string) => {
      if (name === '金雁功') {
        return clone(金雁功数据库);
      }
      return null;
    });
    getVariablesMock.mockImplementation(() => ({
      stat_data: clone(currentChatStatData),
    }));
    emitSourcedEraVariableWriteAndWaitMock.mockImplementation(async request => {
      const detail = clone((request.detail ?? {}) as JsonRecord);
      if (request.eventName === 'era:insertByObject') {
        applyInsertByObject(currentChatStatData, detail);
      } else if (request.eventName === 'era:updateByObject') {
        applyUpdateByObject(currentChatStatData, detail);
      }

      return {
        version: 1,
        writeId: 'test-write',
        source: 'frontend',
        operation: request.operation,
        reason: request.reason,
        eventName: request.eventName,
        attribution: request.attribution ?? 'background',
        message_id: 2,
        actions: { apiWrite: true },
      };
    });
  });

  it('模板空字符串字段与占位特性会拆成 mixed insert/update，并在回读后通过验证', async () => {
    currentChatStatData = {
      user数据: {
        功法: {
          金雁功: {
            类型: '',
            功法描述: '',
            功法品阶: '',
            掌握程度: '略有小成',
            特性: {
              初窥门径: '',
            },
          },
        },
      },
    };

    const 玩家功法 = clone((currentChatStatData.user数据 as JsonRecord).功法) as Record<string, JsonRecord>;

    await autoUpdateMartialArts(玩家功法 as never, undefined, { 用户名: '郭靖' });

    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenCalledTimes(2);
    expect(emitSourcedEraVariableWriteAndWaitMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        eventName: 'era:insertByObject',
        detail: {
          user数据: {
            功法: {
              金雁功: {
                特性: {
                  略有小成: '凌空借力，纵跃更远。',
                },
              },
            },
          },
        },
      }),
    );
    expect(emitSourcedEraVariableWriteAndWaitMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        eventName: 'era:updateByObject',
        detail: {
          user数据: {
            功法: {
              金雁功: {
                类型: '轻功',
                功法描述: '一门偏向轻身提纵的轻功。',
                功法品阶: '上乘',
                特性: {
                  初窥门径: '身法轻灵，步伐更稳。',
                },
              },
            },
          },
        },
      }),
    );
    expect(currentChatStatData).toEqual({
      user数据: {
        功法: {
          金雁功: {
            类型: '轻功',
            功法描述: '一门偏向轻身提纵的轻功。',
            功法品阶: '上乘',
            掌握程度: '略有小成',
            特性: {
              初窥门径: '身法轻灵，步伐更稳。',
              略有小成: '凌空借力，纵跃更远。',
            },
          },
        },
      },
    });
  });

  it('特性中部分叶子缺失、部分叶子错误时，会把缺失走 insert、错误走 update', async () => {
    currentChatStatData = {
      user数据: {
        功法: {
          金雁功: {
            类型: '轻功',
            功法描述: '一门偏向轻身提纵的轻功。',
            功法品阶: '上乘',
            掌握程度: '融会贯通',
            特性: {
              初窥门径: '错误特性',
              略有小成: '凌空借力，纵跃更远。',
            },
          },
        },
      },
    };

    const 玩家功法 = clone((currentChatStatData.user数据 as JsonRecord).功法) as Record<string, JsonRecord>;

    await autoUpdateMartialArts(玩家功法 as never, undefined, { 用户名: '郭靖' });

    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenCalledTimes(2);
    expect(emitSourcedEraVariableWriteAndWaitMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        eventName: 'era:insertByObject',
        detail: {
          user数据: {
            功法: {
              金雁功: {
                特性: {
                  融会贯通: '身随意动，可借势转折。',
                },
              },
            },
          },
        },
      }),
    );
    expect(emitSourcedEraVariableWriteAndWaitMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        eventName: 'era:updateByObject',
        detail: {
          user数据: {
            功法: {
              金雁功: {
                特性: {
                  初窥门径: '身法轻灵，步伐更稳。',
                },
              },
            },
          },
        },
      }),
    );
  });

  it('回读验证失败时不会更新缓存，同一功法下次仍会继续尝试', async () => {
    vi.useFakeTimers();
    currentChatStatData = {
      user数据: {
        功法: {
          金雁功: {
            类型: '',
            功法描述: '',
            功法品阶: '',
            掌握程度: '略有小成',
            特性: {
              初窥门径: '',
            },
          },
        },
      },
    };

    emitSourcedEraVariableWriteAndWaitMock.mockImplementation(async request => ({
      version: 1,
      writeId: 'failed-write',
      source: 'frontend',
      operation: request.operation,
      reason: request.reason,
      eventName: request.eventName,
      attribution: request.attribution ?? 'background',
      message_id: 2,
      actions: { apiWrite: true },
    }));

    const 玩家功法 = clone((currentChatStatData.user数据 as JsonRecord).功法) as Record<string, JsonRecord>;

    await autoUpdateMartialArts(玩家功法 as never, undefined, { 用户名: '郭靖' });
    await vi.advanceTimersByTimeAsync(120);
    await autoUpdateMartialArts(玩家功法 as never, undefined, { 用户名: '郭靖' });

    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenCalledTimes(4);
  });

  it('老存档里路径完全不存在时，只会发送 insert', async () => {
    currentChatStatData = {
      user数据: {
        功法: {
          金雁功: {
            掌握程度: '初窥门径',
          },
        },
      },
    };

    const 玩家功法 = clone((currentChatStatData.user数据 as JsonRecord).功法) as Record<string, JsonRecord>;

    await autoUpdateMartialArts(玩家功法 as never, undefined, { 用户名: '郭靖' });

    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenCalledTimes(1);
    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'era:insertByObject',
        detail: {
          user数据: {
            功法: {
              金雁功: {
                类型: '轻功',
                功法描述: '一门偏向轻身提纵的轻功。',
                功法品阶: '上乘',
                特性: {
                  初窥门径: '身法轻灵，步伐更稳。',
                },
              },
            },
          },
        },
      }),
    );
  });
});

describe('readGameDataSync inventory rank field', () => {
  beforeEach(() => {
    getAllVariablesMock.mockReturnValue({ stat_data: {} });
    getMartialArtDataMock.mockReturnValue(null);
  });

  it('秘籍优先读取功法数据库中的描述、品阶与参悟条件', () => {
    getMartialArtDataMock.mockReturnValue({
      功法名称: '九阴残篇',
      类型: '内功',
      功法品阶: '上乘',
      功法描述: '源自九阴真经的残篇，字句残缺却仍藏精义。',
      修炼限制: {
        悟性: 12,
        根骨: 10,
      },
    });
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '郭靖',
          性别: '男',
          境界: '不入流',
          修为: 0,
          所在位置: '大宋/临安府/牛家村',
          包裹: {
            九阴残篇: {
              类型: '秘籍',
              品阶: '凡品',
              物品描述: '变量里的旧描述，不应优先显示。',
              数量: 1,
            },
          },
        },
      },
    });

    const result = readGameDataSync();

    expect(result?.inventory).toEqual([
      expect.objectContaining({
        name: '九阴残篇',
        type: 'SECRET',
        rank: 'BLUE',
        count: 1,
        description: '源自九阴真经的残篇，字句残缺却仍藏精义。',
        martialArtInfo: {
          description: '源自九阴真经的残篇，字句残缺却仍藏精义。',
          rank: '上乘',
          requirements: {
            悟性: 12,
            根骨: 10,
          },
        },
      }),
    ]);
  });

  it('装备和药品会读取类型专属元信息', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '黄蓉',
          性别: '女',
          境界: '不入流',
          修为: 0,
          所在位置: '海外/桃花岛/桃花岛腹地',
          包裹: {
            软猬甲: {
              类型: '装备',
              品阶: '绝品',
              物品描述: '刀枪难入，贴身护体。',
              数量: 1,
              部位: '护甲',
              属性修正: {
                根骨: 50,
                洞察: 20,
              },
              使用状态: '装备中',
            },
            九花玉露丸: {
              类型: '药品',
              品阶: '珍品',
              功效类型: '临时增幅',
              物品描述: '清香沁脾，可调息养气。',
              数量: 2,
              属性修正: {
                气血: 30,
                内力: 20,
              },
              持续时间: 3,
            },
          },
        },
      },
    });

    const result = readGameDataSync();

    expect(result?.inventory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '软猬甲',
          type: 'EQUIP',
          rank: 'GOLD',
          equipInfo: expect.objectContaining({
            slot: '护甲',
            modifiers: {
              根骨: 50,
              洞察: 20,
            },
            status: '装备中',
          }),
        }),
        expect.objectContaining({
          name: '九花玉露丸',
          type: 'ELIXIR',
          rank: 'BLUE',
          elixirInfo: {
            effectType: '临时增幅',
            rank: '珍品',
            modifiers: {
              气血: 30,
              内力: 20,
            },
            duration: '3',
          },
        }),
      ]),
    );
  });

  it('装备栏和状态效果会作为生效真值参与玩家属性计算', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '黄蓉',
          性别: '女',
          境界: '不入流',
          修为: 0,
          所在位置: '海外/桃花岛/桃花岛腹地',
          初始属性: {
            臂力: 10,
            根骨: 10,
            机敏: 10,
            悟性: 10,
            洞察: 10,
            风姿: 10,
            福缘: 0,
          },
          包裹: {
            软猬甲: {
              类型: '装备',
              品阶: '绝品',
              物品描述: '刀枪难入，贴身护体。',
              数量: 1,
              部位: '护甲',
              属性修正: {
                根骨: 50,
                洞察: 20,
              },
              使用状态: '',
            },
            九花玉露丸: {
              类型: '药品',
              品阶: '珍品',
              功效类型: '临时增幅',
              物品描述: '清香沁脾，可调息养气。',
              数量: 2,
              属性修正: {
                气血: 30,
                内力: 20,
                臂力: -20,
              },
              持续时间: 3,
            },
          },
          装备栏: {
            护甲: '软猬甲',
          },
          状态效果: {
            药效一: {
              类型: '药品',
              功效类型: '临时增幅',
              来源: '九花玉露丸',
              品阶: '珍品',
              属性修正: {
                气血: 30,
                内力: 20,
                臂力: -20,
              },
              持续时间: 3,
              剩余时间: 2,
            },
          },
        },
      },
    });

    const result = readGameDataSync();

    expect(result?.equipment).toEqual({ 护甲: '软猬甲' });
    expect(result?.statusEffects).toEqual([
      {
        id: '药效一',
        type: '药品',
        effectType: '临时增幅',
        source: '九花玉露丸',
        rank: '珍品',
        modifiers: {
          气血: 30,
          内力: 20,
          臂力: -20,
        },
        duration: 3,
        remaining: 2,
      },
    ]);
    expect(result?.stats?.attributes).toEqual({
      hp: 13,
      mp: 12,
      hpCurrent: 13,
      mpCurrent: 12,
      臂力: 8,
      根骨: 15,
      机敏: 10,
      洞察: 12,
    });
    expect(result?.stats?.baseAttributes).toEqual({
      hp: 10,
      mp: 10,
      hpCurrent: 10,
      mpCurrent: 10,
      臂力: 10,
      根骨: 10,
      机敏: 10,
      洞察: 10,
    });
    expect(result?.inventory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '软猬甲',
          equipInfo: expect.objectContaining({
            status: '装备中',
            isEquipped: true,
          }),
        }),
      ]),
    );
  });

  it('奇经八脉修正进入基础与最终属性投影，旧档缺失时不需要迁移写入', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '黄蓉',
          性别: '女',
          境界: '不入流',
          修为: 100,
          所在位置: '大宋/临安府',
          初始属性: { 臂力: 10, 根骨: 20, 机敏: 10, 悟性: 10, 洞察: 10, 风姿: 10, 福缘: 0 },
        },
        前端变量: {
          奇经八脉: {
            版本: 1,
            已通穴位: ['ren:opening', 'ren:circulation'],
            关窍结算: {},
          },
        },
      },
    });

    const result = readGameDataSync();

    expect(result?.stats?.meridians).toMatchObject({
      corrupted: false,
      modifiers: { 内力上限: 6 },
    });
    expect(result?.stats?.baseAttributes?.mp).toBe(21);
    expect(result?.stats?.attributes.mp).toBe(21);

    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '黄蓉',
          境界: '不入流',
          修为: 100,
          初始属性: { 臂力: 10, 根骨: 20, 机敏: 10, 悟性: 10, 洞察: 10, 风姿: 10, 福缘: 0 },
        },
      },
    });
    expect(readGameDataSync()?.stats?.meridians).toMatchObject({ corrupted: false, modifiers: { 内力上限: 0 } });
    expect(emitSourcedEraVariableWriteAndWaitMock).not.toHaveBeenCalled();
  });
});

describe('readGameDataSync world time projection', () => {
  beforeEach(() => {
    getMartialArtDataMock.mockReturnValue(null);
  });

  it('读取分钟并把精确时间显示给玩家', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        世界信息: { 时间: { 年: 1219, 月: 10, 日: 20, 时: 13, 分: 37 } },
        user数据: { 用户名: '墨逸', 性别: '男', 境界: '不入流' },
      },
    });

    const result = readGameDataSync();

    expect(result?.worldTime).toEqual({ year: 1219, month: 10, day: 20, hour: 13, minute: 37 });
    expect(result?.gameTime).toContain('13时37分');
  });

  it('旧存档缺分时按0读取，并保留午夜0时', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        世界信息: { 时间: { 年: 1219, 月: 10, 日: 20, 时: 0 } },
        user数据: { 用户名: '墨逸', 性别: '男', 境界: '不入流' },
      },
    });

    const result = readGameDataSync();

    expect(result?.worldTime).toEqual({ year: 1219, month: 10, day: 20, hour: 0, minute: 0 });
    expect(result?.gameTime).toContain('0时00分');
  });
});

describe('readGameDataSync avatar projection', () => {
  beforeEach(() => {
    getMartialArtDataMock.mockReturnValue(null);
  });

  it('只从前端变量投影玩家与人物头像', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        前端变量: {
          头像: {
            玩家: 'preset:male_palace_1',
            人物: { 黄蓉: 'preset:huang_rong_fc3' },
          },
        },
        user数据: {
          用户名: '乔峰',
          性别: '男',
          头像: 'preset:player_male_02',
          境界: '不入流',
          修为: 0,
          所在位置: '大宋/临安府/牛家村',
          关系网: {
            黄蓉: '旧识',
          },
        },
        角色数据: {
          黄蓉: {
            性别: '女',
            头像: 'preset:huang_rong_fc2',
            所在位置: '海外/桃花岛/桃花岛腹地',
            功法: {},
            关系网: {},
          },
        },
      },
    });

    const result = readGameDataSync();

    expect(result?.stats.avatarRef).toBe('preset:male_palace_1');
    expect(result?.social.find(npc => npc.name === '黄蓉')?.avatarRef).toBe('preset:huang_rong_fc3');
  });

  it('未迁移的旧头像字段不再成为 active game 真值', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '乔峰',
          性别: '男',
          头像: 'preset:player_male_01',
          境界: '不入流',
          修为: 0,
          所在位置: '大宋/临安府/牛家村',
          关系网: {
            黄蓉: '旧识',
          },
        },
        角色数据: {
          黄蓉: {
            性别: '女',
            头像: 'preset:huang_rong_fc3',
            所在位置: '海外/桃花岛/桃花岛腹地',
            功法: {},
            关系网: {},
          },
        },
      },
    });

    const result = readGameDataSync();

    expect(result?.stats.avatarRef).toBeUndefined();
    expect(result?.social.find(npc => npc.name === '黄蓉')?.avatarRef).toBeUndefined();
  });
});

describe('detectGameSessionState', () => {
  const getChatMessagesMock = globalThis.getChatMessages as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getChatMessagesMock.mockReturnValue([]);
  });

  it('当没有有效 user数据 时返回 empty', () => {
    getAllVariablesMock.mockReturnValue({});

    expect(detectGameSessionState()).toBe('empty');
  });

  it('当有已初始化的 user数据 但无正文剧情消息（第0楼之后）时返回 opening', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '墨逸',
          性别: '男',
          境界: '三流圆满',
        },
      },
    });
    // 仅有第 0 楼隐藏消息
    getChatMessagesMock.mockReturnValue([
      { message_id: 0, is_hidden: true, mes: '<VariableInsert>...</VariableInsert>' },
    ]);

    expect(detectGameSessionState()).toBe('opening');
  });

  it('当有已初始化的 user数据 且有有效 assistant 剧情消息时返回 active', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '墨逸',
          性别: '男',
          境界: '三流圆满',
        },
      },
    });
    getChatMessagesMock.mockReturnValue([
      { message_id: 0, is_hidden: true, mes: '' },
      { message_id: 1, role: 'user', mes: '开局' },
      { message_id: 2, role: 'assistant', mes: '牛家村雪夜，寒风呼啸……' },
    ]);

    expect(detectGameSessionState()).toBe('active');
  });

  describe('势力与任务读取及兼容性', () => {
    it('应当优先正确解析多势力映射', () => {
      const factions = parseFactions({
        势力: {
          全真教: {
            体系类型: '宗门',
            身份: '亲传弟子',
            师承: '丘处机',
            贡献: 180,
            状态: '在籍',
          },
          桃花岛: {
            体系类型: '世家',
            身份: '记名门客',
            师承: '黄药师',
            贡献: 50,
            状态: '记名',
          },
        },
      });

      expect(factions).toBeDefined();
      expect(factions?.['全真教']?.身份).toBe('亲传弟子');
      expect(factions?.['全真教']?.贡献).toBe(180);
      expect(factions?.['桃花岛']?.体系类型).toBe('世家');
    });

    it('不再接受旧的主势力/所属势力包装结构', () => {
      const factions = parseFactions({
        势力: {
          当前主势力: '全真教',
          所属势力: {
            全真教: {
              体系类型: '宗门',
              身份: '亲传弟子',
              师承: '丘处机',
              贡献: 300,
              状态: '在籍',
            },
          },
        },
      });

      expect(factions).toBeUndefined();
    });

    it('应当正确解析顶层 stat_data.任务', () => {
      const tasks = parseFactionTasks({
        stat_data: {
          任务: {
            除狼患: {
              所属势力: '全真教',
              任务详情: '剿除山野恶狼',
              任务地点: '大宋/终南山/豺狼谷',
              任务执行情况: '未到达地点',
              任务奖励: {
                贡献增量: 30,
                修为增量: 50,
              },
            },
          },
        },
      });

      expect(tasks).toBeDefined();
      expect(tasks?.['除狼患']?.所属势力).toBe('全真教');
      expect(tasks?.['除狼患']?.任务奖励?.贡献增量).toBe(30);
    });

    it('应当防御性折算历史 +数字 增量字符串', () => {
      const baseCultivation = 1000;
      expect(sanitizeNumericAttributeDelta(baseCultivation, '+3500')).toBe(4500);
      expect(sanitizeNumericAttributeDelta(baseCultivation, '-200')).toBe(800);
      expect(sanitizeNumericAttributeDelta(baseCultivation, 500)).toBe(500); // 纯数字直接返回
    });
  });
});
