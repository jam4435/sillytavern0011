import { z } from 'zod';

export const GENERATION_PROJECT_SCHEMA_VERSION = 1;
export const GENERATION_PROJECT_STAGES = ['prepare', 'blueprint-review', 'entry-review', 'complete'];
export const GENERATION_PROJECT_TARGET_TYPES = ['export', 'append', 'create'];
export const GENERATION_JOB_STATUSES = [
  'pending',
  'running',
  'complete',
  'failed',
  'cancelled',
  'skipped',
  'interrupted',
];

const blueprintRoleValues = ['flat', 'root', 'domain', 'conditional', 'detail', 'xml-open', 'xml-close'];
const xmlBoundaryValues = ['open', 'body', 'close', 'none'];

export const GenerationBlueprintNodeSchema = z.object({
  entryId: z.string().min(1),
  nodeId: z.string().min(1),
  parentId: z.string().nullable(),
  role: z.enum(blueprintRoleValues),
  title: z.string(),
  triggerType: z.enum(['Constant', 'Normal']),
  keywords: z.array(z.string()),
  position: z.union([z.string(), z.record(z.string(), z.unknown())]),
  depth: z.number().int(),
  order: z.number().int(),
  xml: z.object({
    groupId: z.string().nullable(),
    tag: z.string().nullable(),
    boundary: z.enum(xmlBoundaryValues),
  }),
  contentBrief: z.string(),
  dependsOnEntryIds: z.array(z.string()),
  stale: z.boolean(),
});

export const GenerationProposalSchema = z.object({
  id: z.string().min(1),
  intent: z.string(),
  baseRevision: z.number().int().nonnegative(),
  scopeIds: z.array(z.string()),
  summary: z.string(),
  operations: z.array(z.record(z.string(), z.unknown())),
  affectedIds: z.array(z.string()),
  conflicts: z.array(z.unknown()),
  requiredJobs: z.array(z.unknown()),
  createdAt: z.string(),
}).passthrough();

