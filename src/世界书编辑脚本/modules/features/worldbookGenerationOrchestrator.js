import { requestLlmText, cancelLlmGeneration } from './llmClient.js';
import { buildGenerationContext, serializeGenerationContext } from './worldbookGenerationContext.js';
import {
  auditGenerationBlueprint,
  auditGeneratedEntries,
} from './worldbookGenerationAudit.js';
import { applyXmlFallbackKeywords } from './worldbookYaml.js';
import { captureGenerationTargetBaseline } from './worldbookGenerationApply.js';

const DEFAULT_CALL_LIMIT = 20;
const DEFAULT_REPAIR_LIMIT = 2;
const activeOperations = new Map();

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getNodeId(node) {
  return node?.nodeId || node?.entryId || node?.id || null;
}

function getBlueprintNodes(project) {
  if (Array.isArray(project?.blueprint)) return project.blueprint;
  return asArray(project?.blueprint?.nodes || project?.blueprint?.entries);
}

function stripJsonFence(text) {
  const value = `${text || ''}`.trim();
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : value;
}

function parseJsonResponse(text, label) {
  const source = stripJsonFence(text);
  try {
    return JSON.parse(source);
  } catch (error) {
    const firstBrace = source.indexOf('{');
    const lastBrace = source.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(source.slice(firstBrace, lastBrace + 1));
      } catch {
        // Fall through to the structured error below.
      }
    }
    throw new Error(`${label}返回的 JSON 无法解析: ${error.message}`);
  }
}

function getSeverityErrors(report) {
  if (!report) return [];
  if (Array.isArray(report.errors)) return report.errors;
  return asArray(report.issues).filter(issue => issue?.severity === 'error');
}

function normalizeBlueprintPayload(payload, project) {
  const candidate = payload?.blueprint || payload;
  const nodes = asArray(candidate?.nodes || candidate?.entries);
  if (nodes.length === 0) {
    throw new Error('AI 未返回任何蓝图节点。');
  }
  return {
    scale:
      candidate?.scale ||
      (project?.scalePreference && project.scalePreference !== 'auto' ? project.scalePreference : null) ||
      project?.scale ||
      'medium',
    summary: candidate?.summary || payload?.summary || '',
    nodes: nodes.map((node, index) => ({
      ...node,
      nodeId: getNodeId(node) || `NODE_${String(index + 1).padStart(3, '0')}`,
    })),
  };
}

function normalizeEntryPayload(payload) {
  return asArray(payload?.entries || payload?.drafts || payload).map(item => {
    if (item?.entry && typeof item.entry === 'object') {
      return {
        ...item.entry,
        nodeId: item.nodeId || item.entryId || item.entry.nodeId || item.entry.entryId,
        entryId: item.entryId || item.nodeId || item.entry.entryId || item.entry.nodeId,
      };
    }
    return item;
  });
}

function getNodeSortValue(node) {
  const position = node?.position?.type || node?.position || '';
  const depth = Number(node?.position?.depth ?? node?.depth ?? 0);
  const order = Number(node?.position?.order ?? node?.order ?? 0);
  return `${position}\u0000${String(depth).padStart(5, '0')}\u0000${String(order).padStart(12, '0')}`;
}

function findTopDomainId(node, nodeById) {
  let current = node;
  let previous = node;
  const visited = new Set();
  while (current) {
    const currentId = getNodeId(current);
    if (!currentId || visited.has(currentId)) break;
    visited.add(currentId);
    const parentId = current.parentId || current.parentNodeId;
    if (!parentId) return getNodeId(previous) || currentId;
    const parent = nodeById.get(parentId);
    if (!parent) return currentId;
    previous = current;
    current = parent;
  }
  return getNodeId(node);
}

/**
 * XML groups are indivisible. Non-XML nodes are batched by their first domain
 * below the root, preserving the blueprint's position/order sequence.
 */
export function buildGenerationBatches(project) {
  const nodes = [...getBlueprintNodes(project)].sort((a, b) =>
    getNodeSortValue(a).localeCompare(getNodeSortValue(b), 'zh-CN'),
  );
  const nodeById = new Map(nodes.map(node => [getNodeId(node), node]).filter(([id]) => id));
  const batchByKey = new Map();

  nodes.forEach(node => {
    const nodeId = getNodeId(node);
    const xmlGroupId = node?.xml?.groupId;
    const domainId = findTopDomainId(node, nodeById);
    const key = xmlGroupId ? `xml:${xmlGroupId}` : `domain:${domainId || nodeId}`;
    if (!batchByKey.has(key)) {
      batchByKey.set(key, {
        id: createId('entry-batch'),
        key,
        xmlGroupId: xmlGroupId || null,
        domainId: domainId || null,
        nodeIds: [],
        nodes: [],
      });
    }
    const batch = batchByKey.get(key);
    batch.nodeIds.push(nodeId);
    batch.nodes.push(clone(node));
  });

  const batches = [...batchByKey.values()];
  const batchKeyByNodeId = new Map();
  batches.forEach(batch => batch.nodeIds.forEach(nodeId => batchKeyByNodeId.set(nodeId, batch.key)));
  batches.forEach(batch => {
    const dependencies = new Set();
    batch.nodes.forEach(node => {
      const dependencyIds = [
        node?.parentId,
        node?.parentNodeId,
        ...asArray(node?.dependsOnEntryIds || node?.dependsOnNodeIds || node?.dependencies),
      ].filter(Boolean);
      dependencyIds.forEach(dependencyId => {
        const dependencyBatchKey = batchKeyByNodeId.get(dependencyId);
        if (dependencyBatchKey && dependencyBatchKey !== batch.key) dependencies.add(dependencyBatchKey);
      });
    });
    batch.dependsOnBatchKeys = [...dependencies];
  });

  const ordered = [];
  const remaining = [...batches];
  const emittedKeys = new Set();
  while (remaining.length > 0) {
    const readyIndex = remaining.findIndex(batch =>
      batch.dependsOnBatchKeys.every(key => emittedKeys.has(key) || !batchByKey.has(key)),
    );
    if (readyIndex < 0) {
      ordered.push(...remaining);
      break;
    }
    const [ready] = remaining.splice(readyIndex, 1);
    ordered.push(ready);
    emittedKeys.add(ready.key);
  }
  return ordered;
}

