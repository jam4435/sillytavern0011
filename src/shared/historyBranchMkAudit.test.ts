import { describe, expect, it } from 'vitest';
import { collectHistoryBranchMkSnapshot } from './historyBranchMkAudit';

function makeVariables(selectedMks: string[], logs: Record<string, unknown>) {
  return {
    ERAMetaData: { SelectedMks: selectedMks, EditLogs: logs },
    stat_data: {
      事件系统: {
        进行中事件: { '天龙第二回07-测试': { 年: 1202 } },
      },
    },
  };
}

describe('历史分叉 MK 生命周期只读审计', () => {
  const futureLog = [
    { op: 'insert', path: '事件系统.进行中事件.天龙第二回07-测试', value_new: { 年: 1202 } },
  ];

  it('来源聊天在分叉前保留未来 MK 和事件日志', () => {
    const result = collectHistoryBranchMkSnapshot(makeVariables(
      ['mk0', 'mk1', 'mk2', 'mk3'],
      { mk2: futureLog, mk3: [{ op: 'update', path: 'user数据.体力' }] },
    ), 1);
    expect(result).toMatchObject({
      selectedMksLength: 4,
      futureMksCount: 2,
      futureEditLogCount: 2,
      futureEventSystemLogCount: 1,
      editLogKeysCount: 2,
      activeEventLogCounts: { '天龙第二回07-测试': 1 },
    });
  });

  it('区分截断了 SelectedMks 但仍保留未来 EditLogs 的情况', () => {
    const result = collectHistoryBranchMkSnapshot(makeVariables(
      ['mk0', 'mk1'],
      { mk2: futureLog },
    ), 1);
    expect(result).toMatchObject({
      selectedMksLength: 2,
      futureMksCount: 0,
      editLogKeysCount: 1,
      unselectedEditLogKeysCount: 1,
      activeEventLogCounts: { '天龙第二回07-测试': 0 },
    });
  });

  it('区分未来 SelectedMks 与对应 EditLogs 均已被清理的情况', () => {
    const result = collectHistoryBranchMkSnapshot(makeVariables(['mk0', 'mk1'], {}), 1);
    expect(result).toMatchObject({
      selectedMksLength: 2,
      futureMksCount: 0,
      editLogKeysCount: 0,
      unselectedEditLogKeysCount: 0,
    });
  });

  it('聊天变量尚未就绪时明确标记未知，不误判为已经截断', () => {
    const result = collectHistoryBranchMkSnapshot(null, 1);
    expect(result).toMatchObject({
      variablesAvailable: false,
      metaAvailable: false,
      statAvailable: false,
      selectedMksLength: 0,
    });
  });
});
