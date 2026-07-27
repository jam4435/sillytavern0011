import _ from 'lodash';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getWorldbookSafe: vi.fn(),
  updateWorldbookEntries: vi.fn(),
}));
const llmMocks = vi.hoisted(() => ({
  requestLlmText: vi.fn(),
}));

vi.mock('../api.js', () => apiMocks);
vi.mock('./llmClient.js', () => llmMocks);

Object.assign(globalThis, { _ });

import { applyAiPreview, generateAiPreview as generateQuickAiPreview } from './aiActions.js';
import { generateAiPlan, generateAiPreview } from './aiActionsBatch.js';

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
    llmMocks.requestLlmText.mockReset();
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

  it('规划请求使用输出上限并解析逐条任务契约', async () => {
    const entries = [makeEntry(1), makeEntry(2)];
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: entries });
    llmMocks.requestLlmText.mockResolvedValue(JSON.stringify({
      readonly_uids: [2],
      editable_uids: [1],
      plan: {
        goal: '重写主条目',
        must_keep: [],
        rewrite_rules: [],
        consistency_notes: [],
        entry_tasks: [{
          uid: 1,
          objective: '补全主条目',
          complexity: 'high',
          estimated_output_tokens: 1800,
          depends_on_uids: [2],
          related_uids: [],
        }],
      },
    }));

    const result = await generateAiPlan({
      lorebookName: '测试世界书',
      instruction: '补全设定',
      contextBudget: { reserveOutputTokens: 8192 },
    });

    expect(result.plan.entry_tasks).toEqual([
      expect.objectContaining({
        uid: 1,
        complexity: 'high',
        estimated_output_tokens: 1800,
        depends_on_uids: [2],
      }),
    ]);
    expect(llmMocks.requestLlmText).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 8192 }),
    );
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

  it('直接模式每五条分批并保持顺序执行，输入 token 不改变批次', async () => {
    const entries = Array.from({ length: 11 }, (_, index) =>
      makeEntry(index + 1, { content: `${index + 1}`.repeat(5000) }));
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: entries });
    const callOrder: number[] = [];
    const batchSizes: number[] = [];
    let activeCalls = 0;
    let maxActiveCalls = 0;

    const result = await generateAiPreview({
      lorebookName: '测试世界书',
      entryUids: entries.map(entry => entry.uid),
      instruction: '保持原样',
      contextBudget: { enabled: true, maxInputTokens: 1000, reserveOutputTokens: 256 },
      client: vi.fn(async (_prompt, options) => {
        activeCalls += 1;
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
        const uid = options.entries[0].uid;
        callOrder.push(uid);
        batchSizes.push(options.entries.length);
        await Promise.resolve();
        activeCalls -= 1;
        return JSON.stringify({
          entries: options.entries.map((entry: Entry) => ({
            uid: entry.uid,
            title: entry.name,
            content: entry.content,
            prompts: {
              primary: entry.strategy.keys,
            },
          })),
        });
      }),
    });

    expect(result.outcome).toBe('complete');
    expect(callOrder).toEqual([1, 6, 11]);
    expect(batchSizes).toEqual([5, 5, 1]);
    expect(maxActiveCalls).toBe(1);
    expect(result.summary.batching.totalBatches).toBe(3);
    expect(result.summary.batching.strategy).toBe('direct-entry-count');
  });

  it('超长只读上下文只产生输入警告，不拆分三个空修改条目', async () => {
    const targets = [
      makeEntry(1, { content: '' }),
      makeEntry(2, { content: '' }),
      makeEntry(3, { content: '' }),
    ];
    const readonly = Array.from({ length: 20 }, (_, index) =>
      makeEntry(100 + index, { content: '只读背景'.repeat(2000) }));
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: [...targets, ...readonly] });
    const client = vi.fn(async (_prompt, options) =>
      JSON.stringify({
        entries: options.entries.map((entry: Entry) => ({
          uid: entry.uid,
          title: entry.name,
          content: entry.content,
          prompts: { primary: entry.strategy.keys },
        })),
      }));

    const result = await generateAiPreview({
      lorebookName: '测试世界书',
      entryUids: targets.map(entry => entry.uid),
      readonlyEntryUids: readonly.map(entry => entry.uid),
      instruction: '补全空条目',
      contextBudget: { enabled: true, maxInputTokens: 1000, reserveOutputTokens: 4096 },
      client,
    });

    expect(client).toHaveBeenCalledTimes(1);
    expect(result.summary.batching.totalBatches).toBe(1);
    expect(result.summary.batching.oversizedBatches).toBe(1);
    expect(result.warnings.some((warning: { warning?: string }) =>
      warning.warning?.includes('超过警戒值'))).toBe(true);
  });

  it('规划模式按跨批依赖排序，并把前批最新结果注入后批', async () => {
    const entries = [makeEntry(2, { name: 'B' }), makeEntry(1, { name: 'A' })];
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: entries });
    const callOrder: number[] = [];
    const prompts: string[] = [];
    const client = vi.fn(async (prompt, options) => {
      prompts.push(prompt);
      callOrder.push(options.entries[0].uid);
      const entry = options.entries[0] as Entry;
      return JSON.stringify({
        entries: [{
          uid: entry.uid,
          title: entry.uid === 1 ? '新 A' : '新 B',
          content: entry.content,
          prompts: { primary: entry.strategy.keys },
        }],
      });
    });

    const result = await generateAiPreview({
      lorebookName: '测试世界书',
      entryUids: [2, 1],
      instruction: '按依赖修改',
      sourceMode: 'plan',
      planningResult: {
        plan: {
          entry_tasks: [
            {
              uid: 2,
              objective: '根据 A 修改 B',
              complexity: 'medium',
              estimated_output_tokens: 1024,
              depends_on_uids: [1],
              related_uids: [],
            },
            {
              uid: 1,
              objective: '先修改 A',
              complexity: 'medium',
              estimated_output_tokens: 1024,
              depends_on_uids: [],
              related_uids: [],
            },
          ],
        },
      },
      contextBudget: { enabled: false, maxInputTokens: 1000, reserveOutputTokens: 2048 },
      client,
    });

    expect(result.outcome).toBe('complete');
    expect(callOrder).toEqual([1, 2]);
    expect(prompts[1]).toContain('新 A');
    expect(result.summary.batching.strategy).toBe('planned-output-graph');
  });

  it('规划依赖失败时跳过下游条目', async () => {
    const entries = [makeEntry(1, { name: 'A' }), makeEntry(2, { name: 'B' })];
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: entries });
    const client = vi.fn(async () => JSON.stringify({ entries: [] }));

    const result = await generateAiPreview({
      lorebookName: '测试世界书',
      entryUids: [1, 2],
      instruction: '按依赖修改',
      sourceMode: 'plan',
      planningResult: {
        plan: {
          entry_tasks: [
            {
              uid: 1,
              objective: '先修改 A',
              complexity: 'medium',
              estimated_output_tokens: 1024,
              depends_on_uids: [],
              related_uids: [],
            },
            {
              uid: 2,
              objective: '根据 A 修改 B',
              complexity: 'medium',
              estimated_output_tokens: 1024,
              depends_on_uids: [1],
              related_uids: [],
            },
          ],
        },
      },
      contextBudget: { enabled: false, maxInputTokens: 1000, reserveOutputTokens: 2048 },
      client,
    });

    expect(client).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('failed');
    expect(result.errors.map((error: { uid: number }) => error.uid)).toEqual([2, 1]);
    expect(result.errors[0].error).toContain('依赖条目未成功生成');
  });

  it('批量改写契约不发送次级关键词，并忽略模型返回的次级字段', async () => {
    const entry = makeEntry(1, {
      strategy: {
        keys: ['旧关键词'],
        keys_secondary: { logic: 'not_any', keys: ['必须保留'] },
      },
    });
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: [entry] });
    let sentPrompt = '';

    const result = await generateAiPreview({
      lorebookName: '测试世界书',
      entryUids: [1],
      instruction: '更新关键词',
      fieldOptions: { title: false, content: false, prompt: true },
      client: vi.fn(async prompt => {
        sentPrompt = prompt;
        return JSON.stringify({
          entries: [{
            uid: 1,
            prompts: {
              primary: ['新关键词'],
              secondary_logic: 'and_all',
              secondary: ['模型越权修改'],
            },
          }],
        });
      }),
    });

    expect(sentPrompt).not.toMatch(/次级关键词|secondary_logic|secondary/);
    expect(result.items[0].afterEntry.strategy).toEqual({
      keys: ['新关键词'],
      keys_secondary: { logic: 'not_any', keys: ['必须保留'] },
    });
    expect(result.items[0].diffs).toEqual([
      expect.objectContaining({ label: '关键词', before: ['旧关键词'], after: ['新关键词'] }),
    ]);
  });

  it('快速改写契约同样只处理主关键词', async () => {
    const entry = makeEntry(1, {
      strategy: {
        keys: ['旧关键词'],
        keys_secondary: { logic: 'and_all', keys: ['保留次级'] },
      },
    });
    apiMocks.getWorldbookSafe.mockResolvedValue({ success: true, data: [entry] });
    let sentPrompt = '';

    const result = await generateQuickAiPreview({
      lorebookName: '测试世界书',
      entryUids: [1],
      instruction: '更新关键词',
      fieldOptions: { title: false, content: false, prompt: true },
      client: vi.fn(async prompt => {
        sentPrompt = prompt;
        return JSON.stringify({
          prompts: {
            primary: ['快速新关键词'],
            secondary_logic: 'not_all',
            secondary: ['不应写入'],
          },
        });
      }),
    });

    expect(sentPrompt).not.toMatch(/secondary_logic|secondary/);
    expect(result.items[0].afterEntry.strategy).toEqual({
      keys: ['快速新关键词'],
      keys_secondary: { logic: 'and_all', keys: ['保留次级'] },
    });
    expect(result.items[0].diffs).toEqual([
      expect.objectContaining({ label: '关键词' }),
    ]);
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

  it('跳过 accepted:false 的软排除项，并支持 uids 子集过滤', async () => {
    const entry1 = makeEntry(1);
    const entry2 = makeEntry(2);
    const entry3 = makeEntry(3);
    let writtenEntries: Entry[] = [];

    apiMocks.updateWorldbookEntries.mockImplementation(async (_name, mutator) => {
      const currentEntries = [entry1, entry2, entry3].map(entry => _.cloneDeep(entry));
      writtenEntries = mutator(currentEntries);
      return { success: true, changed: !_.isEqual(currentEntries, writtenEntries) };
    });

    const buildItem = (source: Entry, overrides: Record<string, unknown> = {}) => ({
      uid: source.uid,
      title: source.name,
      changed: true,
      beforeEntry: _.cloneDeep(source),
      afterEntry: { ..._.cloneDeep(source), name: `新标题-${source.uid}` },
      editableFields: { title: true, content: false, prompt: false },
      ...overrides,
    });

    const result = await applyAiPreview({
      lorebookName: '测试世界书',
      previewItems: [buildItem(entry1), buildItem(entry2, { accepted: false }), buildItem(entry3)],
      uids: [1, 2],
    });

    expect(result.appliedUids).toEqual([1]);
    expect(result.skipped).toEqual([]);
    expect(writtenEntries.find(entry => entry.uid === 1)?.name).toBe('新标题-1');
    expect(writtenEntries.find(entry => entry.uid === 2)).toEqual(entry2);
    expect(writtenEntries.find(entry => entry.uid === 3)).toEqual(entry3);
  });

  it('应用关键词修改时保留当前条目的次级关键词配置', async () => {
    const original = makeEntry(1, {
      strategy: {
        keys: ['旧关键词'],
        keys_secondary: { logic: 'not_any', keys: ['保留次级'] },
      },
    });
    let writtenEntries: Entry[] = [];
    apiMocks.updateWorldbookEntries.mockImplementation(async (_name, mutator) => {
      const currentEntries = [_.cloneDeep(original)];
      writtenEntries = mutator(currentEntries);
      return { success: true, changed: !_.isEqual(currentEntries, writtenEntries) };
    });

    const afterEntry = _.cloneDeep(original);
    afterEntry.strategy.keys = ['新关键词'];
    afterEntry.strategy.keys_secondary = { logic: 'and_all', keys: ['模型越权修改'] };
    const result = await applyAiPreview({
      lorebookName: '测试世界书',
      previewItems: [{
        uid: 1,
        title: original.name,
        changed: true,
        beforeEntry: _.cloneDeep(original),
        afterEntry,
        editableFields: { title: false, content: false, prompt: true },
      }],
    });

    expect(result.appliedUids).toEqual([1]);
    expect(writtenEntries[0].strategy).toEqual({
      keys: ['新关键词'],
      keys_secondary: { logic: 'not_any', keys: ['保留次级'] },
    });
  });
});
