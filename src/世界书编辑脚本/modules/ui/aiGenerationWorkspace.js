import {
  createGenerationProject,
  normalizeGenerationProject,
} from '../features/worldbookGenerationSchema.js';
import {
  applyGenerationProposal,
  getLastGenerationRevisionRecord,
  rejectGenerationProposal,
  redoGenerationProject,
  undoGenerationProject,
} from '../features/worldbookGenerationProject.js';
import {
  archiveGenerationProject,
  createStoredGenerationProject,
  deleteGenerationProject,
  duplicateGenerationProject,
  exportGenerationProject,
  getGenerationProject,
  getGenerationProjectStoreStatus,
  importGenerationProject,
  listGenerationProjects,
  saveGenerationProject,
} from '../features/generationProjectStore.js';
import {
  buildGenerationCallPlan,
  cancelGenerationOperation,
  generateWorldbookBlueprint,
  generateWorldbookEntries,
  runGenerationConversation,
} from '../features/worldbookGenerationOrchestrator.js';
import {
  applyGenerationProjectToTarget,
  bindCreatedWorldbook,
  rollbackCreatedWorldbook,
} from '../features/worldbookGenerationApply.js';
import { auditGeneratedEntries, auditGenerationBlueprint } from '../features/worldbookGenerationAudit.js';
import { serializeWorldbookYaml } from '../features/worldbookYaml.js';
import { getAiWorkspaceSettings, setAiWorkspaceSettings } from '../settings.js';
import { openFilePickerAndRead, triggerDownload } from '../utils.js';

const ROOT_ID = 'ai-generation-workspace';
const STYLE_ID = 'ai-generation-workspace-styles';
const DEFAULT_VIEW = 'sources';

const state = {
  initialized: false,
  loading: false,
  busy: false,
  operationId: null,
  projects: [],
  project: null,
  view: DEFAULT_VIEW,
  status: '',
  error: '',
  worldbookNames: [],
  renderTarget: null,
  activeEntryId: '',
};

const parentDoc = () => window.parent.document;
const $root = () => $(`#${ROOT_ID}`, parentDoc());

function escape(value) {
  return _.escape(`${value ?? ''}`);
}

function clone(value) {
  return _.cloneDeep(value);
}

function unwrapProject(result, fallback = null) {
  const candidate = result?.project || (result?.id && result?.schemaVersion ? result : null);
  if (!candidate) return fallback;
  const normalized = normalizeGenerationProject(candidate);
  const revisionRecord = getLastGenerationRevisionRecord(candidate);
  if (revisionRecord) {
    Object.defineProperty(normalized, '__lastRevisionRecord', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: revisionRecord,
    });
  }
  return normalized;
}

function activeProjectId() {
  return getAiWorkspaceSettings().activeGenerationProjectId || '';
}

function setActiveProjectId(projectId) {
  const settings = getAiWorkspaceSettings();
  setAiWorkspaceSettings({
    ...settings,
    activeMode: 'generate',
    activeGenerationProjectId: projectId || '',
  });
}

function setStatus(message, { error = false } = {}) {
  state.status = error ? '' : message || '';
  state.error = error ? message || '' : '';
  $('#ai-generation-status', parentDoc())
    .text(state.error || state.status)
    .attr('data-tone', state.error ? 'danger' : state.status ? 'active' : 'idle');
}

function currentProjectName() {
  return state.project?.name || '未命名世界书生成项目';
}

async function persistProject(project, { rerender = true } = {}) {
  if (!project) return null;
  const revisionRecord = getLastGenerationRevisionRecord(project);
  const normalized = normalizeGenerationProject({
    ...project,
    updatedAt: new Date().toISOString(),
  });
  try {
    state.project = await saveGenerationProject(normalized, { revisionRecord });
    state.project = unwrapProject(state.project, normalized);
    state.projects = await listGenerationProjects({ includeArchived: true });
    setActiveProjectId(state.project.id);
    const storageStatus = getGenerationProjectStoreStatus();
    setStatus(
      storageStatus.saved
        ? '项目已保存。'
        : `项目仅保存在内存中：${storageStatus.error?.message || '请及时导出项目 JSON'}`,
      { error: !storageStatus.saved },
    );
  } catch (error) {
    state.project = normalized;
    setStatus(`项目暂未保存：${error.message || 'IndexedDB 不可用'}`, { error: true });
  }
  if (rerender) render();
  return state.project;
}

async function ensureActiveProject() {
  state.loading = true;
  try {
    state.projects = await listGenerationProjects({ includeArchived: true });
    const preferredId = activeProjectId();
    const preferred = preferredId ? await getGenerationProject(preferredId) : null;
    if (preferred) {
      state.project = normalizeGenerationProject(preferred, { recoverRunningJobs: true });
    } else {
      const first = state.projects.find(project => !project.archived);
      if (first) {
        state.project = normalizeGenerationProject(
          (await getGenerationProject(first.id)) || first,
          { recoverRunningJobs: true },
        );
      } else {
        const created = await createStoredGenerationProject(
          createGenerationProject({ name: '我的世界书生成项目' }),
        );
        state.project = unwrapProject(created, createGenerationProject({ name: '我的世界书生成项目' }));
        state.projects = await listGenerationProjects({ includeArchived: true });
      }
    }
    if (state.project) setActiveProjectId(state.project.id);
  } catch (error) {
    state.project = createGenerationProject({ name: '未保存的生成项目' });
    state.projects = [state.project];
    state.error = `项目存储不可用，当前改为内存工作：${error.message || '未知错误'}`;
  } finally {
    state.loading = false;
  }
}

function stageIndex(stage) {
  return {
    prepare: 0,
    'blueprint-review': 1,
    'entry-review': 2,
    complete: 3,
  }[stage] ?? 0;
}

function buildProjectOptions() {
  const visible = state.projects.filter(project => !project.archived || project.id === state.project?.id);
  return visible
    .map(
      project =>
        `<option value="${escape(project.id)}" ${project.id === state.project?.id ? 'selected' : ''}>${escape(
          project.name,
        )}${project.archived ? '（已归档）' : ''}</option>`,
    )
    .join('');
}

function buildProgress() {
  const current = stageIndex(state.project?.stage);
  const steps = [
    ['prepare', '资料准备'],
    ['blueprint-review', '结构审阅'],
    ['entry-review', '条目审阅'],
    ['complete', '完成'],
  ];
  return `
    <ol class="gen-progress" aria-label="生成进度">
      ${steps
        .map(
          ([key, label], index) => `
        <li class="${index === current ? 'is-active' : ''} ${index < current ? 'is-complete' : ''}">
          <button type="button" data-generation-view="${key === 'prepare' ? 'sources' : key === 'blueprint-review' ? 'blueprint' : key === 'entry-review' ? 'entries' : 'audit'}">
            <span>${index < current ? '<i class="fa-solid fa-check"></i>' : index + 1}</span>${label}
          </button>
        </li>`,
        )
        .join('')}
    </ol>
  `;
}

function buildProjectToolbar() {
  return `
    <div class="gen-project-bar">
      <div class="gen-project-picker">
        <span class="gen-eyebrow">生成项目</span>
        <select id="ai-generation-project-select" aria-label="选择生成项目">${buildProjectOptions()}</select>
      </div>
      <div class="gen-project-actions">
        <button type="button" data-generation-action="new-project"><i class="fa-solid fa-plus"></i>新建</button>
        <button type="button" data-generation-action="rename-project"><i class="fa-solid fa-pen"></i>重命名</button>
        <button type="button" data-generation-action="duplicate-project"><i class="fa-regular fa-copy"></i>复制</button>
        <button type="button" data-generation-action="export-project"><i class="fa-solid fa-box-archive"></i>项目存档</button>
        <button type="button" data-generation-action="import-project"><i class="fa-solid fa-box-open"></i>载入存档</button>
        <button type="button" data-generation-action="archive-project"><i class="fa-solid fa-box"></i>${state.project?.archived ? '取消归档' : '归档'}</button>
        <button type="button" data-generation-action="delete-project" class="is-danger"><i class="fa-regular fa-trash-can"></i></button>
      </div>
    </div>
  `;
}