export function buildGenerationCallPlan(project, kind = 'blueprint') {
  if (kind === 'blueprint') {
    return {
      kind,
      jobs: [
        { id: createId('job'), type: 'blueprint', dependsOnJobIds: [], maxAttempts: 1 },
        { id: createId('job'), type: 'blueprint-repair', dependsOnJobIds: [], maxAttempts: DEFAULT_REPAIR_LIMIT },
      ],
      minimumCalls: 1,
      estimatedCalls: 1,
      maximumCalls: 1 + DEFAULT_REPAIR_LIMIT,
      callLimit: DEFAULT_CALL_LIMIT,
      requiresLimitIncrease: false,
    };
  }

  if (kind === 'conversation') {
    return {
      kind,
      jobs: [{ id: createId('job'), type: 'conversation', dependsOnJobIds: [], maxAttempts: 1 }],
      minimumCalls: 1,
      estimatedCalls: 1,
      maximumCalls: 1,
      callLimit: DEFAULT_CALL_LIMIT,
      requiresLimitIncrease: false,
    };
  }

  const batches = buildGenerationBatches(project);
  const jobs = batches.map(batch => ({
    id: createId('job'),
    type: 'entry-batch',
    batchKey: batch.key,
    scopeIds: batch.nodeIds,
    dependsOnJobIds: [],
    maxAttempts: 1 + DEFAULT_REPAIR_LIMIT,
  }));
  const jobByBatchKey = new Map(jobs.map(job => [job.batchKey, job]));
  jobs.forEach(job => {
    const batch = batches.find(item => item.key === job.batchKey);
    job.dependsOnJobIds = asArray(batch?.dependsOnBatchKeys)
      .map(key => jobByBatchKey.get(key)?.id)
      .filter(Boolean);
  });
  jobs.push({ id: createId('job'), type: 'semantic-audit', dependsOnJobIds: jobs.map(job => job.id), maxAttempts: 1 });
  const estimatedCalls = batches.length + 1;
  return {
    kind: 'entries',
    batches,
    jobs,
    minimumCalls: estimatedCalls,
    estimatedCalls,
    maximumCalls: batches.length * (1 + DEFAULT_REPAIR_LIMIT) + 1,
    callLimit: DEFAULT_CALL_LIMIT,
    requiresLimitIncrease: estimatedCalls > DEFAULT_CALL_LIMIT,
  };
}

function beginOperation(kind, project, options) {
  const operationId = options?.operationId || createId(`worldbook-${kind}`);
  const operation = {
    id: operationId,
    kind,
    projectId: project?.id || project?.projectId || null,
    baseRevision: Number(project?.revision || 0),
    cancelled: false,
    generationIds: new Set(),
    callCount: 0,
  };
  activeOperations.set(operationId, operation);
  options?.onOperationStart?.(operationId);
  return operation;
}

function finishOperation(operation) {
  activeOperations.delete(operation.id);
}

function assertOperationCurrent(operation, project, callLimit) {
  if (operation.cancelled) throw new Error('已停止生成');
  if (Number(project?.revision || 0) !== operation.baseRevision) {
    throw new Error('项目版本已变化，本次生成结果已过期。');
  }
  if (operation.callCount >= callLimit) {
    throw new Error(`本次操作已达到 ${callLimit} 次模型调用上限。`);
  }
}

async function invokeModel(operation, project, prompt, options, meta = {}) {
  const callLimit = Math.max(1, Number(options?.callLimit || DEFAULT_CALL_LIMIT));
  const sharedSettings = options?.sharedSettings || {};
  const resolvedCustomApi =
    options?.customApi !== undefined
      ? options.customApi
      : sharedSettings.apiMode === 'custom'
        ? sharedSettings.customApi
        : null;
  const resolvedShouldStream =
    options?.shouldStream !== undefined ? options.shouldStream === true : sharedSettings.stream === true;
  const resolvedMaxOutputTokens =
    options?.maxOutputTokens ??
    sharedSettings?.contextBudget?.reserveOutputTokens;
  assertOperationCurrent(operation, project, callLimit);
  operation.callCount += 1;
  options?.onCallStart?.({
    operationId: operation.id,
    callNumber: operation.callCount,
    ...meta,
  });

  const requestOptions = {
    prompt,
    customApi: resolvedCustomApi,
    promptSettings: options?.promptSettings || null,
    timeoutMs: options?.timeoutMs,
    shouldStream: resolvedShouldStream,
    maxOutputTokens: resolvedMaxOutputTokens,
    onGenerationStart: generationId => {
      operation.generationIds.add(generationId);
      options?.onGenerationStart?.(generationId, operation.id);
    },
  };
  const response = options?.client
    ? await options.client(prompt, { ...meta, operationId: operation.id, callNumber: operation.callCount })
    : await requestLlmText(requestOptions);
  if (operation.cancelled) throw new Error('已停止生成');
  return response;
}

