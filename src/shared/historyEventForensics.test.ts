import { beforeEach, describe, expect, it } from 'vitest';
import {
  HISTORY_EVENT_FORENSICS_STORAGE_KEY,
  hashHistoryEventForensics,
  recordHistoryEventForensics,
  snapshotHistoryEventForensics,
  summarizeEventTransactionOperations,
} from './historyEventForensics';

describe('历史事件只读取证', () => {
  beforeEach(() => {
    localStorage.removeItem(HISTORY_EVENT_FORENSICS_STORAGE_KEY);
  });

  it('与历史节点校验所用 16 位算法一致，且与对象属性顺序无关', () => {
    const a = { 进行中事件: { 天龙第二回07: { 年: 1202, 月: 3, 日: 16, 时: 16, 分: 0 } } };
    const b = { 进行中事件: { 天龙第二回07: { 分: 0, 时: 16, 日: 16, 月: 3, 年: 1202 } } };
    expect(hashHistoryEventForensics(a)).toBe('3e556cdca1bee3aa');
    expect(hashHistoryEventForensics(b)).toBe(hashHistoryEventForensics(a));
    expect(hashHistoryEventForensics({})).toBe('9efc961a5465b825');
    expect(hashHistoryEventForensics(null)).toBe('91f718d177074ba4');
  });

  it('准确识别活动事件时间及人物占用的变化，但不保留变量原始内容', () => {
    const before = {
      事件系统: {
        进行中事件: { 事件07: { 年: 1202, 时: 17 } },
        人物事件占用: { 段誉: { 事件名: '事件07', 地点: '琅嬛福地', 入场时间: { 年: 1202 } } },
      },
    };
    const after = structuredClone(before);
    after.事件系统.进行中事件.事件07.时 = 18;
    const pre = snapshotHistoryEventForensics(before);
    const post = snapshotHistoryEventForensics(after);
    expect(pre.eventSystemHash).not.toBe(post.eventSystemHash);
    expect(pre.eventStateHash).not.toBe(post.eventStateHash);
    expect(pre.ongoingEvents[0]?.hash).not.toBe(post.ongoingEvents[0]?.hash);
    expect(pre.characterOccupancy[0]?.hash).toBe(post.characterOccupancy[0]?.hash);
    expect(JSON.stringify(pre)).not.toContain('琅嬛福地');
    expect(pre).toMatchObject({
      ongoingCount: 1,
      occupancyCount: 1,
      characterOccupancy: [{ name: '段誉', eventName: '事件07', hash: expect.any(String) }],
    });
  });

  it('只提取事件根中的事务路径和动作，不复制补丁值', () => {
    const paths = summarizeEventTransactionOperations([
      { type: 'insert', payload: { 事件系统: { 进行中事件: { 事件07: { 年: 1202 } } } } },
      { type: 'delete', payload: { 事件系统: { 未发生事件: { 事件07: {} } } } },
      { type: 'update', payload: { 角色数据: { 段誉: { 所在位置: '特殊地点' } } } },
    ]);
    expect(paths).toEqual([
      { type: 'insert', path: '事件系统.进行中事件.事件07' },
      { type: 'delete', path: '事件系统.未发生事件.事件07' },
    ]);
    expect(JSON.stringify(paths)).not.toContain('1202');
    expect(JSON.stringify(paths)).not.toContain('特殊地点');
  });

  it('独立存储可保留封存和事务记录，不依赖普通 ERA critical 上限', () => {
    recordHistoryEventForensics('history-node-sealed', { nodeId: 'node1', eventHash: 'abcd' });
    recordHistoryEventForensics('era-transaction-confirmed', { transactionId: 'tx1', eventHash: 'efgh' });
    const entries = JSON.parse(localStorage.getItem(HISTORY_EVENT_FORENSICS_STORAGE_KEY) ?? '[]');
    expect(entries).toHaveLength(2);
    expect(entries.map((entry: { details: { stage: string } }) => entry.details.stage)).toEqual([
      'history-node-sealed', 'era-transaction-confirmed',
    ]);
  });
});