function buildSourceView(project) {
  const targetType = project.target?.type || 'export';
  const sources = Array.isArray(project.sources) ? project.sources : [];
  const scale = project.scalePreference || 'auto';
  return `
    <div class="gen-canvas-grid">
      <section class="gen-sheet gen-brief-sheet">
        <header>
          <span class="gen-sheet-index">01</span>
          <div><span class="gen-eyebrow">项目简报</span><h2>定义这本世界书要解决什么</h2></div>
        </header>
        <label class="gen-field">
          <span>项目名称</span>
          <input id="ai-generation-project-name" value="${escape(project.name)}">
        </label>
        <label class="gen-field">
          <span>总体目标与不可违背的设定</span>
          <textarea id="ai-generation-goal" placeholder="描述题材、基调、核心法则、重点领域，以及不能被 AI 擅自改变的事实。">${escape(project.goal || '')}</textarea>
        </label>
        <div class="gen-field-row">
          <label class="gen-field">
            <span>架构规模</span>
            <select id="ai-generation-scale">
              ${[
                ['auto', '自动判断'],
                ['small', '小型 · 平铺'],
                ['medium', '中型 · 单一总分'],
                ['large', '大型 · 多领域总分'],
              ]
                .map(([value, label]) => `<option value="${value}" ${scale === value ? 'selected' : ''}>${label}</option>`)
                .join('')}
            </select>
          </label>
          <label class="gen-field">
            <span>最终目标</span>
            <select id="ai-generation-target-type">
              <option value="export" ${targetType === 'export' ? 'selected' : ''}>仅生成与导出</option>
              <option value="append" ${targetType === 'append' ? 'selected' : ''}>追加到已有世界书</option>
              <option value="create" ${targetType === 'create' ? 'selected' : ''}>创建新世界书</option>
            </select>
          </label>
        </div>
        <div class="gen-field-row">
          <label class="gen-field ${targetType === 'append' ? '' : 'is-hidden'}" data-target-field="append">
            <span>已有世界书</span>
            <select id="ai-generation-target-existing">
              <option value="">请选择</option>
              ${state.worldbookNames
                .map(
                  name =>
                    `<option value="${escape(name)}" ${project.target?.lorebookName === name ? 'selected' : ''}>${escape(
                      name,
                    )}</option>`,
                )
                .join('')}
            </select>
          </label>
          <label class="gen-field ${targetType === 'create' ? '' : 'is-hidden'}" data-target-field="create">
            <span>新世界书名称</span>
            <input id="ai-generation-target-new" value="${escape(project.target?.lorebookName || '')}" placeholder="例如：北境群星志">
          </label>
        </div>
        <div class="gen-inline-actions">
          <button type="button" data-generation-action="save-brief" class="gen-button-secondary">保存简报</button>
          <button type="button" data-generation-action="plan-calls" class="gen-button-secondary">查看调用计划</button>
          <button type="button" data-generation-action="generate-blueprint" class="gen-button-primary">
            <span>生成结构蓝图</span><i class="fa-solid fa-arrow-right-long"></i>
          </button>
        </div>
      </section>

      <section class="gen-sheet gen-source-sheet">
        <header>
          <span class="gen-sheet-index">02</span>
          <div><span class="gen-eyebrow">资料库</span><h2>给事实标出它真正影响的范围</h2></div>
        </header>
        <div class="gen-source-list">
          ${
            sources.length
              ? sources
                  .map(
                    source => `
              <article class="gen-source-card" data-source-id="${escape(source.sourceId)}">
                <div><strong>${escape(source.title || '未命名资料')}</strong><span>${escape(
                  source.scope?.type === 'global' ? '全书' : source.scope?.type === 'branch' ? '分支' : '条目',
                )} · v${Number(source.version || 1)}</span></div>
                <p>${escape(`${source.content || ''}`.replace(/\s+/g, ' ').slice(0, 160))}</p>
                <button type="button" data-generation-action="remove-source" data-source-id="${escape(
                  source.sourceId,
                )}" aria-label="删除资料"><i class="fa-solid fa-xmark"></i></button>
              </article>`,
                  )
                  .join('')
              : '<div class="gen-empty-state"><i class="fa-regular fa-folder-open"></i><p>尚无资料。先放入总设定，之后仍可在对话里给具体分支追加材料。</p></div>'
          }
        </div>
        <details class="gen-source-composer" open>
          <summary>添加一份资料</summary>
          <label class="gen-field"><span>标题</span><input id="ai-generation-source-title" placeholder="例如：北境监察院详细资料"></label>
          <label class="gen-field"><span>内容</span><textarea id="ai-generation-source-content" placeholder="粘贴资料原文。资料本身是事实来源，AI 不会把它当成普通聊天消息。"></textarea></label>
          <div class="gen-field-row">
            <label class="gen-field"><span>作用域</span>
              <select id="ai-generation-source-scope">
                <option value="global">全书</option>
                <option value="branch">当前分支</option>
                <option value="entries">选中条目</option>
              </select>
            </label>
            <div class="gen-inline-actions">
              <button type="button" data-generation-action="add-source" class="gen-button-primary">收入资料库</button>
            </div>
          </div>
        </details>
      </section>
    </div>
  `;
}

function nodeDepth(node, nodeMap) {
  let depth = 0;
  let current = node;
  const visited = new Set();
  while (current?.parentId && nodeMap.has(current.parentId) && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    current = nodeMap.get(current.parentId);
    depth += 1;
  }
  return Math.min(depth, 5);
}

function proposedBlueprint(project) {
  const operation = project.pendingProposal?.operations?.find(item => item?.type === 'replaceBlueprint');
  return operation?.blueprint || project.blueprint;
}

function proposedEntryDrafts(project) {
  const operation = project.pendingProposal?.operations?.find(item => item?.type === 'replaceEntryDrafts');
  return operation?.entries || project.entryDrafts || [];
}

function acceptedEntryIds(project, entries = proposedEntryDrafts(project)) {
  const available = entries.map((entry, index) => entry.entryId || entry.nodeId || `draft-${index}`);
  const saved = project.target?.acceptedEntryIds;
  return new Set(Array.isArray(saved) ? saved.filter(id => available.includes(id)) : available);
}

function acceptedEntryDrafts(project) {
  const entries = proposedEntryDrafts(project);
  const accepted = acceptedEntryIds(project, entries);
  return entries.filter((entry, index) => accepted.has(entry.entryId || entry.nodeId || `draft-${index}`));
}

function entryId(entry, index = 0) {
  return entry?.entryId || entry?.nodeId || `draft-${index}`;
}

function entryGroupId(project, entry) {
  const direct = entry?.groupId || entry?.xml?.groupId;
  if (direct) return direct;
  const id = entry?.nodeId || entry?.entryId;
  const node = project.blueprint?.nodes?.find(item => (item.nodeId || item.entryId) === id);
  return node?.xml?.groupId || '';
}

function groupedEntryIds(project, entries, selectedId) {
  const selectedIndex = entries.findIndex((entry, index) => entryId(entry, index) === selectedId);
  if (selectedIndex < 0) return [selectedId];
  const groupId = entryGroupId(project, entries[selectedIndex]);
  if (!groupId) return [selectedId];
  return entries
    .map((entry, index) => ({ id: entryId(entry, index), groupId: entryGroupId(project, entry) }))
    .filter(item => item.groupId === groupId)
    .map(item => item.id);
}

function unresolvedProposalConflicts(proposal) {
  return (proposal?.conflicts || []).filter(conflict => conflict?.resolved !== true);
}

function buildProposalConflicts(proposal) {
  const conflicts = unresolvedProposalConflicts(proposal);
  if (!conflicts.length) return '';
  return `
    <div class="gen-conflict-stack" role="alert">
      <strong><i class="fa-solid fa-code-compare"></i> 资料冲突阻止接受提案</strong>
      ${conflicts
        .map(
          conflict => `<article><span>${escape(conflict.message || conflict.summary || '两份资料对同一事实给出了不同定义。')}</span><small>${escape(
            (conflict.sourceIds || [conflict.sourceId]).filter(Boolean).join(' ↔ ') || '请在对话中明确采用哪一项',
          )}</small></article>`,
        )
        .join('')}
    </div>
  `;
}

