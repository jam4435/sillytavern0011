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
import { getMartialArtData, loadMartialArtsDatabase } from './martialArtsDatabase';
import { __resetVariableReaderTestState, autoUpdateMartialArts, readGameDataSync } from './variableReader';

type JsonRecord = Record<string, unknown>;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const emitSourcedEraVariableWriteAndWaitMock = vi.mocked(emitSourcedEraVariableWriteAndWait);
const getMartialArtDataMock = vi.mocked(getMartialArtData);
const loadMartialArtsDatabaseMock = vi.mocked(loadMartialArtsDatabase);
const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;
const getAllVariablesMock = globalThis.getAllVariables as ReturnType<typeof vi.fn>;

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
    expect(emitSourcedEraVariableWriteAndWaitMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
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
    }));
    expect(emitSourcedEraVariableWriteAndWaitMock.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
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
    }));
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
    expect(emitSourcedEraVariableWriteAndWaitMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
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
    }));
    expect(emitSourcedEraVariableWriteAndWaitMock.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
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
    }));
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
    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenCalledWith(expect.objectContaining({
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
    }));
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
          所在位置: '牛家村',
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

  it('装备和丹药会读取类型专属元信息', () => {
    getAllVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {
          用户名: '黄蓉',
          性别: '女',
          境界: '不入流',
          修为: 0,
          所在位置: '桃花岛',
          包裹: {
            软猬甲: {
              类型: '装备',
              品阶: '绝品',
              物品描述: '刀枪难入，贴身护体。',
              数量: 1,
              部位: '护甲',
              属性修正: {
                根骨: 15,
                洞察: 5,
              },
              使用状态: '装备中',
            },
            九花玉露丸: {
              类型: '丹药',
              品阶: '珍品',
              物品描述: '清香沁脾，可调息养气。',
              数量: 2,
              属性修正: {
                气血: 300,
                内力: 120,
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
              根骨: 15,
              洞察: 5,
            },
            status: '装备中',
          }),
        }),
        expect.objectContaining({
          name: '九花玉露丸',
          type: 'ELIXIR',
          rank: 'BLUE',
          elixirInfo: {
            modifiers: {
              气血: 300,
              内力: 120,
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
          所在位置: '桃花岛',
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
                根骨: 15,
                洞察: 5,
              },
              使用状态: '',
            },
            九花玉露丸: {
              类型: '丹药',
              品阶: '珍品',
              物品描述: '清香沁脾，可调息养气。',
              数量: 2,
              属性修正: {
                气血: 300,
                内力: 120,
                臂力: -2,
              },
              持续时间: 3,
            },
          },
          装备栏: {
            护甲: '软猬甲',
          },
          状态效果: {
            药效一: {
              类型: '丹药',
              来源: '九花玉露丸',
              属性修正: {
                气血: 300,
                内力: 120,
                臂力: -2,
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
        type: '丹药',
        source: '九花玉露丸',
        modifiers: {
          气血: 300,
          内力: 120,
          臂力: -2,
        },
        duration: 3,
        remaining: 2,
      },
    ]);
    expect(result?.stats?.attributes).toEqual({
      hp: 310,
      mp: 130,
      臂力: 8,
      根骨: 25,
      机敏: 10,
      洞察: 15,
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
});
