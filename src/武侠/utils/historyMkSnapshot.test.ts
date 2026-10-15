import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeHistoryMkDifferences,
  HISTORY_MK_SNAPSHOT_PREFIX,
  loadHistoryMkSnapshot,
  saveHistoryMkSnapshot,
} from './historyMkSnapshot';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('历史封存逐楼 MK 快照', () => {
  it('保存并读取 MK 全量基准，复制返回值不修改存储', () => {
    saveHistoryMkSnapshot('sealed-hash', ['mk0', null, 'mk2']);
    const copy = loadHistoryMkSnapshot('sealed-hash')!;
    expect(copy).toEqual(['mk0', null, 'mk2']);
    copy[0] = 'changed';
    expect(loadHistoryMkSnapshot('sealed-hash')).toEqual(['mk0', null, 'mk2']);
  });

  it('旧节点或损坏的快照不可用，稀疏/undefined 不会被误写成 null', () => {
    expect(loadHistoryMkSnapshot('old-hash')).toBeNull();
    expect(() => saveHistoryMkSnapshot('bad', ['mk0', undefined])).toThrow('无法无损封存');
    const sparse = new Array(2);
    sparse[0] = 'mk0';
    expect(() => saveHistoryMkSnapshot('bad', sparse)).toThrow('无法无损封存');
    localStorage.setItem(HISTORY_MK_SNAPSHOT_PREFIX + 'broken',
      JSON.stringify({ version: 1, selectedMksHash: 'broken', mks: [42] }));
    expect(loadHistoryMkSnapshot('broken')).toBeNull();
  });
});

describe('逐楼差异诊断', () => {
  it('报告第一处不同的封存 MK、恢复 MK，及消息内容不匹配', () => {
    const report = describeHistoryMkDifferences(
      ['mk0', 'mk1', 'mk2', 'mk3'],
      ['mk0', 'new1', 'mk2'],
      [
        { messageId: 0, role: 'assistant', mk: 'mk0' },
        { messageId: 1, role: 'user', mk: 'mk1' },
        { messageId: 2, role: 'assistant', mk: 'mk2' },
      ],
    ).join('\n');
    expect(report).toContain('封存数组长度：4；恢复数组长度：3');
    expect(report).toContain('封存/恢复不同的 MK 楼层：2 处');
    expect(report).toContain('楼层 1：封存 mk1 → 恢复 new1');
    expect(report).toContain('楼层 3：封存 mk3 → 恢复 <缺失>');
    expect(report).toContain('楼层 1 [user]：SelectedMks=new1；消息 MK=mk1');
  });

  it('旧节点没保存基准时仍能报告当前 SelectedMks 与消息不一致', () => {
    const report = describeHistoryMkDifferences(null, ['mk0', null, 'orphan'], [
      { messageId: 0, role: 'assistant', mk: 'mk0' },
      { messageId: 1, role: 'user', mk: 'mk1', swipeMk: 'mk2' },
    ]).join('\n');
    expect(report).toContain('封存逐楼 MK 基准不可用');
    expect(report).toContain('恢复 SelectedMks / 实际消息不一致：2 处');
    expect(report).toContain('楼层 1 [user]：SelectedMks=null；消息 MK=mk1；激活 swipe MK=mk2');
    expect(report).toContain('楼层 2：SelectedMks=orphan；聊天中没有对应消息');
  });

  it('比较全部楼层，但差异样本只展示有限条数', () => {
    const report = describeHistoryMkDifferences(
      ['a', 'b', 'c', 'd'], ['x', 'y', 'z', 'w'], [], 2,
    ).join('\n');
    expect(report).toContain('封存/恢复不同的 MK 楼层：4 处');
    expect(report).toContain('其余 2 处省略');
    expect(report).not.toContain('楼层 2：封存 c');
  });
});