function buildBlueprintView(project) {
  const blueprint = proposedBlueprint(project);
  const nodes = blueprint?.nodes || [];
  const nodeMap = new Map(nodes.map(node => [node.nodeId || node.entryId, node]));
  const proposal = project.pendingProposal;
  return `
    <section class="gen-sheet gen-blueprint-sheet">
      <header>
        <span class="gen-sheet-index">结构</span>
        <div><span class="gen-eyebrow">${escape(blueprint?.scale || '未判断')} architecture</span><h2>内容树、触发图与 XML 区间</h2></div>
        <div class="gen-header-actions">
          <button type="button" data-generation-action="undo" ${project.revision <= 0 ? 'disabled' : ''}><i class="fa-solid fa-rotate-left"></i></button>
          <button type="button" data-generation-action="redo"><i class="fa-solid fa-rotate-right"></i></button>
        </div>
      </header>
      ${
        proposal
          ? `<aside class="gen-proposal-banner">
              <div><span class="gen-eyebrow">待确认提案 · r${proposal.baseRevision}</span><strong>${escape(
                proposal.summary || 'AI 已提出一组结构修改',
              )}</strong><p>${proposal.operations?.length || 0} 项操作 · ${proposal.affectedIds?.length || 0} 个受影响节点</p></div>
              <div><button type="button" data-generation-action="reject-proposal" class="gen-button-secondary">退回</button><button type="button" data-generation-action="accept-proposal" class="gen-button-primary" ${unresolvedProposalConflicts(proposal).length ? 'disabled' : ''}>接受结构蓝图</button></div>
            </aside>`
          : ''
      }
      ${buildProposalConflicts(proposal)}
      <div class="gen-blueprint-ledger">
        ${
          nodes.length
            ? nodes
                .map(node => {
                  const depth = nodeDepth(node, nodeMap);
                  const id = node.nodeId || node.entryId;
                  return `
                    <article class="gen-blueprint-row ${node.stale ? 'is-stale' : ''}" data-node-id="${escape(id)}" style="--tree-depth:${depth}">
                      <span class="gen-tree-rail"></span>
                      <button type="button" class="gen-node-main" data-generation-action="select-node" data-node-id="${escape(id)}">
                        <span class="gen-node-role">${escape(node.role)}</span>
                        <strong>${escape(node.title || '未命名节点')}</strong>
                        <small>${escape(node.contentBrief || '尚未填写内容职责')}</small>
                      </button>
                      <div class="gen-node-meta">
                        <span class="${node.triggerType === 'Constant' ? 'is-constant' : 'is-normal'}">${escape(
                          node.triggerType,
                        )}</span>
                        <span>${escape(typeof node.position === 'string' ? node.position : node.position?.type)}</span>
                        <span>order ${Number(node.order || 0)}</span>
                        ${node.xml?.groupId ? `<span>&lt;${escape(node.xml.tag || node.xml.groupId)}&gt;</span>` : ''}
                      </div>
                    </article>`;
                })
                .join('')
            : '<div class="gen-empty-state"><i class="fa-solid fa-sitemap"></i><p>还没有结构蓝图。回到资料准备页生成第一版结构。</p></div>'
        }
      </div>
      <div class="gen-command-dock">
        <button type="button" data-generation-view="sources" class="gen-button-secondary"><i class="fa-solid fa-arrow-left"></i>返回资料</button>
        <button type="button" data-generation-action="audit-blueprint" class="gen-button-secondary">重新审计</button>
        <button type="button" data-generation-action="generate-entries" class="gen-button-primary" ${
          proposal || !nodes.length ? 'disabled' : ''
        }>按蓝图生成条目<i class="fa-solid fa-arrow-right-long"></i></button>
      </div>
    </section>
  `;
}

function entryTitle(entry) {
  return entry?.name || entry?.title || entry?.trigger?.Title || entry?.entryId || '未命名条目';
}

function entryContent(entry) {
  return entry?.content || '';
}

function entryKeywords(entry) {
  if (Array.isArray(entry?.strategy?.keys)) return entry.strategy.keys;
  if (Array.isArray(entry?.keywords)) return entry.keywords;
  const csv = entry?.trigger?.Comma_separated_list;
  return typeof csv === 'string' ? csv.split(',').map(item => item.trim()).filter(Boolean) : [];
}

function buildEntriesView(project) {
  const entries = proposedEntryDrafts(project);
  const acceptedIds = acceptedEntryIds(project, entries);
  const audit = project.audit || {};
  const proposal = project.pendingProposal;
  const activeEntry =
    entries.find((entry, index) => entryId(entry, index) === state.activeEntryId)
    || entries.find((entry, index) => acceptedIds.has(entryId(entry, index)))
    || entries[0];
  const activeId = activeEntry ? entryId(activeEntry, entries.indexOf(activeEntry)) : '';
  return `
    <div class="gen-entry-review">
      <section class="gen-sheet gen-entry-ledger">
        <header>
          <span class="gen-sheet-index">条目</span>
          <div><span class="gen-eyebrow">${entries.length} drafts</span><h2>逐组审阅最终条目</h2></div>
          <div class="gen-audit-pulse ${audit.errors?.length ? 'has-errors' : ''}">
            <strong>${audit.errors?.length || 0}</strong> 错误 · <strong>${audit.warnings?.length || 0}</strong> 警告
          </div>
        </header>
        ${
          proposal
            ? `<aside class="gen-proposal-banner">
                <div><span class="gen-eyebrow">最终条目提案 · r${proposal.baseRevision}</span><strong>${escape(
                  proposal.summary || 'AI 已生成最终条目草稿',
                )}</strong><p>接受后才会成为项目真值；此时仍不会写入酒馆世界书。</p></div>
                <div><button type="button" data-generation-action="reject-proposal" class="gen-button-secondary">退回</button><button type="button" data-generation-action="accept-proposal" class="gen-button-primary" ${unresolvedProposalConflicts(proposal).length ? 'disabled' : ''}>接受最终条目</button></div>
              </aside>`
            : ''
        }
        ${buildProposalConflicts(proposal)}
        ${buildJobLedger(project)}
        <div class="gen-entry-list">
          ${
            entries.length
              ? entries
                  .map((entry, index) => {
                    const id = entryId(entry, index);
                    const selected = acceptedIds.has(id);
                    return `
                    <article class="gen-entry-card ${selected ? 'is-selected' : ''} ${activeId === id ? 'is-active' : ''}" data-entry-id="${escape(id)}">
                      <button type="button" data-generation-action="toggle-entry" data-entry-id="${escape(id)}" class="gen-entry-check" aria-pressed="${selected}">
                        <i class="fa-solid ${selected ? 'fa-check' : 'fa-minus'}"></i>
                      </button>
                      <button type="button" class="gen-entry-copy" data-generation-action="edit-entry" data-entry-id="${escape(id)}">
                        <div><span>${escape(entry.triggerType || entry.strategy?.type || 'Normal')}</span><strong>${escape(
                          entryTitle(entry),
                        )}</strong></div>
                        <p>${escape(entryContent(entry).replace(/\s+/g, ' ').slice(0, 220))}</p>
                        <small>${escape(entryKeywords(entry).join(' · ') || '无关键词')}</small>
                      </button>
                    </article>`;
                  })
                  .join('')
              : '<div class="gen-empty-state"><i class="fa-regular fa-file-lines"></i><p>结构蓝图已经就位，但还没有生成条目正文。</p></div>'
          }
        </div>
      </section>
      <aside class="gen-sheet gen-audit-sheet">
        <header><span class="gen-sheet-index">审</span><div><span class="gen-eyebrow">条目细节与强制审计</span><h2>导入闸门</h2></div></header>
        ${
          activeEntry
            ? `<div class="gen-entry-editor">
                <label class="gen-field"><span>标题</span><input id="ai-generation-entry-title" value="${escape(entryTitle(activeEntry))}" ${proposal ? 'disabled' : ''}></label>
                <label class="gen-field"><span>主关键词（逗号分隔）</span><input id="ai-generation-entry-keywords" value="${escape(entryKeywords(activeEntry).join(', '))}" ${proposal ? 'disabled' : ''}></label>
                <label class="gen-field"><span>正文</span><textarea id="ai-generation-entry-content" ${proposal ? 'disabled' : ''}>${escape(entryContent(activeEntry))}</textarea></label>
                <button type="button" data-generation-action="save-entry-edit" data-entry-id="${escape(activeId)}" class="gen-button-secondary" ${proposal ? 'disabled' : ''}>保存人工修订</button>
                ${proposal ? '<small>请先接受或退回 AI 提案，再进行人工编辑。</small>' : ''}
              </div>`
            : ''
        }
        ${buildAuditSummary(project)}
        <div class="gen-stack-actions">
          <button type="button" data-generation-action="audit-entries" class="gen-button-secondary">重新审计</button>
          <button type="button" data-generation-action="copy-yaml" class="gen-button-secondary">复制 YAML</button>
          <button type="button" data-generation-action="download-yaml" class="gen-button-secondary">下载 YAML</button>
          <button type="button" data-generation-action="apply-target" class="gen-button-primary" ${
            !entries.length || audit.errors?.length || proposal ? 'disabled' : ''
          }>${project.target?.type === 'export' ? '确认最终条目' : project.target?.type === 'create' ? '创建世界书' : '追加到世界书'}</button>
        </div>
      </aside>
    </div>
  `;
}

