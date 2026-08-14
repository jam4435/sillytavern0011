import { describe, expect, it, vi } from 'vitest';

import { createDetailSaveCoordinator, DETAIL_SAVE_DELAY } from './detailSaveCoordinator.js';

function patch(value: string, overrides: Record<string, unknown> = {}) {
  return {
    lorebookName: '测试世界书',
    entryUid: 1,
    fieldName: 'content',
    value,
    ...overrides,
  };
}

describe('详情字段保存协调器', () => {
  it('连续输入在 800ms 后只保存最终值', async () => {
    vi.useFakeTimers();
    const saveBatch = vi.fn().mockResolvedValue({ success: true, changed: true });
    const coordinator = createDetailSaveCoordinator({ saveBatch });

    coordinator.schedule(patch('a'));
    await vi.advanceTimersByTimeAsync(400);
    coordinator.schedule(patch('ab'));
    await vi.advanceTimersByTimeAsync(DETAIL_SAVE_DELAY - 1);
    expect(saveBatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(saveBatch).toHaveBeenCalledTimes(1);
    expect(saveBatch.mock.calls[0][1]).toMatchObject([{ value: 'ab' }]);
    vi.useRealTimers();
  });

  it('同一世界书的多字段合并成一次保存', async () => {
    const saveBatch = vi.fn().mockResolvedValue({ success: true, changed: true });
    const coordinator = createDetailSaveCoordinator({ saveBatch });

    coordinator.schedule(patch('正文'));
    coordinator.schedule(patch('关键词', { fieldName: 'strategy.keys' }));
    await coordinator.flush('测试世界书');

    expect(saveBatch).toHaveBeenCalledTimes(1);
    expect(saveBatch.mock.calls[0][1]).toHaveLength(2);
  });

  it('保存进行中的新输入进入下一批且不会并发', async () => {
    let releaseFirst!: (value: unknown) => void;
    const firstSave = new Promise(resolve => {
      releaseFirst = resolve;
    });
    let active = 0;
    let maxActive = 0;
    const saveBatch = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const result = saveBatch.mock.calls.length === 1 ? await firstSave : { success: true, changed: true };
      active -= 1;
      return result;
    });
    const coordinator = createDetailSaveCoordinator({ saveBatch });

    coordinator.schedule(patch('第一批'));
    const firstFlush = coordinator.flush('测试世界书');
    await Promise.resolve();
    coordinator.schedule(patch('第二批'));
    const secondFlush = coordinator.flush('测试世界书');
    expect(saveBatch).toHaveBeenCalledTimes(1);

    releaseFirst({ success: true, changed: true });
    await Promise.all([firstFlush, secondFlush]);
    expect(saveBatch).toHaveBeenCalledTimes(2);
    expect(saveBatch.mock.calls[1][1]).toMatchObject([{ value: '第二批' }]);
    expect(maxActive).toBe(1);
  });

  it('失败后保留补丁并允许下一次冲刷重试', async () => {
    const onBatchError = vi.fn();
    const saveBatch = vi
      .fn()
      .mockResolvedValueOnce({ success: false, changed: false })
      .mockResolvedValueOnce({ success: true, changed: true });
    const coordinator = createDetailSaveCoordinator({ saveBatch, onBatchError });

    coordinator.schedule(patch('待重试'));
    expect(await coordinator.flush('测试世界书')).toMatchObject({ success: false });
    expect(coordinator.hasPending('测试世界书')).toBe(true);

    expect(await coordinator.flush('测试世界书')).toMatchObject({ success: true });
    expect(saveBatch).toHaveBeenCalledTimes(2);
    expect(onBatchError).toHaveBeenCalledTimes(1);
    expect(coordinator.hasPending('测试世界书')).toBe(false);
  });

  it('不同世界书可以并行保存', async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    const saveBatch = vi.fn(
      () =>
        new Promise(resolve => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          releases.push(() => {
            active -= 1;
            resolve({ success: true, changed: true });
          });
        }),
    );
    const coordinator = createDetailSaveCoordinator({ saveBatch });

    coordinator.schedule(patch('A', { lorebookName: 'A' }));
    coordinator.schedule(patch('B', { lorebookName: 'B' }));
    const flushing = coordinator.flushAll();
    await Promise.resolve();
    expect(maxActive).toBe(2);
    releases.forEach(release => release());
    await flushing;
  });
});
