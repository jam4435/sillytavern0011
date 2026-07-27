import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWorldbookSafe: vi.fn(),
  createLorebookEntries: vi.fn(),
}));

vi.mock('../api.js', () => ({
  getWorldbookSafe: mocks.getWorldbookSafe,
  createLorebookEntries: mocks.createLorebookEntries,
}));

vi.mock('../utils.js', () => ({
  errorCatched: fn => fn,
}));

import { buildBulkImportEntries, importWorldbookYaml } from './bulkImport.js';

const yamlText = `---
trigger:
  Title: 新条目
  type: Normal
  Comma_separated_list: 新条目,别名
  position: After Character Definition
  depth: 0
  order: 120
content: |-
  这是新条目的完整正文。
enabled: true
probability: 100`;

describe('批量 YAML 导入', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('按完整世界书最大 UID 分配，并包含递归安全默认值', () => {
    const entries = buildBulkImportEntries(yamlText, [{ uid: 2 }, { uid: '19' }]);

    expect(entries[0]).toMatchObject({
      uid: 20,
      name: '新条目',
      recursion: {
        prevent_incoming: false,
        prevent_outgoing: false,
        delay_until: null,
      },
      strategy: {
        keys_secondary: { logic: 'and_any', keys: [] },
        scan_depth: 'same_as_global',
      },
    });
  });

  it('写入时显式开启历史事务', async () => {
    mocks.getWorldbookSafe.mockResolvedValue({ success: true, data: [{ uid: 4 }] });
    mocks.createLorebookEntries.mockResolvedValue({ success: true });

    const result = await importWorldbookYaml('测试世界书', yamlText);

    expect(result.entryUids).toEqual([5]);
    expect(mocks.createLorebookEntries).toHaveBeenCalledWith(
      '测试世界书',
      expect.any(Array),
      expect.objectContaining({
        trackHistory: true,
        transactionType: 'bulk-import',
        transactionMeta: { importedCount: 1 },
      }),
    );
  });

  it('解析失败时不产生任何写入', async () => {
    mocks.getWorldbookSafe.mockResolvedValue({ success: true, data: [] });

    await expect(importWorldbookYaml('测试世界书', 'not: valid-protocol')).rejects.toThrow();
    expect(mocks.createLorebookEntries).not.toHaveBeenCalled();
  });
});