function buildJobLedger(project) {
  const jobs = (project.jobs || []).filter(job => job.type === 'entry-batch');
  if (!jobs.length) return '';
  const statusLabels = {
    pending: '等待',
    running: '运行中',
    complete: '完成',
    failed: '失败',
    skipped: '依赖跳过',
    cancelled: '已停止',
    interrupted: '刷新中断',
  };
  const retryable = new Set(['failed', 'skipped', 'cancelled', 'interrupted']);
  return `
    <div class="gen-job-ledger" aria-label="生成批次">
      ${jobs
        .map(
          job => `<article class="is-${escape(job.status)}">
            <span><strong>${escape(job.batchKey || job.id || job.jobId)}</strong><small>${escape(
              `${job.scopeIds?.length || 0} 个节点 · ${statusLabels[job.status] || job.status}`,
            )}</small></span>
            ${
              retryable.has(job.status)
                ? `<button type="button" data-generation-action="retry-job" data-job-id="${escape(job.id || job.jobId)}">重试此组</button>`
                : ''
            }
          </article>`,
        )
        .join('')}
    </div>
  `;
}

function issueText(issue) {
  return issue?.message || issue?.summary || issue?.code || `${issue}`;
}

function buildAuditSummary(project) {
  const audit = project.audit || {};
  const errors = audit.errors || [];
  const warnings = audit.warnings || [];
  if (!errors.length && !warnings.length) {
    return '<div class="gen-audit-clear"><i class="fa-solid fa-shield-heart"></i><strong>尚无阻断问题</strong><p>每次结构或条目变化后都会重新执行确定性审计。</p></div>';
  }
  return `
    <div class="gen-issue-stack">
      ${errors.map(issue => `<article class="is-error"><i class="fa-solid fa-circle-xmark"></i><span>${escape(issueText(issue))}</span></article>`).join('')}
      ${warnings.map(issue => `<article class="is-warning"><i class="fa-solid fa-triangle-exclamation"></i><span>${escape(issueText(issue))}</span></article>`).join('')}
    </div>
  `;
}

function buildAuditView(project) {
  const result = project.lastApplyResult || {};
  return `
    <section class="gen-sheet gen-finish-sheet">
      <div class="gen-finish-mark"><i class="fa-solid ${project.stage === 'complete' ? 'fa-check' : 'fa-shield-halved'}"></i></div>
      <span class="gen-eyebrow">${project.stage === 'complete' ? 'project delivered' : 'audit desk'}</span>
      <h2>${project.stage === 'complete' ? '这份世界书已经交付' : '全局审计与修订记录'}</h2>
      <p>${escape(result.message || (project.stage === 'complete' ? `目标：${project.target?.lorebookName || 'YAML 导出'}` : '在导入前处理所有结构性错误。'))}</p>
      ${buildAuditSummary(project)}
      <div class="gen-inline-actions">
        <button type="button" data-generation-view="entries" class="gen-button-secondary">返回条目</button>
        ${result.created ? '<button type="button" data-generation-action="rollback-created" class="gen-button-secondary is-danger">撤销新建世界书</button>' : ''}
      </div>
      ${
        result.created
          ? `<div class="gen-binding-panel">
              <span class="gen-eyebrow">创建后绑定</span>
              <div>
                <button type="button" data-generation-bind="character-additional">添加为角色附加</button>
                <button type="button" data-generation-bind="character-primary">设为角色主书</button>
                <button type="button" data-generation-bind="chat">设为聊天世界书</button>
                <button type="button" data-generation-bind="global">添加为全局世界书</button>
              </div>
            </div>`
          : ''
      }
    </section>
  `;
}

function conversationScopeOptions(project) {
  const nodes = project.blueprint?.nodes || [];
  return [
    '<option value="global">全书</option>',
    ...nodes.map(
      node =>
        `<option value="${escape(node.nodeId || node.entryId)}">${escape(node.title || node.nodeId || node.entryId)}</option>`,
    ),
  ].join('');
}

function buildConversationRail(project) {
  const messages = project.conversations || [];
  const proposal = project.pendingProposal;
  return `
    <aside class="gen-conversation">
      <header>
        <div><span class="gen-eyebrow">协作轨道</span><h2>和 AI 一起继续生长</h2></div>
        <span class="gen-revision">r${project.revision}</span>
      </header>
      <div class="gen-message-log" role="log" aria-live="polite">
        ${
          messages.length
            ? messages
                .slice(-40)
                .map(
                  message => `
              <article class="is-${message.role === 'assistant' ? 'assistant' : 'user'}">
                <span>${message.role === 'assistant' ? 'AI' : '你'} · ${escape(message.intent || '讨论')}</span>
                <p>${escape(message.content || message.message || '')}</p>
              </article>`,
                )
                .join('')
            : '<div class="gen-empty-chat">可以补充资料、扩展一个分支、重做总分结构，或只是询问为什么这样安排。</div>'
        }
      </div>
      ${
        proposal
          ? `<div class="gen-mini-proposal"><i class="fa-solid fa-code-branch"></i><span><strong>有一份待确认提案</strong>${escape(
              proposal.summary,
            )}</span></div>`
          : ''
      }
      <div class="gen-chat-controls">
        <select id="ai-generation-chat-intent" aria-label="消息意图">
          <option value="discussion">讨论</option>
          <option value="add_source">补充资料</option>
          <option value="expand_branch">扩展分支</option>
          <option value="modify_blueprint">修改结构</option>
          <option value="modify_entries">修改正文</option>
          <option value="audit">执行审计</option>
        </select>
        <select id="ai-generation-chat-scope" aria-label="作用范围">${conversationScopeOptions(project)}</select>
        <select id="ai-generation-chat-lifetime" aria-label="有效期">
          <option value="once">仅本次</option>
          <option value="project">项目规则</option>
        </select>
      </div>
      <label class="gen-chat-input">
        <textarea id="ai-generation-chat-message" placeholder="例如：不要按部门拆，改为按职能和权力层级拆分。"></textarea>
        <button type="button" data-generation-action="send-message" aria-label="发送"><i class="fa-solid fa-arrow-up"></i></button>
      </label>
    </aside>
  `;
}

function buildMainView(project) {
  if (state.view === 'blueprint') return buildBlueprintView(project);
  if (state.view === 'entries') return buildEntriesView(project);
  if (state.view === 'audit') return buildAuditView(project);
  return buildSourceView(project);
}

function render() {
  const $target = state.renderTarget;
  if (!$target?.length) return;
  ensureStyles();
  if (state.loading || !state.project) {
    $target.html(`<div id="${ROOT_ID}" class="gen-loading"><i class="fa-solid fa-compass fa-spin"></i><p>正在打开生成项目…</p></div>`);
    return;
  }
  $target.html(`
    <div id="${ROOT_ID}" data-view="${escape(state.view)}">
      ${buildProjectToolbar()}
      ${buildProgress()}
      <div class="gen-work-area">
        <main>${buildMainView(state.project)}</main>
        ${buildConversationRail(state.project)}
      </div>
      <div id="ai-generation-status" class="gen-status" data-tone="${state.error ? 'danger' : state.status ? 'active' : 'idle'}" role="status" aria-live="polite">${escape(
        state.error || state.status,
      )}</div>
      ${
        state.busy
          ? `<div class="gen-running-banner"><span><i class="fa-solid fa-wand-magic-sparkles fa-beat"></i>AI 正在整理项目</span><button type="button" data-generation-action="stop">停止</button></div>`
          : ''
      }
    </div>
  `);
  const log = $('.gen-message-log', parentDoc()).get(0);
  if (log) log.scrollTop = log.scrollHeight;
}

