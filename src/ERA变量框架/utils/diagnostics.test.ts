import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ERA 关键事件诊断独立存储', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('普通诊断写满 600 条后也不会挤掉关键事件日志', async () => {
    const diagnostics = await import('./diagnostics');

    diagnostics.recordEraDiagnostic('core-crud-update', 'event-edit-skipped', {
      messageId: 10,
      path: '事件系统.人物事件占用.段誉',
      reason: 'already-at-target',
    });
    for (let i = 0; i < 650; i += 1) {
      diagnostics.recordEraDiagnostic('utils-era-data', 'update-stat-data:finished', { i });
    }

    expect(diagnostics.readEraDiagnostics()).toHaveLength(600);
    expect(diagnostics.readEraDiagnostics().some(entry => entry.event === 'event-edit-skipped')).toBe(false);
    const critical = diagnostics.readEraCriticalDiagnostics();
    expect(critical).toHaveLength(1);
    expect(critical[0]).toEqual(expect.objectContaining({
      event: 'event-edit-skipped',
      details: expect.objectContaining({ messageId: 10, reason: 'already-at-target' }),
    }));
    expect(JSON.parse(localStorage.getItem(diagnostics.ERA_CRITICAL_DIAGNOSTICS_STORAGE_KEY) || '[]')).toHaveLength(1);
  });

  it('iframe 模块重新加载后仍能从 localStorage 读取关键诊断', async () => {
    const diagnostics = await import('./diagnostics');
    diagnostics.recordEraDiagnostic('wuxia-history-checkout', 'history-checkout-event-system-audit', {
      transactionId: 'checkout-123',
      stage: 'after-full-sync',
    });
    vi.resetModules();
    const reloaded = await import('./diagnostics');
    expect(reloaded.readEraCriticalDiagnostics().some(entry =>
      entry.details?.transactionId === 'checkout-123'
    )).toBe(true);
    expect((window as Window & { ERADiagnostics?: { critical: () => unknown[] } }).ERADiagnostics?.critical()).toEqual(
      reloaded.readEraCriticalDiagnostics(),
    );
  });

  it('clear 同时清空普通与独立关键诊断存储', async () => {
    const diagnostics = await import('./diagnostics');
    diagnostics.recordEraDiagnostic('core-crud-patcher', 'nonempty-editlog-overwritten-by-empty', { mk: 'mk-1' });
    expect(diagnostics.readEraCriticalDiagnostics()).toHaveLength(1);
    diagnostics.clearEraDiagnostics();
    expect(diagnostics.readEraDiagnostics()).toHaveLength(0);
    expect(diagnostics.readEraCriticalDiagnostics()).toHaveLength(0);
    expect(localStorage.getItem(diagnostics.ERA_CRITICAL_DIAGNOSTICS_STORAGE_KEY)).toBeNull();
  });
});
