import _ from 'lodash';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getWorldbookSafe: vi.fn(),
  updateWorldbookEntries: vi.fn(),
}));

vi.mock('../api.js', () => apiMocks);

Object.assign(globalThis, { _ });

import { applyAiPreview } from './aiActions.js';
import { generateAiPreview } from './aiActionsBatch.js';

type Entry = {
  uid: number;
  name: string;
  content: string;
  strategy: {
    keys: string[];
    keys_secondary: { logic: string; keys: string[] };
  };
};

function makeEntry(uid: number, overrides: Partial<Entry> = {}): Entry {
  return {
    uid,
    name: `条目 ${uid}`,
    content: `正文 ${uid}`,
    strategy: {
      keys: [`关键词 ${uid}`],
      keys_secondary: { logic: 'and_any', keys: [] },
    },
    ...overrides,
  };
}

describe('AI 预览结果契约', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiMocks.getWorldbookSafe.mockReset();
    apiMocks.updateWorldbookEntries.mockReset();
  });

  it('保留批量返回中的部分成功、缺失 UID 错误和实际请求配置', async () => {
    const entries = [makeEntry(1), makeEntry(2)];
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: entries });

    const result = await generateAiPreview({
      lorebookName: '测试世界书',
      entryUids: [1, 2],
      instruction: '改标题',
      fieldOptions: { title: true, content: false, prompt: false },
      customApi: { source: 'custom', model: 'test-model' },
      shouldStream: true,
      client: vi.fn(async () => JSON.stringify({ entries: [{ uid: 1, title: '新标题' }] })),
    });

    expect(result.outcome).toBe('partial');
    expect(result.items).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].uid).toBe(2);
    expect(result.summary).toMatchObject({ total: 2, succeeded: 1, failed: 1, cancelled: 0 });
    expect(result.resolvedConfig).toEqual({
      model: 'test-model',
      shouldStream: true,
      success: true,
      attemptLabel: '当前配置',
    });
  });

  it('停止生成时返回 cancelled 且不把未执行条目记为失败', async () => {
    const entries = [makeEntry(1), makeEntry(2)];
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: entries });
    const client = vi.fn();

    const result = await generateAiPreview({
      lorebookName: '测试世界书',
      entryUids: [1, 2],
      instruction: '改标题',
      client,
      shouldStop: () => true,
    });

    expect(client).not.toHaveBeenCalled();
    expect(result.outcome).toBe('cancelled');
    expect(result.errors).toEqual([]);
    expect(result.summary).toMatchObject({ total: 2, succeeded: 0, failed: 0, cancelled: 2 });
  });

  it('请求无法解析且没有成功项时返回 failed 并保留逐 UID 错误', async () => {
    const entries = [makeEntry(1), makeEntry(2)];
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: entries });

    const result = await generateAiPreview({
      lorebookName: '测试世界书',
      entryUids: [1, 2],
      instruction: '改标题',
      customApi: { model: 'broken-model' },
      client: vi.fn(async () => '不是 JSON'),
    });

    expect(result.outcome).toBe('failed');
    expect(result.items).toEqual([]);
    expect(result.errors.map((item: { uid: number }) => item.uid)).toEqual([1, 2]);
    expect(result.summary).toMatchObject({ total: 2, succeeded: 0, failed: 2, cancelled: 0 });
    expect(result.resolvedConfig).toMatchObject({ model: 'broken-model', attemptLabel: '当前配置' });
  });

  it('兼容诊断采用成功 attempt 的模型和流式配置', async () => {
    const entries = [makeEntry(1)];
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: entries });
    let callCount = 0;

    const result = await generateAiPreview({
      lorebookName: '测试世界书',
      entryUids: [1],
      instruction: '保持原样',
      customApi: { source: 'custom', model: 'test-model' },
      shouldStream: false,
      client: vi.fn(async (_prompt, options) => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('Got response status 503');
        }
        const entry = options.entries[0] as Entry;
        return JSON.stringify({
          entries: [{
            uid: entry.uid,
            title: entry.name,
            content: entry.content,
            prompts: {
              primary: entry.strategy.keys,
              secondary_logic: entry.strategy.keys_secondary.logic,
              secondary: entry.strategy.keys_secondary.keys,
            },
          }],
        });
      }),
    });

    expect(result.outcome).toBe('complete');
    expect(result.resolvedConfig).toEqual({
      model: 'test-model',
      shouldStream: true,
      success: true,
      attemptLabel: '兼容诊断 2/6',
    });
    expect(result.summary.diagnostics).toMatchObject({
      triggered: true,
      totalAttempts: 6,
      foundWorkingConfig: true,
      adoptedAttemptLabel: '兼容诊断 2/6',
    });
  });

  it('多批次保持顺序执行', async () => {
    const entries = [
      makeEntry(1, { content: '甲'.repeat(5000) }),
      makeEntry(2, { content: '乙'.repeat(5000) }),
      makeEntry(3, { content: '丙'.repeat(5000) }),
    ];
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: entries });
    const callOrder: number[] = [];
    let activeCalls = 0;
    let maxActiveCalls = 0;

    const result = await generateAiPreview({
      lorebookName: '测试世界书',
      entryUids: [1, 2, 3],
      instruction: '保持原样',
      contextBudget: { enabled: true, maxInputTokens: 1000, reserveOutputTokens: 256 },
      client: vi.fn(async (_prompt, options) => {
        activeCalls += 1;
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
        const uid = options.entries[0].uid;
        callOrder.push(uid);
        await Promise.resolve();
        activeCalls -= 1;
        return JSON.stringify({
          entries: options.entries.map((entry: Entry) => ({
            uid: entry.uid,
            title: entry.name,
            content: entry.content,
            prompts: {
              primary: entry.strategy.keys,
              secondary_logic: entry.strategy.keys_secondary.logic,
              secondary: entry.strategy.keys_secondary.keys,
            },
          })),
        });
      }),
    });

    expect(result.outcome).toBe('complete');
    expect(callOrder).toEqual([1, 2, 3]);
    expect(maxActiveCalls).toBe(1);
    expect(result.summary.batching.totalBatches).toBe(3);
  });
});