function ensureStyles() {
  if ($(`#${STYLE_ID}`, parentDoc()).length) return;
  $('head', parentDoc()).append(`
    <style id="${STYLE_ID}">
      #${ROOT_ID}{--gen-ink:var(--panel-text-color,#ece8df);--gen-muted:var(--ai-text-color-secondary,#aaa69f);--gen-paper:color-mix(in srgb,var(--panel-bg-color,#252525) 92%,#b6a572 8%);--gen-line:color-mix(in srgb,var(--panel-border-color,#555) 80%,#b6a572 20%);--gen-accent:var(--panel-accent-color,#9a7ace);height:100%;min-height:0;color:var(--gen-ink);display:flex;flex-direction:column;gap:10px;font-family:"Noto Serif SC","Songti SC",serif}
      #${ROOT_ID} button,#${ROOT_ID} input,#${ROOT_ID} select,#${ROOT_ID} textarea{font:inherit}
      #${ROOT_ID} button{cursor:pointer}
      #${ROOT_ID} .gen-eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:10px;color:var(--gen-muted)}
      #${ROOT_ID} .gen-project-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 12px;border:1px solid var(--gen-line);background:linear-gradient(90deg,color-mix(in srgb,var(--gen-paper) 96%,#b6a572 4%),var(--gen-paper));border-radius:10px}
      #${ROOT_ID} .gen-project-picker{display:flex;align-items:center;gap:10px;min-width:0}
      #${ROOT_ID} select,#${ROOT_ID} input,#${ROOT_ID} textarea{box-sizing:border-box;border:1px solid var(--gen-line);border-radius:7px;background:var(--search-input-bg-color,#1c1c1c);color:var(--gen-ink);padding:8px 9px}
      #${ROOT_ID} textarea{width:100%;min-height:110px;resize:vertical;line-height:1.6}
      #${ROOT_ID} .gen-project-actions,#${ROOT_ID} .gen-inline-actions,#${ROOT_ID} .gen-header-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
      #${ROOT_ID} button{border:1px solid var(--gen-line);border-radius:7px;background:color-mix(in srgb,var(--gen-paper) 92%,white 8%);color:var(--gen-ink);padding:7px 10px;display:inline-flex;align-items:center;justify-content:center;gap:6px}
      #${ROOT_ID} button:hover{border-color:var(--gen-accent);transform:translateY(-1px)}
      #${ROOT_ID} button:disabled{opacity:.45;cursor:not-allowed;transform:none}
      #${ROOT_ID} .is-danger{color:#f0a3a3}
      #${ROOT_ID} .gen-button-primary{background:var(--gen-accent);color:var(--panel-accent-text-color,#fff);border-color:transparent;font-weight:700}
      #${ROOT_ID} .gen-progress{list-style:none;margin:0;padding:0 12px;display:grid;grid-template-columns:repeat(4,1fr);gap:0}
      #${ROOT_ID} .gen-progress li{position:relative}
      #${ROOT_ID} .gen-progress li:not(:last-child)::after{content:"";position:absolute;left:55%;right:-45%;top:50%;height:1px;background:var(--gen-line)}
      #${ROOT_ID} .gen-progress button{position:relative;z-index:1;width:100%;border:0;background:transparent;transform:none;color:var(--gen-muted);padding:5px}
      #${ROOT_ID} .gen-progress button span{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--gen-line);background:var(--panel-bg-color,#252525);font-size:11px}
      #${ROOT_ID} .gen-progress .is-active button{color:var(--gen-ink);font-weight:700}
      #${ROOT_ID} .gen-progress .is-active button span{border-color:var(--gen-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--gen-accent) 18%,transparent)}
      #${ROOT_ID} .gen-progress .is-complete button span{background:#4d7b65;border-color:#6fa689;color:#fff}
      #${ROOT_ID} .gen-work-area{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:10px;min-height:0;flex:1}
      #${ROOT_ID} .gen-work-area>main{min-width:0;overflow:auto;padding-right:2px}
      #${ROOT_ID} .gen-canvas-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:10px}
      #${ROOT_ID} .gen-sheet{position:relative;border:1px solid var(--gen-line);border-radius:12px;background-color:var(--gen-paper);background-image:linear-gradient(color-mix(in srgb,var(--gen-line) 22%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--gen-line) 15%,transparent) 1px,transparent 1px);background-size:22px 22px;padding:16px;display:flex;flex-direction:column;gap:13px;box-shadow:0 10px 25px rgba(0,0,0,.12)}
      #${ROOT_ID} .gen-sheet>header{display:flex;align-items:center;gap:11px;border-bottom:1px solid var(--gen-line);padding-bottom:11px}
      #${ROOT_ID} .gen-sheet>header>div:nth-child(2){min-width:0;flex:1}
      #${ROOT_ID} h2{font-size:18px;margin:2px 0 0;line-height:1.25;font-weight:800}
      #${ROOT_ID} .gen-sheet-index{width:34px;height:34px;border:1px solid var(--gen-line);display:grid;place-items:center;font-size:11px;font-weight:800;transform:rotate(-2deg);background:var(--panel-bg-color,#252525)}
      #${ROOT_ID} .gen-field{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:12px}
      #${ROOT_ID} .gen-field>span{color:var(--gen-muted);font-weight:700}
      #${ROOT_ID} .gen-field-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;align-items:end}
      #${ROOT_ID} .is-hidden{display:none!important}
      #${ROOT_ID} .gen-source-list{display:flex;flex-direction:column;gap:7px;max-height:360px;overflow:auto}
      #${ROOT_ID} .gen-source-card{position:relative;border:1px solid var(--gen-line);background:color-mix(in srgb,var(--gen-paper) 94%,black 6%);border-radius:8px;padding:10px 34px 10px 11px}
      #${ROOT_ID} .gen-source-card>div{display:flex;justify-content:space-between;gap:10px}
      #${ROOT_ID} .gen-source-card span,#${ROOT_ID} .gen-source-card p{font-size:11px;color:var(--gen-muted)}
      #${ROOT_ID} .gen-source-card p{margin:7px 0 0;line-height:1.5}
      #${ROOT_ID} .gen-source-card>button{position:absolute;right:6px;top:6px;padding:4px;border:0;background:transparent}
      #${ROOT_ID} .gen-source-composer{border-top:1px dashed var(--gen-line);padding-top:10px}
      #${ROOT_ID} .gen-source-composer summary{cursor:pointer;font-weight:700;margin-bottom:9px}
      #${ROOT_ID} .gen-source-composer .gen-field{margin-bottom:8px}
      #${ROOT_ID} .gen-empty-state{display:grid;place-items:center;text-align:center;padding:34px;color:var(--gen-muted)}
      #${ROOT_ID} .gen-empty-state i{font-size:26px}
      #${ROOT_ID} .gen-blueprint-ledger{display:flex;flex-direction:column;gap:3px}
      #${ROOT_ID} .gen-blueprint-row{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:8px;align-items:center;margin-left:calc(var(--tree-depth)*20px);border-bottom:1px solid color-mix(in srgb,var(--gen-line) 60%,transparent);padding:7px}
      #${ROOT_ID} .gen-tree-rail{height:100%;border-left:1px solid var(--gen-line);border-bottom:1px solid var(--gen-line)}
      #${ROOT_ID} .gen-node-main{display:grid;grid-template-columns:auto minmax(0,1fr);text-align:left;border:0;background:transparent;padding:0;transform:none}
      #${ROOT_ID} .gen-node-main strong{overflow:hidden;text-overflow:ellipsis}
      #${ROOT_ID} .gen-node-main small{grid-column:2;color:var(--gen-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ROOT_ID} .gen-node-role{font-size:9px;text-transform:uppercase;color:var(--gen-muted);padding-right:5px}
      #${ROOT_ID} .gen-node-meta{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
      #${ROOT_ID} .gen-node-meta span{font-size:10px;padding:3px 5px;border:1px solid var(--gen-line);border-radius:4px;color:var(--gen-muted)}
      #${ROOT_ID} .gen-node-meta .is-constant{color:#8bbaf5}.gen-node-meta .is-normal{color:#8fd4a4}
      #${ROOT_ID} .gen-proposal-banner{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;border:1px solid color-mix(in srgb,var(--gen-accent) 65%,var(--gen-line));border-radius:9px;background:color-mix(in srgb,var(--gen-accent) 12%,var(--gen-paper))}
      #${ROOT_ID} .gen-proposal-banner strong,#${ROOT_ID} .gen-proposal-banner p{display:block;margin:3px 0}
      #${ROOT_ID} .gen-conflict-stack{display:flex;flex-direction:column;gap:7px;padding:10px;border:1px solid #a85757;border-radius:8px;background:rgba(168,67,67,.14);color:#f2b2b2}
      #${ROOT_ID} .gen-conflict-stack article{display:flex;flex-direction:column;gap:2px;padding-top:6px;border-top:1px solid rgba(242,178,178,.2)}#${ROOT_ID} .gen-conflict-stack small{color:var(--gen-muted)}
      #${ROOT_ID} .gen-command-dock{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:7px;padding-top:10px;background:linear-gradient(transparent,var(--gen-paper) 35%)}
      #${ROOT_ID} .gen-entry-review{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:10px}
      #${ROOT_ID} .gen-entry-list{display:flex;flex-direction:column;gap:7px}
      #${ROOT_ID} .gen-entry-card{display:grid;grid-template-columns:30px 1fr;gap:9px;border:1px solid var(--gen-line);background:color-mix(in srgb,var(--gen-paper) 95%,black 5%);border-radius:8px;padding:9px}
      #${ROOT_ID} .gen-entry-card.is-selected{border-color:var(--gen-accent)}
      #${ROOT_ID} .gen-entry-card.is-active{box-shadow:inset 3px 0 0 var(--gen-accent)}
      #${ROOT_ID} .gen-entry-check{width:28px;height:28px;padding:0}
      #${ROOT_ID} .gen-entry-copy{display:block;text-align:left;border:0;background:transparent;padding:0;transform:none}
      #${ROOT_ID} .gen-entry-copy>div{display:flex;gap:8px}.gen-entry-copy>div span{font-size:9px;color:var(--gen-muted);text-transform:uppercase}
      #${ROOT_ID} .gen-entry-copy p{font-size:11px;line-height:1.5;color:var(--gen-muted);margin:5px 0}
      #${ROOT_ID} .gen-entry-copy small{color:color-mix(in srgb,var(--gen-accent) 70%,var(--gen-ink))}
      #${ROOT_ID} .gen-entry-editor{display:flex;flex-direction:column;gap:8px;padding-bottom:12px;border-bottom:1px dashed var(--gen-line)}
      #${ROOT_ID} .gen-entry-editor textarea{min-height:180px;font-family:inherit}
      #${ROOT_ID} .gen-entry-editor>small{color:var(--gen-muted);line-height:1.4}
      #${ROOT_ID} .gen-job-ledger{display:flex;gap:6px;overflow:auto;padding-bottom:2px}
      #${ROOT_ID} .gen-job-ledger article{min-width:150px;display:flex;align-items:center;justify-content:space-between;gap:7px;padding:7px 8px;border:1px solid var(--gen-line);border-radius:7px;background:color-mix(in srgb,var(--gen-paper) 92%,black 8%)}
      #${ROOT_ID} .gen-job-ledger article>span{display:flex;flex-direction:column;min-width:0}#${ROOT_ID} .gen-job-ledger strong{font-size:10px;overflow:hidden;text-overflow:ellipsis}#${ROOT_ID} .gen-job-ledger small{font-size:9px;color:var(--gen-muted)}
      #${ROOT_ID} .gen-job-ledger .is-failed,#${ROOT_ID} .gen-job-ledger .is-interrupted{border-color:#a85757}#${ROOT_ID} .gen-job-ledger .is-complete{border-color:#4d7b65}
      #${ROOT_ID} .gen-job-ledger button{font-size:9px;padding:5px;white-space:nowrap}
      #${ROOT_ID} .gen-audit-pulse{font-size:11px;color:var(--gen-muted)}#${ROOT_ID} .gen-audit-pulse.has-errors{color:#f0a3a3}
      #${ROOT_ID} .gen-audit-clear{text-align:center;padding:22px 8px;color:var(--gen-muted)}#${ROOT_ID} .gen-audit-clear i{font-size:30px;color:#79ae91}#${ROOT_ID} .gen-audit-clear strong{display:block;color:var(--gen-ink);margin:8px}
      #${ROOT_ID} .gen-issue-stack{display:flex;flex-direction:column;gap:6px}.gen-issue-stack article{display:flex;gap:7px;padding:8px;border-radius:7px;font-size:11px;line-height:1.4}.gen-issue-stack .is-error{background:rgba(168,67,67,.18);color:#f2b2b2}.gen-issue-stack .is-warning{background:rgba(175,132,51,.17);color:#efd392}
      #${ROOT_ID} .gen-stack-actions{display:flex;flex-direction:column;gap:7px;margin-top:auto}
      #${ROOT_ID} .gen-conversation{min-height:0;border:1px solid var(--gen-line);border-radius:12px;background:color-mix(in srgb,var(--panel-bg-color,#252525) 95%,black 5%);display:flex;flex-direction:column;overflow:hidden}
      #${ROOT_ID} .gen-conversation>header{padding:12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--gen-line)}
      #${ROOT_ID} .gen-conversation h2{font-size:15px}.gen-revision{font:700 11px monospace;color:var(--gen-muted)}
      #${ROOT_ID} .gen-message-log{flex:1;min-height:180px;overflow:auto;padding:11px;display:flex;flex-direction:column;gap:9px}
      #${ROOT_ID} .gen-message-log article{max-width:91%;padding:8px 10px;border-radius:10px;background:var(--gen-paper)}
      #${ROOT_ID} .gen-message-log article.is-user{align-self:flex-end;background:color-mix(in srgb,var(--gen-accent) 18%,var(--gen-paper))}
      #${ROOT_ID} .gen-message-log article span{font-size:9px;color:var(--gen-muted)}#${ROOT_ID} .gen-message-log article p{margin:4px 0 0;line-height:1.55;font-size:12px;white-space:pre-wrap}
      #${ROOT_ID} .gen-empty-chat{margin:auto;text-align:center;color:var(--gen-muted);font-size:11px;line-height:1.6;padding:20px}
      #${ROOT_ID} .gen-mini-proposal{margin:0 10px 8px;padding:8px;border:1px solid var(--gen-accent);border-radius:8px;display:flex;gap:7px;font-size:10px}.gen-mini-proposal strong{display:block}
      #${ROOT_ID} .gen-chat-controls{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;padding:8px 9px 0;border-top:1px solid var(--gen-line)}
      #${ROOT_ID} .gen-chat-controls select{min-width:0;font-size:10px;padding:6px}
      #${ROOT_ID} .gen-chat-input{position:relative;padding:8px 9px 9px}.gen-chat-input textarea{min-height:76px;padding-right:42px}.gen-chat-input button{position:absolute;right:16px;bottom:16px;width:28px;height:28px;padding:0;border-radius:50%;background:var(--gen-accent);color:#fff}
      #${ROOT_ID} .gen-status{min-height:18px;font-size:11px;color:var(--gen-muted);padding:0 4px}.gen-status[data-tone="danger"]{color:#f0a3a3}.gen-status[data-tone="active"]{color:#9ed3b3}
      #${ROOT_ID} .gen-running-banner{position:absolute;right:18px;bottom:20px;z-index:8;display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--gen-accent);border-radius:9px;background:var(--panel-bg-color,#252525);box-shadow:0 8px 30px rgba(0,0,0,.3)}
      #${ROOT_ID} .gen-finish-sheet{max-width:760px;margin:0 auto;text-align:center;align-items:center}.gen-finish-mark{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;background:#416d59;color:#fff;font-size:28px}
      #${ROOT_ID} .gen-binding-panel{width:100%;border-top:1px solid var(--gen-line);padding-top:12px}.gen-binding-panel>div{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin-top:8px}
      #${ROOT_ID}.gen-loading{display:grid;place-items:center;align-content:center;height:100%;color:var(--gen-muted)}
      @media(max-width:1050px){#${ROOT_ID} .gen-work-area{grid-template-columns:1fr}#${ROOT_ID} .gen-conversation{min-height:420px}#${ROOT_ID} .gen-canvas-grid{grid-template-columns:1fr}}
      @media(max-width:720px){#${ROOT_ID} .gen-project-bar{align-items:flex-start;flex-direction:column}#${ROOT_ID} .gen-project-actions{width:100%;overflow:auto;flex-wrap:nowrap}#${ROOT_ID} .gen-progress button{font-size:0}.gen-progress button span{font-size:11px}#${ROOT_ID} .gen-field-row,#${ROOT_ID} .gen-entry-review{grid-template-columns:1fr}#${ROOT_ID} .gen-blueprint-row{grid-template-columns:14px 1fr}.gen-node-meta{grid-column:2;justify-content:flex-start!important}#${ROOT_ID} .gen-chat-controls{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){#${ROOT_ID} *,#${ROOT_ID} *::before,#${ROOT_ID} *::after{transition:none!important;animation:none!important}}
    </style>
  `);
}