export const GenerationJobSchema = z.object({
  jobId: z.string().min(1),
  type: z.string(),
  baseRevision: z.number().int().nonnegative(),
  scopeIds: z.array(z.string()),
  dependsOnJobIds: z.array(z.string()),
  status: z.enum(GENERATION_JOB_STATUSES),
  attempts: z.number().int().nonnegative(),
  result: z.unknown().nullable(),
  error: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const GenerationAuditReportSchema = z.object({
  errors: z.array(z.unknown()),
  warnings: z.array(z.unknown()),
  categories: z.record(z.string(), z.unknown()),
  checkedAt: z.string().nullable(),
  revision: z.number().int().nonnegative(),
});

export const GenerationProjectSchema = z.object({
  schemaVersion: z.literal(GENERATION_PROJECT_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  archived: z.boolean(),
  revision: z.number().int().nonnegative(),
  stage: z.enum(GENERATION_PROJECT_STAGES),
  goal: z.string(),
  scalePreference: z.enum(['auto', 'small', 'medium', 'large']),
  target: z.object({
    type: z.enum(GENERATION_PROJECT_TARGET_TYPES),
    lorebookName: z.string(),
  }).passthrough(),
  sources: z.array(z.unknown()),
  projectRules: z.array(z.unknown()),
  conversations: z.array(z.unknown()),
  conversationSummary: z.string(),
  conversationSummaryCount: z.number().int().nonnegative(),
  blueprint: z.object({
    scale: z.enum(['small', 'medium', 'large']),
    nodes: z.array(GenerationBlueprintNodeSchema),
  }),
  entryDrafts: z.array(z.unknown()),
  existingWorldbookBaseline: z.unknown().nullable(),
  lastApplyResult: z.unknown().nullable(),
  audit: GenerationAuditReportSchema,
  audits: z.array(z.unknown()),
  jobs: z.array(GenerationJobSchema),
  pendingProposal: GenerationProposalSchema.nullable(),
  revisionHistory: z.object({
    undo: z.array(z.unknown()),
    redo: z.array(z.unknown()),
  }),
});

let fallbackIdCounter = 0;

export function createGenerationId(prefix = 'generation') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  fallbackIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
}

export function cloneGenerationValue(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fall through for values that are JSON data but not structured-cloneable in a host shim.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(value) {
  return [...new Set(asArray(value).map(item => asString(item).trim()).filter(Boolean))];
}

function asNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(`${value ?? ''}`, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeTimestamp(value, fallback) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
  return fallback;
}

export function normalizeGenerationBlueprintNode(node = {}, index = 0) {
  const entryId = asString(node.entryId || node.nodeId).trim() || `E${String(index + 1).padStart(3, '0')}`;
  const role = blueprintRoleValues.includes(node.role) ? node.role : 'detail';
  const rawTriggerType = `${node.triggerType || node.strategyType || ''}`.toLowerCase();
  const triggerType =
    rawTriggerType === 'constant' || node.constant === true || node.strategy?.type === 'constant'
      ? 'Constant'
      : 'Normal';
  const rawPosition = node.position ?? node.positionType ?? '';
  const position =
    typeof rawPosition === 'string' || (rawPosition && typeof rawPosition === 'object')
      ? cloneGenerationValue(rawPosition)
      : '';
  const rawXml = node.xml && typeof node.xml === 'object' ? node.xml : {};
  const boundary = xmlBoundaryValues.includes(rawXml.boundary) ? rawXml.boundary : 'none';

  return {
    entryId,
    nodeId: entryId,
    parentId: asString(node.parentId || node.parentEntryId).trim() || null,
    role,
    title: asString(node.title || node.name),
    triggerType,
    keywords: uniqueStrings(node.keywords || node.keys || node.strategy?.keys),
    position,
    depth: asNonNegativeInteger(node.depth ?? node.position?.depth, 0),
    order: Number.isFinite(Number(node.order ?? node.position?.order))
      ? Math.trunc(Number(node.order ?? node.position?.order))
      : index * 10,
    xml: {
      groupId: asString(rawXml.groupId).trim() || null,
      tag: asString(rawXml.tag).trim() || null,
      boundary,
    },
    contentBrief: asString(node.contentBrief || node.brief || node.contentSummary),
    dependsOnEntryIds: uniqueStrings(node.dependsOnEntryIds || node.dependsOnNodeIds || node.dependencies),
    stale: node.stale === true,
  };
}

export function normalizeGenerationBlueprint(blueprint = {}) {
  const scale = ['small', 'medium', 'large'].includes(blueprint?.scale) ? blueprint.scale : 'small';
  const rawNodes = Array.isArray(blueprint) ? blueprint : blueprint?.nodes;
  const nodes = asArray(rawNodes).map(normalizeGenerationBlueprintNode);
  const ids = new Set(nodes.map(node => node.entryId));
  return {
    scale,
    nodes: nodes.map(node => ({
      ...node,
      parentId: node.parentId && ids.has(node.parentId) ? node.parentId : node.parentId,
      dependsOnEntryIds: node.dependsOnEntryIds.filter(id => id !== node.entryId),
    })),
  };
}

export function normalizeGenerationProposal(proposal = {}, fallbackRevision = 0) {
  if (!proposal || typeof proposal !== 'object') return null;
  const now = new Date().toISOString();
  return {
    ...cloneGenerationValue(proposal),
    id: asString(proposal.id).trim() || createGenerationId('proposal'),
    intent: asString(proposal.intent || proposal.type, 'modify'),
    baseRevision: asNonNegativeInteger(proposal.baseRevision, fallbackRevision),
    scopeIds: uniqueStrings(proposal.scopeIds),
    summary: asString(proposal.summary),
    operations: asArray(proposal.operations)
      .filter(operation => operation && typeof operation === 'object')
      .map(cloneGenerationValue),
    affectedIds: uniqueStrings(proposal.affectedIds),
    conflicts: asArray(proposal.conflicts).map(cloneGenerationValue),
    requiredJobs: asArray(proposal.requiredJobs).map(cloneGenerationValue),
    createdAt: normalizeTimestamp(proposal.createdAt, now),
  };
}

export function normalizeGenerationJob(job = {}, fallbackRevision = 0, options = {}) {
  const now = new Date().toISOString();
  const status = GENERATION_JOB_STATUSES.includes(job.status) ? job.status : 'pending';
  return {
    ...cloneGenerationValue(job),
    jobId: asString(job.jobId || job.id).trim() || createGenerationId('job'),
    type: asString(job.type, 'unknown'),
    baseRevision: asNonNegativeInteger(job.baseRevision, fallbackRevision),
    scopeIds: uniqueStrings(job.scopeIds),
    dependsOnJobIds: uniqueStrings(job.dependsOnJobIds),
    status: options.recoverRunningJobs && status === 'running' ? 'interrupted' : status,
    attempts: asNonNegativeInteger(job.attempts, 0),
    result: job.result === undefined ? null : cloneGenerationValue(job.result),
    error: asString(job.error),
    createdAt: normalizeTimestamp(job.createdAt, now),
    updatedAt: normalizeTimestamp(job.updatedAt, now),
  };
}

export function normalizeGenerationAuditReport(audit = {}, revision = 0) {
  const sections = [audit?.deterministic, audit?.semantic].filter(
    section => section && typeof section === 'object',
  );
  const sectionErrors = sections.flatMap(section =>
    Array.isArray(section.errors)
      ? section.errors
      : asArray(section.issues).filter(issue => issue?.severity === 'error'),
  );
  const sectionWarnings = sections.flatMap(section =>
    Array.isArray(section.warnings)
      ? section.warnings
      : asArray(section.issues).filter(issue => issue?.severity === 'warning'),
  );
  return {
    errors: [...asArray(audit?.errors), ...sectionErrors].map(cloneGenerationValue),
    warnings: [...asArray(audit?.warnings), ...sectionWarnings].map(cloneGenerationValue),
    categories: audit?.categories && typeof audit.categories === 'object'
      ? cloneGenerationValue(audit.categories)
      : sections.length
        ? {
            deterministic: cloneGenerationValue(audit.deterministic),
            semantic: cloneGenerationValue(audit.semantic),
          }
        : {},
    checkedAt: typeof audit?.checkedAt === 'string' ? audit.checkedAt : null,
    revision: asNonNegativeInteger(audit?.revision, revision),
  };
}

function normalizeSource(source = {}, index = 0) {
  const scope = source.scope && typeof source.scope === 'object' ? source.scope : {};
  return {
    ...cloneGenerationValue(source),
    sourceId: asString(source.sourceId || source.id).trim() || `S${String(index + 1).padStart(3, '0')}`,
    title: asString(source.title),
    content: asString(source.content),
    scope: {
      type: ['global', 'branch', 'entries'].includes(scope.type) ? scope.type : 'global',
      ids: uniqueStrings(scope.ids),
    },
    version: Math.max(1, asNonNegativeInteger(source.version, 1)),
    supersedes: asString(source.supersedes).trim() || null,
  };
}

function normalizeEntryDraft(entry = {}, index = 0) {
  const entryId = asString(entry.entryId || entry.nodeId).trim() || `E${String(index + 1).padStart(3, '0')}`;
  return {
    ...cloneGenerationValue(entry),
    entryId,
    nodeId: entryId,
    stale: entry.stale === true,
  };
}

function normalizeRevisionHistory(history = {}) {
  return {
    undo: asArray(history?.undo).slice(-100).map(cloneGenerationValue),
    redo: asArray(history?.redo).slice(-100).map(cloneGenerationValue),
  };
}

export function normalizeGenerationProject(project = {}, options = {}) {
  const now = new Date().toISOString();
  const createdAt = normalizeTimestamp(project.createdAt, now);
  const revision = asNonNegativeInteger(project.revision, 0);
  const targetType = GENERATION_PROJECT_TARGET_TYPES.includes(project.target?.type)
    ? project.target.type
    : 'export';
  const stage = GENERATION_PROJECT_STAGES.includes(project.stage) ? project.stage : 'prepare';
  const hasAuditCollection = Array.isArray(project.audits);
  const audits = hasAuditCollection
    ? project.audits.map(cloneGenerationValue)
    : project.audits && typeof project.audits === 'object'
      ? [cloneGenerationValue(project.audits)]
      : [];
  if (!hasAuditCollection && project.audit && audits.length === 0) audits.push(cloneGenerationValue(project.audit));

  return {
    schemaVersion: GENERATION_PROJECT_SCHEMA_VERSION,
    id: asString(project.id).trim() || createGenerationId('project'),
    name: asString(project.name).trim() || '未命名世界书生成项目',
    createdAt,
    updatedAt: normalizeTimestamp(project.updatedAt, createdAt),
    archived: project.archived === true,
    revision,
    stage,
    goal: asString(project.goal),
    scalePreference: ['auto', 'small', 'medium', 'large'].includes(project.scalePreference)
      ? project.scalePreference
      : 'auto',
    target: {
      ...(project.target && typeof project.target === 'object' ? cloneGenerationValue(project.target) : {}),
      type: targetType,
      lorebookName: asString(project.target?.lorebookName),
    },
    sources: asArray(project.sources).map(normalizeSource),
    projectRules: asArray(project.projectRules).map(cloneGenerationValue),
    conversations: asArray(project.conversations).map(cloneGenerationValue),
    conversationSummary: asString(project.conversationSummary),
    conversationSummaryCount: asNonNegativeInteger(project.conversationSummaryCount, 0),
    blueprint: normalizeGenerationBlueprint(project.blueprint),
    entryDrafts: asArray(project.entryDrafts).map(normalizeEntryDraft),
    existingWorldbookBaseline:
      project.existingWorldbookBaseline === undefined ? null : cloneGenerationValue(project.existingWorldbookBaseline),
    lastApplyResult: project.lastApplyResult === undefined ? null : cloneGenerationValue(project.lastApplyResult),
    audit: normalizeGenerationAuditReport(project.audit || audits.at(-1), revision),
    audits,
    jobs: asArray(project.jobs).map(job =>
      normalizeGenerationJob(job, revision, { recoverRunningJobs: options.recoverRunningJobs === true }),
    ),
    pendingProposal: normalizeGenerationProposal(project.pendingProposal, revision),
    revisionHistory: normalizeRevisionHistory(project.revisionHistory),
  };
}

export function createGenerationProject(input = {}) {
  const now = new Date().toISOString();
  return normalizeGenerationProject({
    ...cloneGenerationValue(input),
    id: input.id || createGenerationId('project'),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    revision: 0,
    archived: false,
    pendingProposal: null,
    revisionHistory: { undo: [], redo: [] },
  });
}
