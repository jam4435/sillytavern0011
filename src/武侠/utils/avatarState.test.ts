import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emitSourcedEraVariableWriteAndWait,
  runDirectChatVariableWrite,
} from '../../shared/directVariableWrite';
import { toPresetAvatarRef } from './avatarCatalog';
import {
  createAvatarEntityKey,
  readAvatarSelection,
  saveAvatarSelection,
} from './avatarStorage';
import {
  clearNpcAvatarRef,
  migrateAvatarState,
  parseAvatarVariableState,
  setPlayerAvatarRef,
} from './avatarState';

vi.mock('../../shared/directVariableWrite', () => ({
  emitSourcedEraVariableWriteAndWait: vi.fn(async () => ({
    version: 1,
    writeId: 'avatar-write',
    source: 'frontend',
    operation: 'update',
    reason: 'avatar-test',
    eventName: 'era:updateByObject',
    attribution: 'background',
    actions: { apiWrite: true },
  })),
  runDirectChatVariableWrite: vi.fn(async (_metadata: unknown, writer: () => unknown) => writer()),
}));

const emitWriteMock = vi.mocked(emitSourcedEraVariableWriteAndWait);
const runDirectWriteMock = vi.mocked(runDirectChatVariableWrite);
const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;
const updateVariablesWithMock = globalThis.updateVariablesWith as ReturnType<typeof vi.fn>;

describe('avatarState', () => {
  let chatVariables: Record<string, unknown>;

  beforeEach(() => {
    localStorage.clear();
    emitWriteMock.mockClear();
    runDirectWriteMock.mockClear();
    chatVariables = { stat_data: {} };
    getVariablesMock.mockImplementation(() => chatVariables);
    updateVariablesWithMock.mockImplementation((updater: (value: Record<string, unknown>) => Record<string, unknown>) => {
      chatVariables = updater(chatVariables);
      return chatVariables;
    });
  });

  it('迁移按新结构 > local selection > 旧变量合并，并清理旧字段与 selection', async () => {
    chatVariables = {
      stat_data: {
        前端变量: {
          头像: {
            玩家: 'preset:player_male_01',
            人物: { 黄蓉: 'preset:huang_rong_fc2' },
          },
        },
        user数据: { 用户名: '测试少侠', 头像: 'preset:player_male_03' },
        角色数据: {
          $template: { 性别: '', 头像: '' },
          黄蓉: { 头像: 'preset:huang_rong_fc3' },
          郭靖: { 头像: 'preset:male_palace_1' },
          小龙女: { 头像: 'preset:xiao_longnv_fc2' },
        },
      },
    };
    saveAvatarSelection(createAvatarEntityKey('player'), toPresetAvatarRef('player_male_02'));
    saveAvatarSelection(createAvatarEntityKey('npc', '黄蓉'), toPresetAvatarRef('huang_rong_fc3'));
    saveAvatarSelection(createAvatarEntityKey('npc', '郭靖'), toPresetAvatarRef('guo_jing_fc2'));
    saveAvatarSelection(createAvatarEntityKey('npc', '已移除人物'), toPresetAvatarRef('male_palace_2'));

    const result = await migrateAvatarState();
    const statData = (chatVariables.stat_data ?? {}) as Record<string, unknown>;
    const frontend = statData.前端变量 as Record<string, unknown>;

    expect(parseAvatarVariableState(frontend)).toEqual({
      玩家: 'preset:player_male_01',
      人物: {
        黄蓉: 'preset:huang_rong_fc2',
        郭靖: 'preset:guo_jing_fc2',
        小龙女: 'preset:xiao_longnv_fc2',
      },
    });
    expect(frontend.头像版本).toBe(1);
    expect(statData.user数据).not.toHaveProperty('头像');
    expect((statData.角色数据 as Record<string, Record<string, unknown>>).$template).not.toHaveProperty('头像');
    expect((statData.角色数据 as Record<string, Record<string, unknown>>).黄蓉).not.toHaveProperty('头像');
    expect(readAvatarSelection(createAvatarEntityKey('player'))).toBeNull();
    expect(readAvatarSelection(createAvatarEntityKey('npc', '郭靖'))).toBeNull();
    expect(result).toEqual(expect.objectContaining({
      migrated: true,
      removedLegacyFieldCount: 5,
      clearedLocalSelectionCount: 4,
    }));
    expect(runDirectWriteMock).toHaveBeenCalledOnce();
  });

  it('版本与容器已存在时，仍会用 local selection 填补缺失的实体键', async () => {
    chatVariables = {
      stat_data: {
        前端变量: {
          头像: { 人物: {} },
          头像版本: 1,
        },
        user数据: { 用户名: '测试少侠' },
        角色数据: { 黄蓉: { 性别: '女' } },
      },
    };
    saveAvatarSelection(createAvatarEntityKey('player'), toPresetAvatarRef('player_male_02'));
    saveAvatarSelection(createAvatarEntityKey('npc', '黄蓉'), toPresetAvatarRef('huang_rong_fc3'));

    await migrateAvatarState();

    const statData = chatVariables.stat_data as Record<string, unknown>;
    expect(parseAvatarVariableState(statData.前端变量)).toEqual({
      玩家: 'preset:player_male_02',
      人物: { 黄蓉: 'preset:huang_rong_fc3' },
    });
    expect(runDirectWriteMock).toHaveBeenCalledOnce();
    expect(readAvatarSelection(createAvatarEntityKey('player'))).toBeNull();
  });

  it('active picker 写前端变量，清除 NPC 时删除稀疏键', async () => {
    await setPlayerAvatarRef('preset:player_male_02');
    expect(emitWriteMock).toHaveBeenLastCalledWith(expect.objectContaining({
      eventName: 'era:insertByObject',
      detail: {
        stat_data: {
          前端变量: {
            头像: { 玩家: 'preset:player_male_02' },
            头像版本: 1,
          },
        },
      },
    }));

    chatVariables = {
      stat_data: {
        前端变量: {
          头像: { 人物: { 黄蓉: 'preset:huang_rong_fc3' } },
          头像版本: 1,
        },
      },
    };
    await clearNpcAvatarRef('黄蓉');
    expect(emitWriteMock).toHaveBeenLastCalledWith(expect.objectContaining({
      eventName: 'era:deleteByPath',
      detail: { path: 'stat_data.前端变量.头像.人物.黄蓉' },
    }));
  });
});