function makeJob(type, scopeIds = []) {
  const now = new Date().toISOString();
  const jobId = createId('generation-job');
  return {
    id: jobId,
    jobId,
    type,
    baseRevision: null,
    scopeIds: [...scopeIds],
    dependsOnJobIds: [],
    status: 'pending',
    attempts: 0,
    result: null,
    error: '',
    createdAt: now,
    updatedAt: now,
  };
}

function makeProposal(project, kind, summary, operations, affectedIds, requiredJobs = [], conflicts = []) {
  return {
    id: createId('generation-proposal'),
    kind,
    intent: kind,
    baseRevision: Number(project?.revision || 0),
    scopeIds: [...new Set(affectedIds.filter(Boolean))],
    summary,
    operations: clone(operations),
    affectedIds: [...new Set(affectedIds.filter(Boolean))],
    conflicts: clone(conflicts),
    requiredJobs: clone(requiredJobs),
    createdAt: new Date().toISOString(),
  };
}

function withOperationState(project, jobs, pendingProposal = undefined) {
  const nextProject = clone(project || {});
  nextProject.jobs = clone(jobs).map(job => ({
    ...job,
    updatedAt: new Date().toISOString(),
  }));
  if (pendingProposal !== undefined) {
    nextProject.pendingProposal = clone(pendingProposal);
  }
  nextProject.updatedAt = new Date().toISOString();
  return nextProject;
}

function appendConversationState(project, messageOptions, assistantContent, extra = {}) {
  const nextProject = clone(project || {});
  const now = new Date().toISOString();
  nextProject.conversations = [
    ...asArray(nextProject.conversations),
    {
      id: createId('conversation-message'),
      role: 'user',
      content: `${messageOptions?.message || ''}`,
      intent: messageOptions?.intent || 'discussion',
      scope: clone(messageOptions?.scope || { type: 'global', ids: [] }),
      lifetime: messageOptions?.lifetime || 'once',
      createdAt: now,
    },
    {
      id: createId('conversation-message'),
      role: 'assistant',
      content: `${assistantContent || ''}`,
      intent: messageOptions?.intent || 'discussion',
      scope: clone(messageOptions?.scope || { type: 'global', ids: [] }),
      lifetime: 'once',
      createdAt: now,
      ...clone(extra),
    },
  ];
  const summarizedCount = Math.max(0, Number(nextProject.conversationSummaryCount || 0));
  const olderMessages = nextProject.conversations.slice(0, -8);
  const newOlderMessages = olderMessages.slice(summarizedCount);
  if (newOlderMessages.length > 0) {
    const addition = newOlderMessages
      .map(message => `${message.role === 'assistant' ? 'AI' : '用户'}：${`${message.content || ''}`.replace(/\s+/g, ' ').slice(0, 240)}`)
      .join('\n');
    nextProject.conversationSummary = [nextProject.conversationSummary, addition]
      .filter(Boolean)
      .join('\n')
      .slice(-6000);
    nextProject.conversationSummaryCount = olderMessages.length;
  }
  return nextProject;
}

function buildBlueprintPrompt(project, options, previousBlueprint = null, issues = []) {
  const context = buildGenerationContext(project, {
    ...options,
    intent: 'generate_blueprint',
    instruction: options?.instruction || project?.goal || '规划世界书结构',
  });
  return [
    '你是 SillyTavern 世界书结构规划器。只返回一个 JSON 对象，不要 Markdown。',
    '输出格式：{"blueprint":{"scale":"small|medium|large","summary":"","nodes":[...]},"conflicts":[]}。',
    '每个节点必须包含 nodeId、parentId、role、title、triggerType、keywords、position、depth、order、',
    'xml:{groupId,tag,boundary}、contentBrief、dependsOnEntryIds。',
    '小型世界必须平铺；中型只能有一套总分；大型按领域建立总分。Normal 必须有关键词。',
    `用户规模偏好：${project?.scalePreference || 'auto'}。auto 时按资料实际复杂度判断。`,
    'XML 开始、组内节点、结束必须同位置且 order 严格包裹；条件 XML 组开闭节点共享直属分点主关键词。',
    '若两份用户资料在同一事实或规则上互相矛盾，把双方 sourceId、冲突说明和 resolved:false 放入 conflicts；不得自行采用较新资料。',
    previousBlueprint ? `需要修复的当前蓝图：\n${JSON.stringify(previousBlueprint, null, 2)}` : '',
    issues.length ? `必须修复的问题：\n${JSON.stringify(issues, null, 2)}` : '',
    `项目上下文：\n${serializeGenerationContext(context)}`,
  ].filter(Boolean).join('\n\n');
}

