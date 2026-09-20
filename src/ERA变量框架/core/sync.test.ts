import { describe, expect, it } from 'vitest';

import { collectReachableMessageKeys, compactEditLogsInMeta, pruneUnreachableEditLogs } from './sync';

const era = (mk: string) =>
  `<era_data>{"era-message-key"="${mk}","era-message-type"="assistant"}</era_data>\n正文`;

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