function captureBrief() {
  const project = clone(state.project);
  project.name = ($('#ai-generation-project-name', parentDoc()).val() || project.name).trim();
  project.goal = ($('#ai-generation-goal', parentDoc()).val() || '').toString();
  project.scalePreference = ($('#ai-generation-scale', parentDoc()).val() || 'auto').toString();
  const targetType = ($('#ai-generation-target-type', parentDoc()).val() || 'export').toString();
  const lorebookName =
    targetType === 'append'
      ? ($('#ai-generation-target-existing', parentDoc()).val() || '').toString()
      : targetType === 'create'
        ? ($('#ai-generation-target-new', parentDoc()).val() || '').toString().trim()
        : '';
  project.target = { ...project.target, type: targetType, lorebookName };
  return project;
}

async function runBusy(label, runner) {
  if (state.busy) return;
  state.busy = true;
  state.operationId = `ui-${Date.now()}`;
  setStatus(label);
  render();
  try {
    const result = await runner(state.operationId);
    const project = unwrapProject(result, state.project);
    if (project !== state.project || result?.project) {
      await persistProject(project, { rerender: false });
    }
    if (['failed', 'blocked'].includes(result?.outcome)) {
      setStatus(result?.error?.message || result?.reason || '生成没有完成。', { error: true });
    }
    if (result?.message) state.status = result.message;
    return result;
  } catch (error) {
    setStatus(error.message || '操作失败。', { error: true });
    return null;
  } finally {
    state.busy = false;
    state.operationId = null;
    render();
  }
}