function buildEntriesPrompt(project, batch, options, previousEntries = [], issues = []) {
  const context = buildGenerationContext(project, {
    ...options,
    intent: 'generate_entries',
    scope: { type: 'entries', ids: batch.nodeIds },
    instruction: options?.instruction || '根据已接受蓝图生成本主题组条目',
  });
  return [
    '你是 SillyTavern 世界书条目生成器。只返回 JSON，不要 Markdown 或 YAML。',
    '输出格式：{"entries":[{"nodeId":"...","entry":{"name":"","content":"","enabled":true,"probability":100,',
    '"strategy":{"type":"constant|selective","keys":[]},"position":{"type":"before_character_definition|after_character_definition|before_example_messages|after_example_messages|before_author_note|after_author_note|at_depth","role":"system|user|assistant","depth":0,"order":10}}}]}。',
    '必须覆盖给定批次全部节点且不得新增节点。Normal 对应 selective 并至少有一个关键词。',
    '正文使用简体中文和高密度事实；不要输出 UID。XML 组不可拆分，开闭标签必须完整。',
    '若上下文资料彼此冲突，返回 conflicts:[{sourceIds:[],message:"",resolved:false}]，不要自行选择较新版本。',
    '仅当追加目标的父级导航、条件父点关键词或局部 order 确有必要同步时，可另返回 existingUpdates:[{targetUid,nodeId,patch:{content,strategy:{keys},position:{order}}}]；不得修改其他既有字段。',
    previousEntries.length ? `需要修复的当前条目：\n${JSON.stringify(previousEntries, null, 2)}` : '',
    issues.length ? `必须修复的问题：\n${JSON.stringify(issues, null, 2)}` : '',
    `本批蓝图：\n${JSON.stringify(batch.nodes, null, 2)}`,
    `项目上下文：\n${serializeGenerationContext(context)}`,
  ].filter(Boolean).join('\n\n');
}

function buildSemanticAuditPrompt(project, entries, options) {
  const context = buildGenerationContext(project, {
    ...options,
    intent: 'audit',
    instruction: '审查条目是否忠实于资料、是否空泛、重复或产生设定冲突',
  });
  return [
    '你是世界书语义审计器。不要改写内容，只返回 JSON。',
    '输出格式：{"issues":[{"severity":"error|warning","category":"content","code":"","message":"","nodeIds":[]}]}。',
    'error 仅用于违背用户资料、关键内容缺失或会导致事实矛盾；空泛、重复、关键词过宽通常为 warning。',
    `待审条目：\n${JSON.stringify(entries, null, 2)}`,
    `项目上下文：\n${serializeGenerationContext(context)}`,
  ].join('\n\n');
}

export async function generateWorldbookBlueprint(project, requestOptions = {}) {
  try {
    project = await captureGenerationTargetBaseline(project);
  } catch (error) {
    return { outcome: 'failed', reason: 'baseline-unavailable', error, project: clone(project) };
  }
  if (project?.pendingProposal) {
    return {
      outcome: 'blocked',
      reason: 'pending-proposal',
      error: new Error('当前项目已有未决提案，请先接受或拒绝。'),
      project: clone(project),
    };
  }

  const operation = beginOperation('blueprint', project, requestOptions);
  const job = makeJob('blueprint');
  job.baseRevision = operation.baseRevision;
  job.status = 'running';
  let blueprint = null;
  let audit = null;
  let conflicts = [];

  try {
    for (let attempt = 0; attempt <= DEFAULT_REPAIR_LIMIT; attempt += 1) {
      job.attempts = attempt + 1;
      const response = await invokeModel(
        operation,
        project,
        buildBlueprintPrompt(project, requestOptions, attempt > 0 ? blueprint : null, getSeverityErrors(audit)),
        requestOptions,
        { jobId: job.id, type: attempt === 0 ? 'blueprint' : 'blueprint-repair', attempt: attempt + 1 },
      );
      const payload = parseJsonResponse(response, '蓝图生成');
      blueprint = normalizeBlueprintPayload(payload, project);
      const reportedConflicts = asArray(payload?.conflicts);
      if (reportedConflicts.length > 0) conflicts = reportedConflicts;
      audit = auditGenerationBlueprint(blueprint);
      if (getSeverityErrors(audit).length === 0) break;
    }

    if (getSeverityErrors(audit).length > 0) {
      job.status = 'failed';
      job.error = '蓝图经过两轮修复后仍存在硬错误。';
      job.result = { blueprint: clone(blueprint), audit: clone(audit) };
      return {
        outcome: 'failed',
        operationId: operation.id,
        error: new Error(job.error),
        audit,
        project: withOperationState(project, [job]),
        calls: operation.callCount,
      };
    }

    const affectedIds = blueprint.nodes.map(getNodeId);
    const proposal = makeProposal(
      project,
      'blueprint',
      blueprint.summary || '生成世界书结构蓝图',
      [{ type: 'replaceBlueprint', blueprint }],
      affectedIds,
      [job],
      conflicts,
    );
    job.status = 'complete';
    job.result = { audit: clone(audit), nodeCount: affectedIds.length };
    return {
      outcome: 'proposal',
      operationId: operation.id,
      proposal,
      audit,
      calls: operation.callCount,
      project: withOperationState(project, [job], proposal),
    };
  } catch (error) {
    job.status = /停止生成/.test(error?.message || '') ? 'cancelled' : 'failed';
    job.error = error?.message || `${error}`;
    return {
      outcome: job.status === 'cancelled' ? 'cancelled' : 'failed',
      operationId: operation.id,
      error,
      calls: operation.callCount,
      project: withOperationState(project, [job]),
    };
  } finally {
    finishOperation(operation);
  }
}

function findBatchIssues(report, batch) {
  const nodeIds = new Set(batch.nodeIds);
  return asArray(report?.issues).filter(issue => {
    const issueNodeIds = asArray(issue?.nodeIds);
    return issueNodeIds.length === 0 || issueNodeIds.some(id => nodeIds.has(id));
  });
}

