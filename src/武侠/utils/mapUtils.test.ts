import { beforeEach, describe, expect, it, vi } from 'vitest';

const { emitSourcedEraVariableWriteAndWait } = vi.hoisted(() => ({
  emitSourcedEraVariableWriteAndWait: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../shared/directVariableWrite', () => ({ emitSourcedEraVariableWriteAndWait }));
vi.mock('./logger', () => ({
  gameLogger: {
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

import { addExploredLocation, isLocationUnlocked, parseLocationPath } from './mapUtils';

describe('mapUtils strict location scope', () => {
  beforeEach(() => {
    emitSourcedEraVariableWriteAndWait.mockClear();
    vi.stubGlobal('getAllVariables', vi.fn(() => ({
      stat_data: {
        user数据: {
          已探索地点: ['大宋/临安府/牛家村/曲三酒馆'],
        },
      },
    })));
  });

  it('四级当前位置解析为同一个三级地图活动区', () => {
    expect(parseLocationPath('大宋/临安府/牛家村/村西树林')).toMatchObject({
      area: '大宋',
      region: '临安府',
      location: '牛家村',
      scene: '村西树林',
      scopePath: '大宋/临安府/牛家村',
    });
    expect(parseLocationPath('大宋/临安府')).toBeNull();
    expect(parseLocationPath('大宋/临安府/牛家村/村西/树林')).toBeNull();
  });

  it('已探索判断忽略第四级场景', () => {
    expect(isLocationUnlocked(
      '大宋/临安府/牛家村/村西树林',
      { 解锁条件: '测试事件' } as never,
      ['大宋/临安府/牛家村/曲三酒馆'],
    )).toBe(true);
  });

  it('写入探索记录时只保存三级路径并清理已有第四级', async () => {
    await addExploredLocation('大宋/临安府/临安城/皇宫');

    expect(emitSourcedEraVariableWriteAndWait).toHaveBeenCalledWith(expect.objectContaining({
      detail: {
        stat_data: {
          user数据: {
            已探索地点: [
              '大宋/临安府/牛家村',
              '大宋/临安府/临安城',
            ],
          },
        },
      },
    }));
  });
});