function generationRequestOptions(operationId, extra = {}) {
  const settings = getAiWorkspaceSettings();
  return {
    operationId,
    customApi: settings.apiMode === 'custom' ? settings.customApi : null,
    promptSettings: settings.draft?.promptSettings || settings.promptSettings || null,
    shouldStream: settings.stream === true,
    maxOutputTokens: settings.contextBudget?.reserveOutputTokens || 4096,
    callLimit: 20,
    ...extra,
  };
}

function createBatchCheckpointWriter(baseProject, { replacingJobId = '' } = {}) {
  const checkpointJobs = replacingJobId
    ? (baseProject.jobs || []).filter(job => (job.id || job.jobId) !== replacingJobId)
    : [];
  return async ({ job }) => {
    const id = job.id || job.jobId;
    const existingIndex = checkpointJobs.findIndex(item => (item.id || item.jobId) === id);
    if (existingIndex >= 0) checkpointJobs[existingIndex] = job;
    else checkpointJobs.push(job);
    const checkpoint = normalizeGenerationProject({
      ...baseProject,
      jobs: checkpointJobs,
      updatedAt: new Date().toISOString(),
    });
    state.project = unwrapProject(await saveGenerationProject(checkpoint), checkpoint);
    render();
  };
}

async function handleProjectAction(action, $button) {
  if (action === 'new-project') {
    const name = window.prompt('新项目名称：', '新的世界书生成项目');
    if (!name?.trim()) return;
    const created = await createStoredGenerationProject(createGenerationProject({ name: name.trim() }));
    state.project = unwrapProject(created, createGenerationProject({ name: name.trim() }));
    state.projects = await listGenerationProjects({ includeArchived: true });
    state.view = DEFAULT_VIEW;
    setActiveProjectId(state.project.id);
    render();
    return;
  }
  if (action === 'rename-project') {
    const name = window.prompt('项目名称：', currentProjectName());
    if (name?.trim()) await persistProject({ ...state.project, name: name.trim() });
    return;
  }
  if (action === 'duplicate-project') {
    const duplicated = await duplicateGenerationProject(state.project.id);
    state.project = unwrapProject(duplicated, state.project);
    state.projects = await listGenerationProjects({ includeArchived: true });
    setActiveProjectId(state.project.id);
    render();
    return;
  }
  if (action === 'archive-project') {
    const archived = await archiveGenerationProject(state.project.id, !state.project.archived);
    state.project = unwrapProject(archived, state.project);
    state.projects = await listGenerationProjects({ includeArchived: true });
    render();
    return;
  }
  if (action === 'delete-project') {
    if (!window.confirm(`永久删除生成项目“${currentProjectName()}”？`)) return;
    await deleteGenerationProject(state.project.id);
    state.project = null;
    await ensureActiveProject();
    render();
    return;
  }
  if (action === 'export-project') {
    const exported = await exportGenerationProject(state.project.id);
    const content = typeof exported === 'string' ? exported : JSON.stringify(exported, null, 2);
    triggerDownload(`${currentProjectName()}.worldbook-project.json`, content);
    return;
  }
  if (action === 'import-project') {
    const selected = await openFilePickerAndRead();
    if (!selected?.content) return;
    const imported = await importGenerationProject(
      typeof selected.content === 'string' ? JSON.parse(selected.content) : selected.content,
    );
    state.project = unwrapProject(imported, state.project);
    state.projects = await listGenerationProjects({ includeArchived: true });
    setActiveProjectId(state.project.id);
    render();
    return;
  }
  if (action === 'save-brief') {
    await persistProject(captureBrief());
    return;
  }
  if (action === 'add-source') {
    const title = ($('#ai-generation-source-title', parentDoc()).val() || '').toString().trim();
    const content = ($('#ai-generation-source-content', parentDoc()).val() || '').toString().trim();
    if (!content) return setStatus('资料内容不能为空。', { error: true });
    const scopeType = ($('#ai-generation-source-scope', parentDoc()).val() || 'global').toString();
    const scopeId = ($('#ai-generation-chat-scope', parentDoc()).val() || '').toString();
    const next = clone(state.project);
    next.sources.push({
      sourceId: `S-${Date.now().toString(36)}`,
      title: title || `资料 ${next.sources.length + 1}`,
      content,
      scope: { type: scopeType, ids: scopeType === 'global' || !scopeId ? [] : [scopeId] },
      version: 1,
      supersedes: null,
    });
    await persistProject(next);
    return;
  }
  if (action === 'remove-source') {
    const sourceId = $button.attr('data-source-id');
    const next = clone(state.project);
    next.sources = next.sources.filter(source => source.sourceId !== sourceId);
    await persistProject(next);
    return;
  }
  if (action === 'plan-calls') {
    const project = captureBrief();
    const plan = await buildGenerationCallPlan(project, 'blueprint');
    const count = plan?.estimatedCalls ?? plan?.jobs?.length ?? 0;
    setStatus(`预计调用 ${count || '若干'} 次：${plan?.summary || '结构规划、审计和修复。'}`);
    return;
  }
  if (action === 'generate-blueprint') {
    const project = captureBrief();
    if (!project.goal?.trim() && !project.sources.length) return setStatus('请先填写目标或添加资料。', { error: true });
    await persistProject(project, { rerender: false });
    await runBusy('正在生成结构蓝图…', operationId =>
      generateWorldbookBlueprint(project, generationRequestOptions(operationId)),
    );
    state.view = 'blueprint';
    return;
  }
  if (action === 'accept-proposal') {
    const next = await applyGenerationProposal(state.project, state.project.pendingProposal);
    await persistProject(unwrapProject(next, next));
    state.view = state.project.stage === 'entry-review' ? 'entries' : 'blueprint';
    return;
  }
  if (action === 'reject-proposal') {
    const next = await rejectGenerationProposal(state.project, state.project.pendingProposal?.id);
    await persistProject(unwrapProject(next, next));
    return;
  }
  if (action === 'generate-entries') {
    const plan = buildGenerationCallPlan(state.project, 'entries');
    const allowCallLimitIncrease =
      !plan.requiresLimitIncrease
      || window.confirm(`本次预计至少调用 ${plan.minimumCalls} 次模型，超过默认 20 次上限。是否继续？`);
    if (!allowCallLimitIncrease) return;
    const baseProject = state.project;
    const writeBatchCheckpoint = createBatchCheckpointWriter(baseProject);
    await runBusy('正在按完整主题组生成条目…', operationId =>
      generateWorldbookEntries(
        baseProject,
        generationRequestOptions(operationId, {
          allowCallLimitIncrease: plan.requiresLimitIncrease,
          onBatchStart: writeBatchCheckpoint,
          onBatchComplete: writeBatchCheckpoint,
        }),
      ),
    );
    state.view = 'entries';
    return;
  }
  if (action === 'retry-job') {
    const retryJobId = $button.attr('data-job-id') || '';
    const baseProject = state.project;
    const writeBatchCheckpoint = createBatchCheckpointWriter(baseProject, { replacingJobId: retryJobId });
    await runBusy('正在重试选中的完整主题组…', operationId =>
      generateWorldbookEntries(
        baseProject,
        generationRequestOptions(operationId, {
          retryJobId,
          onBatchStart: writeBatchCheckpoint,
          onBatchComplete: writeBatchCheckpoint,
        }),
      ),
    );
    state.view = 'entries';
    return;
  }
  if (action === 'audit-blueprint') {
    const report = auditGenerationBlueprint(state.project.blueprint);
    await persistProject({ ...state.project, audit: { ...report, revision: state.project.revision, checkedAt: new Date().toISOString() } });
    return;
  }
  if (action === 'audit-entries') {
    const report = auditGeneratedEntries(acceptedEntryDrafts(state.project), { blueprint: state.project.blueprint });
    await persistProject({ ...state.project, audit: { ...report, revision: state.project.revision, checkedAt: new Date().toISOString() } });
    return;
  }
  if (action === 'undo') {
    const next = await undoGenerationProject(state.project);
    await persistProject(unwrapProject(next, next));
    return;
  }
  if (action === 'redo') {
    const next = await redoGenerationProject(state.project);
    await persistProject(unwrapProject(next, next));
    return;
  }
  if (action === 'toggle-entry') {
    const id = $button.attr('data-entry-id');
    const entries = proposedEntryDrafts(state.project);
    const accepted = acceptedEntryIds(state.project, entries);
    const ids = groupedEntryIds(state.project, entries, id);
    const shouldAccept = !ids.every(groupedId => accepted.has(groupedId));
    ids.forEach(groupedId => {
      if (shouldAccept) accepted.add(groupedId);
      else accepted.delete(groupedId);
    });
    const report = auditGeneratedEntries(
      entries.filter((entry, index) => accepted.has(entryId(entry, index))),
      { blueprint: state.project.blueprint },
    );
    await persistProject({
      ...state.project,
      target: { ...state.project.target, acceptedEntryIds: [...accepted] },
      audit: { ...report, revision: state.project.revision, checkedAt: new Date().toISOString() },
    });
    return;
  }
  if (action === 'edit-entry') {
    state.activeEntryId = $button.attr('data-entry-id') || '';
    render();
    return;
  }
  if (action === 'save-entry-edit') {
    if (state.project.pendingProposal) {
      return setStatus('请先处理待确认的 AI 提案。', { error: true });
    }
    const id = $button.attr('data-entry-id');
    const entries = clone(state.project.entryDrafts || []);
    const index = entries.findIndex((entry, entryIndex) => entryId(entry, entryIndex) === id);
    if (index < 0) return setStatus('找不到要修改的条目。', { error: true });
    const title = ($('#ai-generation-entry-title', parentDoc()).val() || '').toString().trim();
    const content = ($('#ai-generation-entry-content', parentDoc()).val() || '').toString();
    const keys = ($('#ai-generation-entry-keywords', parentDoc()).val() || '')
      .toString()
      .split(/[,，]/)
      .map(item => item.trim())
      .filter(Boolean);
    if (!title) return setStatus('条目标题不能为空。', { error: true });
    const edited = { ...entries[index], name: title, content };
    if (Object.hasOwn(edited, 'title')) edited.title = title;
    if (edited.trigger) edited.trigger = { ...edited.trigger, Title: title, Comma_separated_list: keys.join(', ') };
    edited.strategy = { ...(edited.strategy || {}), keys };
    entries[index] = edited;
    const proposal = {
      proposalId: `manual-${Date.now().toString(36)}`,
      id: `manual-${Date.now().toString(36)}`,
      baseRevision: state.project.revision,
      scopeIds: [id],
      summary: `人工修订条目“${title}”`,
      operations: [{ type: 'replaceEntryDrafts', entries }],
      affectedIds: [id],
      conflicts: [],
      requiredJobs: [],
    };
    const applied = await applyGenerationProposal(state.project, proposal);
    const next = unwrapProject(applied, applied);
    const report = auditGeneratedEntries(next.entryDrafts, { blueprint: next.blueprint });
    await persistProject({
      ...next,
      audit: { ...report, revision: next.revision, checkedAt: new Date().toISOString() },
    });
    setStatus('人工修订已保存，并记录为可撤销修订。');
    return;
  }
  if (action === 'copy-yaml' || action === 'download-yaml') {
    const yaml = serializeWorldbookYaml(acceptedEntryDrafts(state.project));
    if (action === 'copy-yaml') {
      await navigator.clipboard.writeText(yaml);
      setStatus('YAML 已复制。');
    } else {
      triggerDownload(`${state.project.target?.lorebookName || currentProjectName()}.yaml`, yaml);
    }
    return;
  }
  if (action === 'apply-target') {
    if (state.project.audit?.errors?.length) return setStatus('仍有阻断错误，不能导入。', { error: true });
    await runBusy('正在执行最终写入…', async operationId => {
      const applyProject = {
        ...state.project,
        entryDrafts: acceptedEntryDrafts(state.project),
      };
      const result = await applyGenerationProjectToTarget(applyProject, { operationId });
      if (result?.success === false) {
        return {
          project: normalizeGenerationProject({
            ...state.project,
            stage: 'entry-review',
            lastApplyResult: result,
          }),
          message:
            result?.error?.message
            || (Array.isArray(result?.conflicts) && result.conflicts.length
              ? `写入前检查发现 ${result.conflicts.length} 个冲突。`
              : '世界书写入失败。'),
        };
      }
      const next = normalizeGenerationProject({
        ...state.project,
        stage: 'complete',
        lastApplyResult: result,
      });
      await persistProject(next, { rerender: false });
      state.view = 'audit';
      return { project: next, message: result?.message || '世界书操作已完成。' };
    });
    return;
  }
  if (action === 'rollback-created') {
    const name = state.project.lastApplyResult?.lorebookName || state.project.target?.lorebookName;
    const result = await rollbackCreatedWorldbook(name, {
      creationTransaction: state.project.lastApplyResult?.creationTransaction,
    });
    setStatus(result?.message || (result?.success ? '已撤销新建世界书。' : '无法撤销新建世界书。'), {
      error: result?.success === false,
    });
    return;
  }
  if (action === 'send-message') {
    const message = ($('#ai-generation-chat-message', parentDoc()).val() || '').toString().trim();
    if (!message) return;
    const intent = ($('#ai-generation-chat-intent', parentDoc()).val() || 'discussion').toString();
    const scopeValue = ($('#ai-generation-chat-scope', parentDoc()).val() || 'global').toString();
    const lifetime = ($('#ai-generation-chat-lifetime', parentDoc()).val() || 'once').toString();
    const scope = scopeValue === 'global' ? { type: 'global', ids: [] } : { type: 'branch', ids: [scopeValue] };
    await runBusy('AI 正在阅读当前范围…', operationId =>
      runGenerationConversation(state.project, {
        ...generationRequestOptions(operationId),
        message,
        intent,
        scope,
        lifetime,
      }),
    );
    return;
  }
  if (action === 'stop') {
    await cancelGenerationOperation(state.operationId);
    state.busy = false;
    setStatus('已请求停止，完成的分组会保留。');
    render();
  }
}