export async function generateWorldbookEntries(project, requestOptions = {}) {
  try {
    project = await captureGenerationTargetBaseline(project);
  } catch (error) {
    return { outcome: 'failed', reason: 'baseline-unavailable', error, project: clone(project) };
  }
  const retryJob = requestOptions.retryJobId
    ? asArray(project?.jobs).find(job => (job.id || job.jobId) === requestOptions.retryJobId)
    : null;
  const pendingEntryOperation = project?.pendingProposal?.operations?.find(operation => operation?.type === 'replaceEntryDrafts');
  if (project?.pendingProposal && !retryJob) {
    return {
      outcome: 'blocked',
      reason: 'pending-proposal',
      error: new Error('当前项目已有未决提案，请先接受或拒绝。'),
      project: clone(project),
    };
  }
  if (getBlueprintNodes(project).length === 0) {
    return {
      outcome: 'blocked',
      reason: 'blueprint-missing',
      error: new Error('请先生成并接受结构蓝图。'),
      project: clone(project),
    };
  }

  let plan = buildGenerationCallPlan(project, 'entries');
  if (requestOptions.retryJobId && !retryJob) {
    return {
      outcome: 'blocked',
      reason: 'retry-job-missing',
      error: new Error('找不到要重试的生成批次。'),
      project: clone(project),
    };
  }
  if (retryJob) {
    const retryScope = new Set(asArray(retryJob.scopeIds));
    const batches = asArray(plan.batches).filter(batch => batch.nodeIds.some(nodeId => retryScope.has(nodeId)));
    plan = {
      ...plan,
      batches,
      minimumCalls: batches.length + 1,
      estimatedCalls: batches.length + 1,
      maximumCalls: batches.length * (1 + DEFAULT_REPAIR_LIMIT) + 1,
      requiresLimitIncrease: batches.length + 1 > DEFAULT_CALL_LIMIT,
    };
    if (batches.length === 0) {
      return {
        outcome: 'blocked',
        reason: 'retry-scope-missing',
        error: new Error('重试批次的节点已不在当前蓝图中，请重新生成受影响分支。'),
        project: clone(project),
      };
    }
  }
  const callLimit = Math.max(1, Number(requestOptions.callLimit || DEFAULT_CALL_LIMIT));
  if (plan.minimumCalls > callLimit && requestOptions.allowCallLimitIncrease !== true) {
    return {
      outcome: 'needs-confirmation',
      reason: 'call-limit',
      callPlan: plan,
      requiredCallLimit: plan.minimumCalls,
      project: clone(project),
    };
  }
  const effectiveCallLimit =
    requestOptions.allowCallLimitIncrease === true
      ? Math.max(callLimit, plan.minimumCalls)
      : callLimit;

  const operation = beginOperation('entries', project, requestOptions);
  const jobs = plan.batches.map(batch => {
    const job = makeJob('entry-batch', batch.nodeIds);
    job.baseRevision = operation.baseRevision;
    job.batchKey = batch.key;
    return job;
  });
  const retryScopeIds = new Set(asArray(retryJob?.scopeIds));
  const checkpointDrafts = asArray(project?.jobs).flatMap(job =>
    ['complete', 'interrupted'].includes(job?.status) ? asArray(job?.result?.entries) : [],
  );
  const previousDrafts = pendingEntryOperation?.entries?.length
    ? asArray(pendingEntryOperation.entries)
    : project?.entryDrafts?.length
      ? asArray(project.entryDrafts)
      : checkpointDrafts;
  const completedEntries = retryJob
    ? previousDrafts.filter(entry => entry?.targetUid === undefined && !retryScopeIds.has(getNodeId(entry)))
    : [];
  const proposedExistingUpdates = retryJob
    ? previousDrafts.filter(entry => entry?.targetUid !== undefined && !retryScopeIds.has(getNodeId(entry)))
    : [];
  const proposalConflicts = [];
  const failedNodeIds = new Set();
  const failedBatchKeys = new Set();

  try {
    for (let batchIndex = 0; batchIndex < plan.batches.length; batchIndex += 1) {
      const batch = plan.batches[batchIndex];
      const job = jobs[batchIndex];
      const failedDependencies = asArray(batch.dependsOnBatchKeys).filter(key => failedBatchKeys.has(key));
      if (failedDependencies.length > 0) {
        job.status = 'skipped';
        job.error = `依赖主题组未成功生成: ${failedDependencies.join(', ')}`;
        job.result = { failedDependencies };
        failedBatchKeys.add(batch.key);
        batch.nodeIds.forEach(id => failedNodeIds.add(id));
        continue;
      }
      job.status = 'running';
      await requestOptions.onBatchStart?.({
        operationId: operation.id,
        batchIndex,
        batchCount: plan.batches.length,
        job: clone(job),
      });
      let batchEntries = [];
      let batchExistingUpdates = [];
      let audit = null;

      for (let attempt = 0; attempt <= DEFAULT_REPAIR_LIMIT; attempt += 1) {
        job.attempts = attempt + 1;
        try {
          const response = await invokeModel(
            operation,
            project,
            buildEntriesPrompt(
              project,
              batch,
              requestOptions,
              attempt > 0 ? batchEntries : [],
              findBatchIssues(audit, batch),
            ),
            { ...requestOptions, callLimit: effectiveCallLimit },
            { jobId: job.id, type: attempt === 0 ? 'entry-batch' : 'entry-repair', attempt: attempt + 1 },
          );
          const payload = parseJsonResponse(response, '条目生成');
          proposalConflicts.push(...asArray(payload?.conflicts));
          batchEntries = normalizeEntryPayload(payload);
          batchExistingUpdates = asArray(payload?.existingUpdates).flatMap(update => {
            const uid = Number(update?.uid ?? update?.targetUid);
            if (!Number.isFinite(uid)) return [];
            const fingerprint = project?.existingWorldbookBaseline?.fingerprints?.[uid];
            return [{
              ...(update?.entry || update?.patch || update),
              targetUid: uid,
              beforeFingerprint: fingerprint || update?.beforeFingerprint || null,
              nodeId: update?.nodeId || `existing-${uid}`,
              entryId: update?.entryId || update?.nodeId || `existing-${uid}`,
              generationKind: 'minimal-existing-update',
            }];
          });
          const returnedNodeIds = new Set(batchEntries.map(getNodeId).filter(Boolean));
          const missingNodeIds = batch.nodeIds.filter(id => !returnedNodeIds.has(id));
          audit = auditGeneratedEntries(batchEntries, { blueprint: { scale: project.blueprint?.scale, nodes: batch.nodes } });
          if (missingNodeIds.length > 0) {
            audit = {
              ...audit,
              valid: false,
              errors: [
                ...getSeverityErrors(audit),
                {
                  severity: 'error',
                  category: 'format',
                  code: 'missing-batch-nodes',
                  message: `模型未返回节点: ${missingNodeIds.join(', ')}`,
                  nodeIds: missingNodeIds,
                },
              ],
              issues: [
                ...asArray(audit?.issues),
                {
                  severity: 'error',
                  category: 'format',
                  code: 'missing-batch-nodes',
                  message: `模型未返回节点: ${missingNodeIds.join(', ')}`,
                  nodeIds: missingNodeIds,
                },
              ],
            };
          }
          if (getSeverityErrors(audit).length === 0) break;
        } catch (error) {
          audit = {
            valid: false,
            errors: [{ severity: 'error', category: 'format', code: 'request-failed', message: error.message, nodeIds: batch.nodeIds }],
            issues: [{ severity: 'error', category: 'format', code: 'request-failed', message: error.message, nodeIds: batch.nodeIds }],
          };
          if (/停止生成|调用上限|版本已变化/.test(error?.message || '')) throw error;
        }
      }

      if (getSeverityErrors(audit).length > 0) {
        job.status = 'failed';
        job.error = '本批经过两轮修复后仍存在硬错误。';
        job.result = { audit: clone(audit), entries: clone(batchEntries) };
        batch.nodeIds.forEach(id => failedNodeIds.add(id));
        failedBatchKeys.add(batch.key);
      } else {
        job.status = 'complete';
        job.result = { audit: clone(audit), entries: clone(batchEntries) };
        completedEntries.push(...batchEntries);
        proposedExistingUpdates.push(...batchExistingUpdates);
      }
      await requestOptions.onBatchComplete?.({
        operationId: operation.id,
        batchIndex,
        batchCount: plan.batches.length,
        job: clone(job),
        completedEntries: clone(completedEntries),
      });
    }

    if (completedEntries.length === 0) {
      return {
        outcome: 'failed',
        operationId: operation.id,
        error: new Error('没有任何主题组成功生成。'),
        calls: operation.callCount,
        project: withOperationState(project, jobs),
      };
    }

    let semanticAudit = { valid: true, errors: [], warnings: [], issues: [] };
    if (!operation.cancelled && operation.callCount < effectiveCallLimit) {
      const semanticJob = makeJob('semantic-audit', completedEntries.map(getNodeId));
      semanticJob.baseRevision = operation.baseRevision;
      semanticJob.status = 'running';
      jobs.push(semanticJob);
      try {
        const response = await invokeModel(
          operation,
          project,
          buildSemanticAuditPrompt(project, completedEntries, requestOptions),
          { ...requestOptions, callLimit: effectiveCallLimit },
          { jobId: semanticJob.id, type: 'semantic-audit', attempt: 1 },
        );
        const payload = parseJsonResponse(response, '语义审计');
        semanticAudit = {
          valid: asArray(payload?.issues).every(issue => issue?.severity !== 'error'),
          errors: asArray(payload?.issues).filter(issue => issue?.severity === 'error'),
          warnings: asArray(payload?.issues).filter(issue => issue?.severity !== 'error'),
          issues: asArray(payload?.issues),
        };
        semanticJob.status = 'complete';
        semanticJob.result = clone(semanticAudit);
      } catch (error) {
        if (/停止生成/.test(error?.message || '')) throw error;
        semanticJob.status = 'failed';
        semanticJob.error = error.message;
        semanticAudit = {
          valid: true,
          errors: [],
          warnings: [{
            severity: 'warning',
            category: 'content',
            code: 'semantic-audit-failed',
            message: `语义审计未完成：${error.message}`,
            nodeIds: [],
          }],
          issues: [],
        };
      }
    }

    const semanticErrors = getSeverityErrors(semanticAudit);
    if (semanticErrors.length > 0) {
      const resolvedSemanticIssues = new Set();
      const affectedBatches = plan.batches.filter(batch =>
        semanticErrors.some(issue => {
          const issueNodeIds = asArray(issue?.nodeIds);
          return issueNodeIds.length === 0 || issueNodeIds.some(id => batch.nodeIds.includes(id));
        }),
      );
      for (const batch of affectedBatches) {
        if (operation.callCount >= effectiveCallLimit) break;
        const repairJob = makeJob('semantic-repair', batch.nodeIds);
        repairJob.baseRevision = operation.baseRevision;
        repairJob.batchKey = batch.key;
        repairJob.status = 'running';
        jobs.push(repairJob);
        let currentBatchEntries = completedEntries.filter(entry => batch.nodeIds.includes(getNodeId(entry)));
        const relevantIssues = semanticErrors.filter(issue => {
          const issueNodeIds = asArray(issue?.nodeIds);
          return issueNodeIds.length === 0 || issueNodeIds.some(id => batch.nodeIds.includes(id));
        });

        for (
          let attempt = 0;
          attempt < DEFAULT_REPAIR_LIMIT && operation.callCount < effectiveCallLimit;
          attempt += 1
        ) {
          repairJob.attempts = attempt + 1;
          try {
            const response = await invokeModel(
              operation,
              project,
              buildEntriesPrompt(project, batch, requestOptions, currentBatchEntries, relevantIssues),
              { ...requestOptions, callLimit: effectiveCallLimit },
              { jobId: repairJob.id, type: 'semantic-repair', attempt: attempt + 1 },
            );
            const repairedEntries = normalizeEntryPayload(parseJsonResponse(response, '语义问题修复'));
            const repairAudit = auditGeneratedEntries(repairedEntries, {
              blueprint: { scale: project.blueprint?.scale, nodes: batch.nodes },
            });
            currentBatchEntries = repairedEntries;
            repairJob.result = { entries: clone(repairedEntries), audit: clone(repairAudit) };
            if (getSeverityErrors(repairAudit).length === 0) break;
          } catch (error) {
            if (/停止生成|版本已变化/.test(error?.message || '')) throw error;
            repairJob.error = error.message;
            break;
          }
        }

        const repairErrors = getSeverityErrors(repairJob.result?.audit);
        if (repairJob.result && currentBatchEntries.length > 0 && repairErrors.length === 0) {
          const batchIds = new Set(batch.nodeIds);
          for (let index = completedEntries.length - 1; index >= 0; index -= 1) {
            if (batchIds.has(getNodeId(completedEntries[index]))) completedEntries.splice(index, 1);
          }
          completedEntries.push(...currentBatchEntries);
          repairJob.status = 'complete';
          relevantIssues.forEach(issue => resolvedSemanticIssues.add(issue));
        } else {
          repairJob.status = 'failed';
          repairJob.error = '语义问题修复未产生可通过确定性审计的完整主题组。';
        }
      }
      const nextIssues = asArray(semanticAudit.issues).map(issue =>
        resolvedSemanticIssues.has(issue)
          ? {
              ...issue,
              severity: 'warning',
              originalSeverity: issue.severity,
              code: `${issue.code || 'semantic-issue'}-repaired`,
              message: `${issue.message}（已局部修复，等待人工审阅）`,
            }
          : issue,
      );
      semanticAudit = {
        ...semanticAudit,
        valid: nextIssues.every(issue => issue?.severity !== 'error'),
        errors: nextIssues.filter(issue => issue?.severity === 'error'),
        warnings: nextIssues.filter(issue => issue?.severity !== 'error'),
        issues: nextIssues,
      };
    }

    const entriesWithFallback = applyXmlFallbackKeywords(completedEntries, project.blueprint);
    const uniqueExistingUpdates = [...new Map(
      proposedExistingUpdates.map(update => [Number(update.targetUid), update]),
    ).values()];
    const deterministicAudit = auditGeneratedEntries(entriesWithFallback, { blueprint: project.blueprint });
    const affectedIds = entriesWithFallback.map(getNodeId);
    const proposal = makeProposal(
      project,
      'entries',
      failedNodeIds.size > 0 ? `生成条目草稿（${failedNodeIds.size} 个节点失败）` : '生成全部世界书条目草稿',
      [{ type: 'replaceEntryDrafts', entries: [...entriesWithFallback, ...uniqueExistingUpdates] }],
      [...affectedIds, ...uniqueExistingUpdates.map(update => getNodeId(update))],
      jobs,
      proposalConflicts,
    );
    proposal.failedNodeIds = [...failedNodeIds];
    proposal.audit = {
      deterministic: clone(deterministicAudit),
      semantic: clone(semanticAudit),
    };

    return {
      outcome: failedNodeIds.size > 0 ? 'partial-proposal' : 'proposal',
      operationId: operation.id,
      proposal,
      audit: proposal.audit,
      calls: operation.callCount,
      project: withOperationState(project, jobs, proposal),
    };
  } catch (error) {
    jobs.filter(job => job.status === 'running').forEach(job => {
      job.status = /停止生成/.test(error?.message || '') ? 'cancelled' : 'failed';
      job.error = error.message;
    });
    return {
      outcome: /停止生成/.test(error?.message || '') ? 'cancelled' : 'failed',
      operationId: operation.id,
      error,
      calls: operation.callCount,
      project: withOperationState(project, jobs),
    };
  } finally {
    finishOperation(operation);
  }
}