describe('应用 AI 预览结果契约', () => {
  beforeEach(() => {
    apiMocks.updateWorldbookEntries.mockReset();
  });

  it('逐 UID 返回应用与跳过原因，并只写回白名单字段', async () => {
    const original = makeEntry(1);
    const currentConflict = makeEntry(2, { content: '用户已修改' });
    const beforeConflict = makeEntry(2);
    const metaEntry = makeEntry(99, { name: '__WI_META_INTERNAL' });
    let writtenEntries: Entry[] = [];

    apiMocks.updateWorldbookEntries.mockImplementation(async (_name, mutator) => {
      const currentEntries = [original, currentConflict, metaEntry].map(entry => _.cloneDeep(entry));
      writtenEntries = mutator(currentEntries);
      return { success: true, changed: !_.isEqual(currentEntries, writtenEntries) };
    });

    const result = await applyAiPreview({
      lorebookName: '测试世界书',
      previewItems: [
        {
          uid: 1,
          title: original.name,
          changed: true,
          beforeEntry: _.cloneDeep(original),
          afterEntry: { ..._.cloneDeep(original), name: '允许的新标题', content: '不允许写入的正文' },
          editableFields: { title: true, content: false, prompt: false },
        },
        {
          uid: 2,
          title: beforeConflict.name,
          changed: true,
          beforeEntry: beforeConflict,
          afterEntry: { ..._.cloneDeep(beforeConflict), name: '冲突项新标题' },
          editableFields: { title: true, content: false, prompt: false },
        },
        {
          uid: 3,
          title: '已删除条目',
          changed: true,
          beforeEntry: makeEntry(3),
          afterEntry: makeEntry(3, { name: '找不到' }),
          editableFields: { title: true, content: false, prompt: false },
        },
        {
          uid: 99,
          title: metaEntry.name,
          changed: true,
          beforeEntry: _.cloneDeep(metaEntry),
          afterEntry: { ..._.cloneDeep(metaEntry), name: '__WI_META_CHANGED' },
          editableFields: { title: true, content: false, prompt: false },
        },
      ],
    });

    expect(result.appliedUids).toEqual([1]);
    expect(result.skipped).toEqual([
      { uid: 2, reason: 'snapshot-conflict' },
      { uid: 99, reason: 'reserved-meta-entry' },
      { uid: 3, reason: 'entry-missing' },
    ]);
    expect(result).toMatchObject({ appliedCount: 1, skippedCount: 3, changed: true });
    expect(writtenEntries.find(entry => entry.uid === 1)).toMatchObject({
      name: '允许的新标题',
      content: original.content,
    });
    expect(writtenEntries.find(entry => entry.uid === 2)).toEqual(currentConflict);
    expect(writtenEntries.find(entry => entry.uid === 99)).toEqual(metaEntry);
    expect(apiMocks.updateWorldbookEntries).toHaveBeenCalledWith(
      '测试世界书',
      expect.any(Function),
      expect.objectContaining({
        trackHistory: true,
        transactionType: 'ai-edit-selected',
        transactionMeta: { requestedCount: 4 },
      }),
    );
  });
});
