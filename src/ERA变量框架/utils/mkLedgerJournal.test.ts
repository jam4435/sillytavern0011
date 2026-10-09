import { beforeEach, describe, expect, it } from 'vitest';
import {
  ERA_MK_LEDGER_JOURNAL_KEY,
  consumeMkRollbackWitness,
  markMkRollbackPerformed,
  recordMkLedgerTransition,
  summarizeMkLedger,
} from './mkLedgerJournal';

describe('ERA MK 撤销账本生命周期', () => {
  beforeEach(() => localStorage.removeItem(ERA_MK_LEDGER_JOURNAL_KEY));

  it('记录同一楼从非空到空的准确时序，只有路径/数量没有原始变量值', () => {
    const mk = 'era_mk_test_message6';
    const logs = [
      { op: 'insert', path: '参与事件.事件06', value_new: { secret: 'raw-secret' } },
      { op: 'delete', path: '后续事件线索.事件06', value_old: { secret: 'raw-secret' } },
    ];
    recordMkLedgerTransition('apply-committed', mk, { messageId: 6, ...summarizeMkLedger(logs) });
    recordMkLedgerTransition('rollback-before', mk, { messageId: 6, ...summarizeMkLedger(logs) });
    recordMkLedgerTransition('apply-committed', mk, { messageId: 6, oldLogCount: 2, ...summarizeMkLedger([]) });

    const stored = localStorage.getItem(ERA_MK_LEDGER_JOURNAL_KEY) ?? '';
    const rows = JSON.parse(stored);
    expect(rows).toHaveLength(3);
    expect(rows.map((entry: any) => entry.details.stage)).toEqual([
      'apply-committed', 'rollback-before', 'apply-committed',
    ]);
    expect(rows[0].details.eventPaths).toEqual(['参与事件.事件06', '后续事件线索.事件06']);
    expect(rows[2].details.logCount).toBe(0);
    expect(stored).not.toContain('raw-secret');
  });

  it('实际回滚见证仅消费一次，避免误用于其他轮次', () => {
    const mk = 'era_mk_rollback_test';
    expect(consumeMkRollbackWitness(mk)).toBe(false);
    markMkRollbackPerformed(mk);
    expect(consumeMkRollbackWitness(mk)).toBe(true);
    expect(consumeMkRollbackWitness(mk)).toBe(false);
  });

  it('日志摘要空、无效、非事件根时保持可预测', () => {
    expect(summarizeMkLedger(null)).toMatchObject({ logCount: 0, eventLogCount: 0 });
    expect(summarizeMkLedger([{ op: 'update', path: '角色数据.段誉.状态' }]))
      .toMatchObject({ logCount: 1, eventLogCount: 0 });
  });
});
