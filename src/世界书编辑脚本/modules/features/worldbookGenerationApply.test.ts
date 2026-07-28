import _ from 'lodash';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  createWorldbookSafe: vi.fn(),
  deleteWorldbookSafe: vi.fn(),
  enableGlobalLorebook: vi.fn(),
  getCharWorldbooksSafe: vi.fn(),
  getChatWorldbookSafe: vi.fn(),
  getWorldbookBindingStatus: vi.fn(),
  getWorldbookNamesSafe: vi.fn(),
  getWorldbookSafe: vi.fn(),
  rebindCharWorldbooksSafe: vi.fn(),
  rebindChatWorldbookSafe: vi.fn(),
  updateWorldbookEntries: vi.fn(),
}));
const historyMocks = vi.hoisted(() => ({
  consumeCreatedWorldbookTransaction: vi.fn(),
  getCreatedWorldbookTransactionSnapshot: vi.fn(),
  recordCreatedWorldbookTransaction: vi.fn(),
}));

vi.mock('../api.js', () => apiMocks);
vi.mock('./history.js', () => historyMocks);
Object.assign(globalThis, { _ });

import {
  appendGeneratedEntriesAtomically,
  fingerprintWorldbookEntry,
  rollbackCreatedWorldbook,
} from './worldbookGenerationApply.js';

function makeEntry(uid: number, name = `条目 ${uid}`) {
  return {
    uid,
    name,
    content: '这是足够长的测试正文内容，用于验证世界书生成应用。',
    enabled: true,
    probability: 100,
    strategy: {
      type: 'selective',
      keys: [name],
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    },
    position: { type: 'after_character_definition', role: 'system', depth: 0, order: uid * 10 },
    recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
    effect: { sticky: null, cooldown: null, delay: null },
  };
}

describe('生成世界书原子应用', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach(mock => mock.mockReset());
    Object.values(historyMocks).forEach(mock => mock.mockReset());
  });

  it('隐藏元条目参与最大 UID，新增与最小更新在一次事务中完成', async () => {
    const original = makeEntry(1);
    const meta = makeEntry(9, '__WI_META_INTERNAL');
    let written: ReturnType<typeof makeEntry>[] = [];
    apiMocks.updateWorldbookEntries.mockImplementation(async (_name, mutator, options) => {
      const current = [_.cloneDeep(original), _.cloneDeep(meta)];
      written = mutator(current);
      expect(options).toMatchObject({ trackHistory: true, transactionType: 'worldbook-generation-apply' });
      return { success: true, changed: true };
    });

    const result = await appendGeneratedEntriesAtomically(
      '目标书',
      [{ ...makeEntry(0, '新条目'), uid: undefined }],
      [{
        uid: 1,
        beforeFingerprint: fingerprintWorldbookEntry(original),
        patch: { content: '更新后的父级导航正文，长度足够且只更新允许的结构字段。' },
      }],
    );

    expect(result.success).toBe(true);
    expect(result.createdEntries[0].uid).toBe(10);
    expect(written.find(entry => entry.uid === 1)?.content).toContain('更新后的父级');
    expect(written.find(entry => entry.uid === 9)?.name).toBe('__WI_META_INTERNAL');
    expect(apiMocks.updateWorldbookEntries).toHaveBeenCalledTimes(1);
  });

  it('标题或指纹冲突时整次写入失败', async () => {
    const original = makeEntry(1);
    apiMocks.updateWorldbookEntries.mockImplementation(async (_name, mutator) => {
      try {
        mutator([_.cloneDeep(original)]);
        return { success: true, changed: true };
      } catch (error) {
        return { success: false, changed: false, error };
      }
    });

    const result = await appendGeneratedEntriesAtomically(
      '目标书',
      [makeEntry(0, original.name)],
      [{ uid: 1, beforeFingerprint: 'stale', patch: { content: '修改' } }],
    );

    expect(result.success).toBe(false);
    expect(result.conflicts.map(conflict => conflict.type)).toEqual(
      expect.arrayContaining(['fingerprint-conflict']),
    );
  });

  it('只有内容未变化且完全未绑定时才删除新建世界书', async () => {
    const snapshot = [makeEntry(1)];
    historyMocks.getCreatedWorldbookTransactionSnapshot.mockReturnValue({ snapshot });
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: _.cloneDeep(snapshot) });
    apiMocks.getWorldbookBindingStatus.mockResolvedValue({ bound: false, bindings: {} });
    apiMocks.deleteWorldbookSafe.mockResolvedValue(true);

    const result = await rollbackCreatedWorldbook('新书');

    expect(result).toMatchObject({ success: true, changed: true, reason: 'rolled-back' });
    expect(apiMocks.deleteWorldbookSafe).toHaveBeenCalledWith('新书');
    expect(historyMocks.consumeCreatedWorldbookTransaction).toHaveBeenCalledWith('新书');
  });

  it('刷新后可使用生成项目持久化的创建快照继续做严格回滚检查', async () => {
    const snapshot = [makeEntry(1)];
    historyMocks.getCreatedWorldbookTransactionSnapshot.mockReturnValue(null);
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: _.cloneDeep(snapshot) });
    apiMocks.getWorldbookBindingStatus.mockResolvedValue({ bound: false, bindings: {} });
    apiMocks.deleteWorldbookSafe.mockResolvedValue(true);

    const result = await rollbackCreatedWorldbook('新书', {
      creationTransaction: { lorebookName: '新书', snapshot, meta: { operationType: 'worldbook-create' } },
    });

    expect(result).toMatchObject({ success: true, changed: true });
  });
});