function bindEvents() {
  $(parentDoc())
    .off('.aiGenerationWorkspace')
    .on('change.aiGenerationWorkspace', '#ai-generation-project-select', async function () {
      const project = await getGenerationProject($(this).val());
      if (!project) return;
      state.project = normalizeGenerationProject(project, { recoverRunningJobs: true });
      state.view = DEFAULT_VIEW;
      state.activeEntryId = '';
      setActiveProjectId(state.project.id);
      render();
    })
    .on('change.aiGenerationWorkspace', '#ai-generation-target-type', function () {
      const target = $(this).val();
      $('[data-target-field]', parentDoc()).addClass('is-hidden');
      $(`[data-target-field="${target}"]`, parentDoc()).removeClass('is-hidden');
    })
    .on('click.aiGenerationWorkspace', '[data-generation-view]', function () {
      state.view = ($(this).attr('data-generation-view') || DEFAULT_VIEW).toString();
      render();
    })
    .on('click.aiGenerationWorkspace', '[data-generation-action]', async function () {
      try {
        await handleProjectAction(($(this).attr('data-generation-action') || '').toString(), $(this));
      } catch (error) {
        setStatus(error.message || '操作失败。', { error: true });
      }
    })
    .on('click.aiGenerationWorkspace', '[data-generation-bind]', async function () {
      const mode = ($(this).attr('data-generation-bind') || '').toString();
      const name = state.project?.lastApplyResult?.lorebookName || state.project?.target?.lorebookName;
      if (!name) return;
      try {
        const result = await bindCreatedWorldbook(name, mode, {
          creationTransaction: state.project?.lastApplyResult?.creationTransaction,
        });
        setStatus(result?.message || '世界书绑定已更新。', { error: result?.success === false });
      } catch (error) {
        setStatus(error.message || '绑定失败。', { error: true });
      }
    });
}

export function isAiGenerationWorkspaceBusy() {
  return state.busy;
}

export function initAiGenerationWorkspace(options = {}) {
  state.worldbookNames = Array.isArray(options.worldbookNames) ? [...options.worldbookNames] : state.worldbookNames;
  if (!state.initialized) {
    bindEvents();
    state.initialized = true;
    void refreshAiGenerationWorkspace({ worldbookNames: state.worldbookNames, render: false });
  }
}

export function renderAiGenerationWorkspace($panel, options = {}) {
  state.renderTarget = $panel;
  state.worldbookNames = Array.isArray(options.worldbookNames) ? [...options.worldbookNames] : state.worldbookNames;
  if (!state.project && !state.loading) {
    state.loading = true;
    void ensureActiveProject().then(render);
  }
  render();
}

export async function refreshAiGenerationWorkspace(options = {}) {
  state.worldbookNames = Array.isArray(options.worldbookNames) ? [...options.worldbookNames] : state.worldbookNames;
  await ensureActiveProject();
  if (options.render !== false) render();
  return state.project;
}

export function resetAiGenerationWorkspace() {
  if (state.busy && state.operationId) {
    void cancelGenerationOperation(state.operationId);
  }
  state.busy = false;
  state.operationId = null;
  state.projects = [];
  state.project = null;
  state.view = DEFAULT_VIEW;
  state.status = '';
  state.error = '';
  state.activeEntryId = '';
}

export const aiGenerationWorkspaceInternals = {
  buildSourceView,
  buildBlueprintView,
  buildEntriesView,
  buildConversationRail,
  groupedEntryIds,
};
