import _ from 'lodash';
import { beforeAll, describe, expect, it, vi } from 'vitest';

let getSortedEntries: typeof import('./sorting.js').getSortedEntries;
let planEntryMove: typeof import('./sorting.js').planEntryMove;

function entry(uid: number, type = 'after_character_definition', order = uid * 10, extra: Record<string, unknown> = {}) {
  return {
    uid,
    name: `条目 ${uid}`,
    enabled: true,
    position: { type, order, ...(type === 'at_depth' ? { depth: 4, role: 'system' } : {}) },
    ...extra,
  } as any;
}

beforeAll(async () => {
  vi.stubGlobal('_', _);
  ({ getSortedEntries, planEntryMove } = await import('./sorting.js'));
});

describe('手机端条目上下移动规划', () => {
  it('优先级升序在同一位置内使用顺序空档', () => {
    const entries = [entry(1, 'after_character_definition', 10), entry(2, 'after_character_definition', 20), entry(3, 'after_character_definition', 30)];
    const result = planEntryMove({
      entries,
      visibleUids: [1, 2, 3],
      entryUid: 3,
      direction: 'up',
      sortPreference: { by: 'priority', dir: 'asc' },
    });
    expect(result.movable).toBe(true);
    expect(result.patches.get(3)).toMatchObject({ position: { order: 15 }, order: 15 });
    const moved = entries.map(item => ({ ...item, ...(result.patches.get(item.uid) || {}), position: result.patches.get(item.uid)?.position || item.position }));
    expect(getSortedEntries(moved, 'priority', 'asc').map(item => item.uid)).toEqual([1, 3, 2]);
  });

  it('逆优先级按反向显示顺序插入', () => {
    const entries = [entry(1, 'after_character_definition', 10), entry(2, 'after_character_definition', 20), entry(3, 'after_character_definition', 30)];
    const result = planEntryMove({ entries, visibleUids: [3, 2, 1], entryUid: 1, direction: 'up', sortPreference: { by: 'priority', dir: 'desc' } });
    expect(result.movable).toBe(true);
    const moved = entries.map(item => ({ ...item, ...(result.patches.get(item.uid) || {}), position: result.patches.get(item.uid)?.position || item.position }));
    expect(getSortedEntries(moved, 'priority', 'desc').map(item => item.uid)).toEqual([3, 1, 2]);
  });

  it('跨位置时继承目标位置，并移除普通位置无效 role', () => {
    const entries = [entry(1, 'at_depth', 10, { position: { type: 'at_depth', depth: 4, role: 'assistant', order: 10 } }), entry(2, 'after_author_note', 10)];
    const result = planEntryMove({ entries, visibleUids: [1, 2], entryUid: 2, direction: 'up', sortPreference: { by: 'priority', dir: 'asc' } });
    expect(result.patches.get(2)?.position).toMatchObject({ type: 'at_depth', role: 'assistant', depth: 4 });
  });

  it('重复 order 时只重编号目标位置桶', () => {
    const entries = [entry(1, 'after_character_definition', 10), entry(2, 'after_character_definition', 10), entry(3, 'before_author_note', 10)];
    const result = planEntryMove({ entries, visibleUids: [1, 2, 3], entryUid: 2, direction: 'up', sortPreference: { by: 'priority', dir: 'asc' } });
    expect([...result.patches.keys()].sort()).toEqual([1, 2]);
    expect(result.patches.get(1)?.order).toBe(20);
    expect(result.patches.get(2)?.order).toBe(10);
  });

  it('自定义排序保留不在当前虚拟 DOM 中的 UID', () => {
    const entries = [entry(1), entry(2), entry(3), entry(4)];
    const result = planEntryMove({
      entries,
      visibleUids: [1, 3],
      entryUid: 3,
      direction: 'up',
      sortPreference: { by: 'custom', dir: 'asc' },
      customOrder: [1, 2, 3, 4],
    });
    expect(result.nextCustomOrder).toEqual([3, 1, 2, 4]);
  });

  it('不允许跨文件夹和置顶边界移动', () => {
    const entries = [entry(1), entry(2)];
    expect(planEntryMove({ entries, visibleUids: [1, 2], entryUid: 2, direction: 'up', sortPreference: { by: 'priority' }, regionByUid: { 1: 'a', 2: 'b' } }).movable).toBe(false);
    expect(planEntryMove({ entries, visibleUids: [1, 2], entryUid: 2, direction: 'up', sortPreference: { by: 'priority' }, pinnedUids: [1] }).reason).toContain('置顶');
  });
});
