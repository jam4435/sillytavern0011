import _ from 'lodash';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type RawUpdater = (entries: any[]) => any[] | Promise<any[]>;
type RawUpdate = (lorebookName: string, updater: RawUpdater, options?: { render?: string }) => Promise<any[]>;

let rawUpdate: RawUpdate;
let saveEntryFields: typeof import('./api.js').saveEntryFields;
let updateWorldbookEntries: typeof import('./api.js').updateWorldbookEntries;

beforeAll(async () => {
  vi.stubGlobal('_', _);
  (window as any).updateWorldbookWith = (...args: Parameters<RawUpdate>) => rawUpdate(...args);
  ({ saveEntryFields, updateWorldbookEntries } = await import('./api.js'));
});

beforeEach(() => {
  rawUpdate = vi.fn();
});

describe('世界书轻量字段保存', () => {
  it('合并重复字段，只复制受影响条目并保留其他数据', async () => {
    const originalEntries = [
      { uid: 1, name: '条目一', content: '旧正文', strategy: { keys: ['旧'] }, extension: { keep: true } },
      { uid: 2, name: '条目二', content: '不要修改', extension: { keep: true } },
    ];
    let receivedOptions: { render?: string } | undefined;
    rawUpdate = vi.fn(async (_name, updater, options) => {
      receivedOptions = options;
      return updater(originalEntries);
    });
    const cloneSpy = vi.spyOn(_, 'cloneDeep');

    const result = await saveEntryFields('测试世界书', [
      { entryUid: 1, fieldName: 'content', value: '被覆盖的中间值' },
      { entryUid: 1, fieldName: 'content', value: '最终正文' },
      { entryUid: 1, fieldName: 'strategy.keys', value: ['新'] },
    ]);

    expect(result).toMatchObject({ success: true, changed: true, meta: { changedCount: 1 } });
    expect(result.data[0]).toMatchObject({
      content: '最终正文',
      strategy: { keys: ['新'] },
      extension: { keep: true },
    });
    expect(result.data[1]).toBe(originalEntries[1]);
    expect(originalEntries[0].content).toBe('旧正文');
    expect(cloneSpy).toHaveBeenCalledTimes(1);
    expect(receivedOptions).toEqual({ render: 'debounced' });
  });

  it('相同字段值不会替换条目对象', async () => {
    const entries = [{ uid: 1, content: '相同' }];
    rawUpdate = vi.fn(async (_name, updater) => updater(entries));

    const result = await saveEntryFields('测试世界书', [
      { entryUid: 1, fieldName: 'content', value: '相同' },
    ]);

    expect(result).toMatchObject({ success: true, changed: false });
    expect(result.data).toBe(entries);
  });
});

describe('世界书写入串行器', () => {
  it('同一本世界书串行、不同世界书互不阻塞', async () => {
    const activeByBook = new Map<string, number>();
    const maxActiveByBook = new Map<string, number>();
    const releases: Record<string, Array<() => void>> = {};
    rawUpdate = vi.fn(
      (lorebookName, updater) =>
        new Promise(resolve => {
          const active = (activeByBook.get(lorebookName) || 0) + 1;
          activeByBook.set(lorebookName, active);
          maxActiveByBook.set(lorebookName, Math.max(maxActiveByBook.get(lorebookName) || 0, active));
          releases[lorebookName] ||= [];
          releases[lorebookName].push(() => {
            activeByBook.set(lorebookName, (activeByBook.get(lorebookName) || 1) - 1);
            resolve(updater([{ uid: 1, content: '' }]));
          });
        }),
    );

    const firstA = updateWorldbookEntries('A', entries => entries);
    const secondA = saveEntryFields('A', [{ entryUid: 1, fieldName: 'content', value: 'A2' }]);
    const firstB = saveEntryFields('B', [{ entryUid: 1, fieldName: 'content', value: 'B1' }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(rawUpdate).toHaveBeenCalledTimes(2);
    expect(releases.A).toHaveLength(1);
    expect(releases.B).toHaveLength(1);
    releases.B[0]();
    releases.A[0]();
    await firstA;
    await Promise.resolve();
    expect(releases.A).toHaveLength(2);
    releases.A[1]();
    await Promise.all([secondA, firstB]);

    expect(maxActiveByBook.get('A')).toBe(1);
    expect(maxActiveByBook.get('B')).toBe(1);
  });

  it('失败后仍会继续执行同世界书的下一项', async () => {
    rawUpdate = vi
      .fn()
      .mockRejectedValueOnce(new Error('第一次失败'))
      .mockImplementationOnce(async (_name, updater) => updater([{ uid: 1, content: '旧' }]));

    const failed = await saveEntryFields('测试世界书', [{ entryUid: 1, fieldName: 'content', value: '失败' }]);
    const succeeded = await saveEntryFields('测试世界书', [{ entryUid: 1, fieldName: 'content', value: '成功' }]);

    expect(failed.success).toBe(false);
    expect(succeeded.success).toBe(true);
    expect(succeeded.data[0].content).toBe('成功');
  });
});
