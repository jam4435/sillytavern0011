import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyGenerationProposal,
  createGenerationProject,
  redoGenerationProject,
  rejectGenerationProposal,
  setGenerationPendingProposal,
  undoGenerationProject,
} from './worldbookGenerationProject.js';
import { normalizeGenerationProject } from './worldbookGenerationSchema.js';
import {
  clearGenerationProjectStore,
  createStoredGenerationProject,
  exportGenerationProject,
  getGenerationProject,
  importGenerationProject,
  listGenerationProjectRevisions,
  listGenerationProjects,
  saveGenerationProject,
} from './generationProjectStore.js';

const unavailableIndexedDb = {
  open() {
    throw new Error('unavailable for test');
  },
};

describe('世界书生成项目纯逻辑', () => {
  it('规范化蓝图别名和项目默认字段', () => {
    const project = createGenerationProject({
      name: '北境项目',
      goal: '建立北境世界书',
      scalePreference: 'large',
      blueprint: {
        scale: 'large',
        nodes: [
          {
            nodeId: 'north',
            title: '北境',
            triggerType: 'constant',
            keys: ['北境', '北境'],
            dependsOnNodeIds: ['world'],
            xml: { boundary: 'open', groupId: 'north-group', tag: 'north' },
          },
        ],
      },
    });

    expect(project).toMatchObject({
      name: '北境项目',
      goal: '建立北境世界书',
      scalePreference: 'large',
      revision: 0,
      stage: 'prepare',
      blueprint: {
        scale: 'large',
        nodes: [
          {
            entryId: 'north',
            nodeId: 'north',
            triggerType: 'Constant',
            keywords: ['北境'],
            dependsOnEntryIds: ['world'],
          },
        ],
      },
    });
  });

  it('接受提案后记录正反操作，支持撤销和重做', () => {
    const original = createGenerationProject({
      entryDrafts: [{ entryId: 'E001', title: '旧标题', content: '旧内容' }],
    });
    const applied = applyGenerationProposal(original, {
      baseRevision: 0,
      summary: '更新第一条',
      operations: [{ type: 'updateEntry', entryId: 'E001', patch: { title: '新标题', content: '新内容' } }],
    });

    expect(applied.revision).toBe(1);
    expect(applied.entryDrafts[0]).toMatchObject({ title: '新标题', content: '新内容' });
    expect(applied.revisionHistory.undo).toHaveLength(1);

    const undone = undoGenerationProject(applied);
    expect(undone.revision).toBe(2);
    expect(undone.entryDrafts[0]).toMatchObject({ title: '旧标题', content: '旧内容' });

    const redone = redoGenerationProject(undone);
    expect(redone.revision).toBe(3);
    expect(redone.entryDrafts[0]).toMatchObject({ title: '新标题', content: '新内容' });
  });

  it('结构修改只把影响范围、祖先和同 XML 组标记为过期', () => {
    const project = createGenerationProject({
      blueprint: {
        scale: 'large',
        nodes: [
          { entryId: 'root', title: '根', role: 'root' },
          { entryId: 'open', parentId: 'root', title: '开', xml: { groupId: 'g', boundary: 'open' } },
          { entryId: 'body', parentId: 'open', title: '正文', xml: { groupId: 'g', boundary: 'body' } },
          { entryId: 'other', title: '其他' },
        ],
      },
      entryDrafts: [
        { entryId: 'root', content: 'root' },
        { entryId: 'open', content: 'open' },
        { entryId: 'body', content: 'body' },
        { entryId: 'other', content: 'other' },
      ],
    });
    const applied = applyGenerationProposal(project, {
      baseRevision: 0,
      affectedIds: ['body'],
      operations: [{ type: 'updateNode', nodeId: 'body', patch: { contentBrief: '重写' } }],
    });
    const byId = Object.fromEntries(applied.entryDrafts.map(entry => [entry.entryId, entry]));

    expect(byId.root.stale).toBe(true);
    expect(byId.open.stale).toBe(true);
    expect(byId.body.stale).toBe(true);
    expect(byId.other.stale).toBe(false);
    expect(undoGenerationProject(applied).entryDrafts.every(entry => entry.stale === false)).toBe(true);
  });

  it('拒绝过期或存在未解决冲突的提案，并允许显式拒绝当前提案', () => {
    const project = createGenerationProject();
    expect(() =>
      applyGenerationProposal(project, { baseRevision: 2, operations: [] }),
    ).toThrow(/当前项目已是修订/);
    expect(() =>
      applyGenerationProposal(project, { baseRevision: 0, operations: [], conflicts: [{ sourceId: 'S1' }] }),
    ).toThrow(/未解决/);

    const pending = setGenerationPendingProposal(project, { baseRevision: 0, operations: [] });
    expect(pending.pendingProposal).not.toBeNull();
    expect(rejectGenerationProposal(pending).pendingProposal).toBeNull();
  });

  it('刷新恢复时只将 running 任务转为 interrupted', () => {
    const recovered = normalizeGenerationProject(
      {
        jobs: [
          { jobId: 'running', status: 'running' },
          { jobId: 'complete', status: 'complete' },
        ],
      },
      { recoverRunningJobs: true },
    );
    expect(recovered.jobs.map(job => job.status)).toEqual(['interrupted', 'complete']);
  });
});

describe('世界书生成项目存储降级', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await clearGenerationProjectStore({ indexedDB: unavailableIndexedDb }).catch(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('IndexedDB 不可用时仍在内存中支持多个项目和导入导出', async () => {
    const first = await createStoredGenerationProject(
      { name: '项目一', jobs: [{ jobId: 'j1', status: 'running' }] },
      { indexedDB: unavailableIndexedDb },
    );
    await createStoredGenerationProject({ name: '项目二' }, { indexedDB: unavailableIndexedDb });

    const listed = await listGenerationProjects({ indexedDB: unavailableIndexedDb });
    expect(listed.map(project => project.name)).toEqual(expect.arrayContaining(['项目一', '项目二']));
    expect((await getGenerationProject(first.id, { indexedDB: unavailableIndexedDb }))?.jobs[0].status).toBe(
      'interrupted',
    );

    const exported = await exportGenerationProject(first.id, { indexedDB: unavailableIndexedDb });
    const imported = await importGenerationProject(exported, { indexedDB: unavailableIndexedDb });
    expect(imported.id).not.toBe(first.id);
    expect(imported.name).toContain('导入');
  });

  it('保存接受结果时记录最近修订', async () => {
    let project = createGenerationProject({
      name: '修订项目',
      entryDrafts: [{ entryId: 'E1', title: '一' }],
    });
    project = applyGenerationProposal(project, {
      baseRevision: 0,
      operations: [{ type: 'updateEntry', entryId: 'E1', patch: { title: '二' } }],
    });
    await saveGenerationProject(project, { indexedDB: unavailableIndexedDb });

    const revisions = await listGenerationProjectRevisions(project.id, { indexedDB: unavailableIndexedDb });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ projectId: project.id, revision: 1, kind: 'apply' });
  });
});
