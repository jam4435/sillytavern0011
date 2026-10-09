import { describe, expect, it } from 'vitest';

import { collectReachableMessageKeys, compactEditLogsInMeta, describeEventRollbackPathCheck, hashSyncAudit, pruneUnreachableEditLogs } from './sync';

const era = (mk: string) =>
  `<era_data>{"era-message-key"="${mk}","era-message-type"="assistant"}</era_data>\n正文`;

describe('ERA event rollback checks', () => {
  it('recognizes correctly applied inverse updates without exposing values', () => {
    const entry = { op: 'update', path: '事件系统.进行中事件.测试事件.年', value_old: 1200, value_new: 1201 };
    const before = { 进行中事件: { 测试事件: { 年: 1201 } } };
    const after = { 进行中事件: { 测试事件: { 年: 1200 } } };
    const description = describeEventRollbackPathCheck(entry, before, after);
    expect(description).toContain('before=new:true');
    expect(description).toContain('before=old:false');
    expect(description).toContain('after=old:true');
    expect(description).not.toContain('1200');
    expect(description).not.toContain('1201');
  });

  it('recognizes no-op rollback against stale event logs', () => {
    const entry = { op: 'update', path: '事件系统.已完成事件.旧事件', value_old: 0, value_new: 1 };
    const value = { 已完成事件: { 旧事件: 7 } };
    const description = describeEventRollbackPathCheck(entry, value, value);
    expect(description).toContain('before=new:false');
    expect(description).toContain('before=old:false');
    expect(description).toContain('after=old:false');
  });
});

describe('ERA full resync audit fingerprints', () => {
  it('orders event bucket object keys deterministically and detects actual state changes', () => {
    const first = { 已完成事件: { '事件02': 1, '事件01': 0 }, 进行中事件: { '事件03': 1 } };
    const reordered = { 进行中事件: { '事件03': 1 }, 已完成事件: { '事件01': 0, '事件02': 1 } };
    expect(hashSyncAudit(first)).toBe(hashSyncAudit(reordered));
    expect(hashSyncAudit({ ...reordered, 已完成事件: { '事件01': 1, '事件02': 1 } }))
      .not.toBe(hashSyncAudit(first));
  });
});

describe('ERA EditLog storage compaction', () => {
  it('migrates legacy JSON strings and drops only no-op updates', () => {
    const meta = {
      EditLogs: {
        mk1: JSON.stringify([
          { op: 'update', path: '世界信息.时间.年', value_old: 1200, value_new: 1200 },
          { op: 'update', path: '世界信息.时间.日', value_old: 1, value_new: 2 },
          { op: 'insert', path: '角色数据.甲', value_new: { 姓名: '甲' } },
        ]),
        mk2: [{ op: 'delete', path: '角色数据.乙', value_old: { 姓名: '乙' } }],
      },
    };

    expect(compactEditLogsInMeta(meta)).toEqual({
      convertedLogs: 1,
      removedNoopUpdates: 1,
    });
    expect(meta.EditLogs.mk1).toEqual([
      { op: 'update', path: '世界信息.时间.日', value_old: 1, value_new: 2 },
      { op: 'insert', path: '角色数据.甲', value_new: { 姓名: '甲' } },
    ]);
    expect(meta.EditLogs.mk2).toEqual([{ op: 'delete', path: '角色数据.乙', value_old: { 姓名: '乙' } }]);
  });

  it('leaves malformed legacy strings untouched instead of replacing them with an empty log', () => {
    const meta = {
      EditLogs: {
        broken: '[{"op":"update"',
      },
    };

    expect(compactEditLogsInMeta(meta)).toEqual({
      convertedLogs: 0,
      removedNoopUpdates: 0,
    });
    expect(meta.EditLogs.broken).toBe('[{"op":"update"');
  });
});

describe('ERA EditLog reachability cleanup', () => {
  it('keeps active and non-current swipe MKs, removing only truly unreachable logs', () => {
    const messages = [
      {
        message_id: 1,
        role: 'assistant',
        mes: era('mk-active'),
        message: era('mk-active'),
        swipe_id: 1,
        swipes: [era('mk-alt'), era('mk-active')],
      },
    ];
    const meta = {
      EditLogs: {
        'mk-active': [{ op: 'update' }],
        'mk-alt': [{ op: 'update' }],
        'mk-orphan': [{ op: 'update' }],
      },
    };

    const reachable = collectReachableMessageKeys(messages, ['mk-active']);
    expect([...reachable].sort()).toEqual(['mk-active', 'mk-alt']);

    expect(pruneUnreachableEditLogs(meta, messages, ['mk-active'])).toEqual(['mk-orphan']);
    expect(Object.keys(meta.EditLogs).sort()).toEqual(['mk-active', 'mk-alt']);
  });

  it('conservatively keeps SelectedMks even if the host message shape is incomplete', () => {
    const meta = {
      EditLogs: {
        'mk-selected': [],
        'mk-orphan': [],
      },
    };

    expect(pruneUnreachableEditLogs(meta, [], ['mk-selected'])).toEqual(['mk-orphan']);
    expect(Object.keys(meta.EditLogs)).toEqual(['mk-selected']);
  });
});
