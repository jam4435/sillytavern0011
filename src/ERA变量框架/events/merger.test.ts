import { describe, expect, it } from 'vitest';
import { collectSyncIdsFromDetail, EventJob, mergeEventBatch } from './merger';

function job(type: string, timestamp: number, detail?: unknown): EventJob {
  return { type, detail, timestamp };
}

describe('SYNC 组事件合并', () => {
  it('后到的普通 SYNC 不再把 manual_full_sync 覆盖降级，且保留其 syncId', () => {
    const merged = mergeEventBatch([
      job('manual_full_sync', 1000, { syncId: 'checkout-1' }),
      job(tavern_events.CHAT_CHANGED, 1100),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe('manual_full_sync');
    expect((merged[0].detail as { syncIds?: string[] }).syncIds).toEqual(['checkout-1']);
  });

  it('manual_full_sync 后到时正常覆盖普通 SYNC 并携带 syncId', () => {
    const merged = mergeEventBatch([
      job(tavern_events.CHAT_CHANGED, 1000),
      job('manual_full_sync', 1100, { syncId: 'checkout-2' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe('manual_full_sync');
    expect((merged[0].detail as { syncIds?: string[] }).syncIds).toEqual(['checkout-2']);
  });

  it('连续三个 SYNC 合并后完整重算与全部 syncId 均存活', () => {
    const merged = mergeEventBatch([
      job(tavern_events.CHAT_CHANGED, 1000, { syncId: 'other-waiter' }),
      job('manual_full_sync', 1100, { syncId: 'checkout-3' }),
      job(tavern_events.MESSAGE_RECEIVED, 1200),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe('manual_full_sync');
    expect((merged[0].detail as { syncIds?: string[] }).syncIds?.slice().sort()).toEqual([
      'checkout-3',
      'other-waiter',
    ]);
  });

  it('普通 SYNC 之间仍保持后者覆盖前者的原有行为', () => {
    const merged = mergeEventBatch([
      job(tavern_events.MESSAGE_RECEIVED, 1000),
      job(tavern_events.CHAT_CHANGED, 1100),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe(tavern_events.CHAT_CHANGED);
    expect(merged[0].detail).toBeUndefined();
  });
});

describe('collectSyncIdsFromDetail', () => {
  it('汇总 syncId 与 syncIds、去重并过滤非法项', () => {
    expect(collectSyncIdsFromDetail({ syncId: 'a', syncIds: ['a', 'b', '', 42, null] })).toEqual(['a', 'b']);
  });

  it('非对象 detail 返回空数组', () => {
    expect(collectSyncIdsFromDetail(undefined)).toEqual([]);
    expect(collectSyncIdsFromDetail('manual')).toEqual([]);
  });
});

describe('WRITE 组批事务记账与确认不丢失', () => {
  it('同楼两个相邻 apiWrite 合并成一次重放，但两个 transactionId 都可收到确认', () => {
    const jobs = mergeEventBatch([
      job('era:apiWrite', 1000, { messageId: 6, transactionId: 'participant-insert', transactionIds: ['participant-insert'] }),
      job('era:apiWrite', 1001, { messageId: 6, transactionId: 'followup-delete', transactionIds: ['followup-delete'] }),
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].type).toBe('era:apiWrite');
    expect(jobs[0].detail.transactionIds).toEqual(['participant-insert', 'followup-delete']);
    expect(jobs[0].detail.transactionId).toBeUndefined();
  });

  it('WRITE 组合中的 APP_READY 不能吞掉 apiWrite 的事务身份', () => {
    const jobs = mergeEventBatch([
      job('era:apiWrite', 1000, { messageId: 6, transactionId: 'participant-insert' }),
      job(tavern_events.APP_READY, 1001),
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].type).toBe('era:apiWrite');
    expect(jobs[0].detail.transactionIds).toEqual(['participant-insert']);
  });

  it('不同楼层的 apiWrite 不进行跨楼合并', () => {
    const jobs = mergeEventBatch([
      job('era:apiWrite', 1000, { messageId: 4, transactionId: 'earlier' }),
      job('era:apiWrite', 1001, { messageId: 6, transactionId: 'later' }),
    ]);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].detail.transactionId).toBe('earlier');
    expect(jobs[1].detail.transactionId).toBe('later');
  });
});
