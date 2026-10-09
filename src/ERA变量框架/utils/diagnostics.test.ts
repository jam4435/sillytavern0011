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

  it('双 bundle 实例交替记录时不会用旧缓存覆盖另一实例写入的关键诊断', async () => {
    // 模拟武侠和 ERA 独立 webpack bundle 各加载一次 diagnostics.ts。
    const era = await import('./diagnostics');
    vi.resetModules();
    const wuxia = await import('./diagnostics');

    era.recordEraDiagnostic('core-sync', 'full-resync-event-state-audit', {
      stage: 'before-rollback',
    });
    wuxia.recordEraDiagnostic('wuxia-history-checkout', 'history-checkout-event-system-audit', {
      stage: 'after-full-sync',
    });
    era.recordEraDiagnostic('core-sync', 'full-resync-event-state-audit', {
      stage: 'after-replay',
    });

    const criticalEvents = wuxia.readEraCriticalDiagnostics().map(entry =>
      `${entry.event}:${entry.details?.stage}`,
    );
    expect(criticalEvents).toEqual([
      'full-resync-event-state-audit:before-rollback',
      'history-checkout-event-system-audit:after-full-sync',
      'full-resync-event-state-audit:after-replay',
    ]);
    expect(era.readEraCriticalDiagnostics()).toHaveLength(3);
    expect(JSON.parse(localStorage.getItem('era_critical_diagnostics_v1') ?? '[]')).toHaveLength(3);

    // 普通日志同样不应被另一份模块缓存覆盖。
    const ordinaryEvents = era.readEraDiagnostics().filter(entry =>
      entry.event === 'full-resync-event-state-audit' ||
      entry.event === 'history-checkout-event-system-audit'
    );
    expect(ordinaryEvents).toHaveLength(3);
  });

  it('即使另一模块清空共享存储，旧模块也不会把缓存里的日志再次写回', async () => {
    const first = await import('./diagnostics');
    first.recordEraDiagnostic('core-sync', 'full-resync-event-state-audit', { stage: 'before-rollback' });
    vi.resetModules();
    const second = await import('./diagnostics');
    second.clearEraDiagnostics();

    first.recordEraDiagnostic('core-sync', 'full-resync-event-state-audit', { stage: 'after-replay' });
    const entries = second.readEraCriticalDiagnostics();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.details?.stage).toBe('after-replay');
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