function buildConversationPrompt(project, messageOptions) {
  const context = buildGenerationContext(project, {
    ...messageOptions,
    instruction: messageOptions?.message || '',
  });
  const mutatingIntents = new Set(['add_source', 'expand_branch', 'modify_blueprint', 'modify_entries', 'audit']);
  const expectsProposal = mutatingIntents.has(messageOptions?.intent) || messageOptions?.lifetime === 'project';
  return [
    '你是世界书生成项目的协作助手。只返回 JSON，不要 Markdown。',
    expectsProposal
      ? '本次请求会改变项目。返回 {"kind":"proposal","summary":"","scopeIds":[],"operations":[],"affectedIds":[],"conflicts":[],"requiredJobs":[]}。不得假装修改已直接生效。'
      : '本次是讨论或问答。返回 {"kind":"answer","answer":""}，不得附带修改操作。',
    'operation.type 仅允许 addSource、updateSource、addNode、updateNode、removeNode、replaceBlueprint、addEntry、updateEntry、removeEntry、replaceEntryDrafts、setAudit；',
    '若需新增长期规则，使用 {"type":"insert","path":["projectRules"],"value":规则对象}。',
    `项目上下文：\n${serializeGenerationContext(context)}`,
  ].join('\n\n');
}

export async function runGenerationConversation(project, messageOptions = {}) {
  if (!`${messageOptions?.message || ''}`.trim()) {
    return { outcome: 'failed', error: new Error('对话内容不能为空。'), project: clone(project) };
  }
  try {
    project = await captureGenerationTargetBaseline(project);
  } catch (error) {
    return { outcome: 'failed', reason: 'baseline-unavailable', error, project: clone(project) };
  }
  const mutatingIntents = new Set(['add_source', 'expand_branch', 'modify_blueprint', 'modify_entries', 'audit']);
  const expectsProposal = mutatingIntents.has(messageOptions?.intent) || messageOptions?.lifetime === 'project';
  if (project?.pendingProposal && expectsProposal) {
    return {
      outcome: 'blocked',
      reason: 'pending-proposal',
      error: new Error('当前项目已有未决提案，请先接受或拒绝。'),
      project: clone(project),
    };
  }
  const operation = beginOperation('conversation', project, messageOptions);
  const job = makeJob('conversation', asArray(messageOptions?.scope?.ids));
  job.baseRevision = operation.baseRevision;
  job.status = 'running';

  try {
    const response = await invokeModel(
      operation,
      project,
      buildConversationPrompt(project, messageOptions),
      messageOptions,
      { jobId: job.id, type: 'conversation', attempt: 1 },
    );
    let payload = parseJsonResponse(response, '协作对话');
    if (payload?.kind === 'answer' && expectsProposal) {
      if (messageOptions?.lifetime === 'project' && !mutatingIntents.has(messageOptions?.intent)) {
        payload = { kind: 'proposal', summary: payload.answer || '新增项目长期规则', operations: [] };
      } else {
        throw new Error('本次请求要求修改项目，但 AI 只返回了普通回答。');
      }
    }
    if (payload?.kind === 'answer') {
      job.status = 'complete';
      job.result = { kind: 'answer' };
      const nextProject = appendConversationState(
        withOperationState(project, [job]),
        messageOptions,
        `${payload.answer || ''}`,
        { responseKind: 'answer' },
      );
      return {
        outcome: 'answer',
        operationId: operation.id,
        answer: `${payload.answer || ''}`,
        calls: operation.callCount,
        project: nextProject,
      };
    }
    if (project?.pendingProposal) {
      throw new Error('当前项目已有未决提案，请先接受或拒绝。');
    }
    const operations = asArray(payload?.operations);
    if (
      messageOptions?.lifetime === 'project'
      && !operations.some(operation => operation?.path?.[0] === 'projectRules')
    ) {
      operations.push({
        type: 'insert',
        path: ['projectRules'],
        value: {
          id: createId('project-rule'),
          content: `${messageOptions.message || ''}`,
          scope: clone(messageOptions.scope || { type: 'global', ids: [] }),
          createdAt: new Date().toISOString(),
        },
      });
    }
    const proposal = makeProposal(
      project,
      messageOptions?.intent || 'conversation',
      payload?.summary || '对话修改提案',
      operations,
      asArray(payload?.affectedIds || payload?.scopeIds),
      asArray(payload?.requiredJobs),
      asArray(payload?.conflicts),
    );
    job.status = 'complete';
    job.result = { kind: 'proposal', proposalId: proposal.id };
    const nextProject = appendConversationState(
      withOperationState(project, [job], proposal),
      messageOptions,
      proposal.summary,
      { responseKind: 'proposal', proposalId: proposal.id },
    );
    return {
      outcome: 'proposal',
      operationId: operation.id,
      proposal,
      calls: operation.callCount,
      project: nextProject,
    };
  } catch (error) {
    job.status = /停止生成/.test(error?.message || '') ? 'cancelled' : 'failed';
    job.error = error.message;
    const nextProject = appendConversationState(
      withOperationState(project, [job]),
      messageOptions,
      `请求未完成：${error.message}`,
      { responseKind: 'error' },
    );
    return {
      outcome: job.status === 'cancelled' ? 'cancelled' : 'failed',
      operationId: operation.id,
      error,
      calls: operation.callCount,
      project: nextProject,
    };
  } finally {
    finishOperation(operation);
  }
}

export function cancelGenerationOperation(operationId) {
  const operation = activeOperations.get(operationId);
  if (!operation) return false;
  operation.cancelled = true;
  let cancelled = false;
  operation.generationIds.forEach(generationId => {
    cancelled = cancelLlmGeneration(generationId) || cancelled;
  });
  return cancelled || true;
}

export const generationOrchestratorInternals = {
  parseJsonResponse,
  normalizeBlueprintPayload,
  normalizeEntryPayload,
};

export {
  applyGenerationProjectToTarget,
  bindCreatedWorldbook,
  captureGenerationTargetBaseline,
  rollbackCreatedWorldbook,
} from './worldbookGenerationApply.js';
