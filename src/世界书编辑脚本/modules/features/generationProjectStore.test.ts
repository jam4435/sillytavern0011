import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveGenerationProject,
  clearGenerationProjectStore,
  duplicateGenerationProject,
  exportGenerationProject,
  getGenerationProject,
  getGenerationProjectStoreStatus,
  importGenerationProject,
  listGenerationProjectRevisions,
  listGenerationProjects,
  saveGenerationProject,
} from './generationProjectStore.js';
import { createGenerationProject } from './worldbookGenerationProject.js';

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await clearGenerationProjectStore({ indexedDB: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('世界书生成项目存储降级', () => {
  it('IndexedDB 不可用时保留内存项目并暴露未保存状态', async () => {
    const project = createGenerationProject({ name: '内存项目' });
    await saveGenerationProject(project, { indexedDB: null });

    expect((await getGenerationProject(project.id, { indexedDB: null }))?.name).toBe('内存项目');
    expect(await listGenerationProjects({ indexedDB: null })).toHaveLength(1);
    expect(getGenerationProjectStoreStatus()).toMatchObject({ saved: false, memoryProjectCount: 1 });
  });

  it('运行中的任务在读取时恢复为 interrupted', async () => {
    const project = createGenerationProject({
      name: '中断恢复',
      jobs: [{ jobId: 'job-1', type: 'entry', status: 'running', attempts: 1 }],
    });
    await saveGenerationProject(project, { indexedDB: null });

    const restored = await getGenerationProject(project.id, { indexedDB: null });
    expect(restored?.jobs[0].status).toBe('interrupted');
  });

  it('支持复制、归档以及 JSON 导入导出', async () => {
    const project = createGenerationProject({ name: '原项目' });
    await saveGenerationProject(project, { indexedDB: null });
    const duplicate = await duplicateGenerationProject(project, { name: '副本' }, { indexedDB: null });
    await archiveGenerationProject(project.id, true, { indexedDB: null });

    expect((await listGenerationProjects({ includeArchived: false, indexedDB: null })).map(item => item.id)).toEqual([
      duplicate.id,
    ]);
    const exported = await exportGenerationProject(duplicate, { indexedDB: null });
    const imported = await importGenerationProject(exported, { indexedDB: null });
    expect(imported.id).not.toBe(duplicate.id);
    expect(imported.name).toContain('导入');
  });

  it('每项目只保留最近 100 个修订记录', async () => {
    const project = createGenerationProject({ name: '修订裁剪' });
    for (let revision = 1; revision <= 105; revision += 1) {
      project.revision = revision;
      await saveGenerationProject(project, {
        indexedDB: null,
        revisionRecord: {
          projectId: project.id,
          revision,
          baseRevision: revision - 1,
          kind: 'apply',
          forwardOperations: [],
          inverseOperations: [],
        },
      });
    }

    const revisions = await listGenerationProjectRevisions(project.id, { indexedDB: null });
    expect(revisions).toHaveLength(100);
    expect(revisions[0].revision).toBe(6);
    expect(revisions.at(-1)?.revision).toBe(105);
  });
});
