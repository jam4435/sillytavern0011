import { Document, Scalar, parseAllDocuments } from 'yaml';
import { z } from 'zod';
import { normalizePositionSelection } from '../position.js';

export const WORLD_BOOK_YAML_POSITIONS = Object.freeze([
  'Before Character Definition',
  'After Character Definition',
  'Before Example Messages',
  'After Example Messages',
  'Before Author Note',
  'After Author Note',
  'At Depth as System',
  'At Depth as User',
  'At Depth as Assistant',
]);

export const YAML_POSITION_TO_API_POSITION = Object.freeze({
  'Before Character Definition': 'before_character_definition',
  'After Character Definition': 'after_character_definition',
  'Before Example Messages': 'before_example_messages',
  'After Example Messages': 'after_example_messages',
  'Before Author Note': 'before_author_note',
  'After Author Note': 'after_author_note',
  'At Depth as System': 'at_depth_as_system',
  'At Depth as User': 'at_depth_as_user',
  'At Depth as Assistant': 'at_depth_as_assistant',
});

export const API_POSITION_TO_YAML_POSITION = Object.freeze(
  Object.fromEntries(Object.entries(YAML_POSITION_TO_API_POSITION).map(([yamlValue, apiValue]) => [apiValue, yamlValue])),
);

const TriggerSchema = z.object({
  Title: z.string().trim().min(1, 'trigger.Title 不能为空'),
  type: z.enum(['Constant', 'Normal']),
  Comma_separated_list: z.string().default(''),
  position: z.enum(WORLD_BOOK_YAML_POSITIONS),
  depth: z.number().finite().nonnegative().default(0),
  order: z.number().finite().default(100),
});

export const WorldbookYamlDocumentSchema = z.object({
  uid: z.unknown().optional(),
  trigger: TriggerSchema,
  content: z.string().min(1, 'content 不能为空'),
  enabled: z.boolean().default(true),
  probability: z.number().finite().min(0).max(100).default(100),
});

export class WorldbookYamlError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'WorldbookYamlError';
    this.issues = issues;
  }
}

function clonePlain(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function splitKeywords(value) {
  if (Array.isArray(value)) {
    return value.map(keyword => (keyword instanceof RegExp ? keyword.source : String(keyword)).trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map(keyword => keyword.trim())
    .filter(Boolean);
}

function uniqueKeywords(keywords) {
  return [...new Set(splitKeywords(keywords))];
}

function formatZodError(error) {
  if (typeof z.prettifyError === 'function') {
    return z.prettifyError(error);
  }
  return error.issues.map(issue => `${issue.path.join('.') || '文档'}: ${issue.message}`).join('; ');
}

/**
 * 兼容旧导出：旧格式可能连续输出多个以 uid 开头的文档，却没有 `---`。
 * 新协议不输出 uid，此兼容只发生在解析入口。
 */
export function normalizeWorldbookYamlText(yamlText) {
  const normalized = String(yamlText || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '  ');
  if (/^\s*---(?:\s|$)/m.test(normalized)) {
    return normalized;
  }

  const parts = normalized
    .split(/(?=^uid:\s*[^\n]*$)/m)
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts.map(part => `---\n${part}`).join('\n') : normalized;
}

export function validateWorldbookYamlDocument(value, documentIndex = 0) {
  const result = WorldbookYamlDocumentSchema.safeParse(value);
  if (!result.success) {
    throw new WorldbookYamlError(`第 ${documentIndex + 1} 个 YAML 条目不符合协议：${formatZodError(result.error)}`, [
      ...result.error.issues,
    ]);
  }

  const parsed = result.data;
  const keys = splitKeywords(parsed.trigger.Comma_separated_list);
  if (parsed.trigger.type === 'Normal' && keys.length === 0) {
    throw new WorldbookYamlError(`第 ${documentIndex + 1} 个 YAML 条目“${parsed.trigger.Title}”是 Normal，但没有主关键词。`, [
      {
        code: 'custom',
        path: ['trigger', 'Comma_separated_list'],
        message: 'Normal 条目必须至少有一个主关键词',
      },
    ]);
  }

  return {
    trigger: {
      ...parsed.trigger,
      Comma_separated_list: keys.join(','),
    },
    content: parsed.content,
    enabled: parsed.enabled,
    probability: parsed.probability,
  };
}

export function parseWorldbookYaml(yamlText) {
  const normalized = normalizeWorldbookYamlText(yamlText);
  if (!normalized.trim()) {
    throw new WorldbookYamlError('YAML 内容不能为空。');
  }

  let documents;
  try {
    documents = parseAllDocuments(normalized, { prettyErrors: true });
  } catch (error) {
    throw new WorldbookYamlError(`YAML 解析失败：${error.message}`);
  }

  const values = [];
  documents.forEach((document, index) => {
    if (document.errors.length > 0) {
      throw new WorldbookYamlError(`第 ${index + 1} 个 YAML 文档解析失败：${document.errors[0].message}`, document.errors);
    }
    const value = document.toJS();
    if (value === null || value === undefined) return;
    values.push(validateWorldbookYamlDocument(value, index));
  });

  if (values.length === 0) {
    throw new WorldbookYamlError('未找到任何有效的 YAML 条目。');
  }
  return values;
}

export function yamlDocumentToWorldbookEntry(documentValue, { uid } = {}) {
  const document = validateWorldbookYamlDocument(documentValue);
  const selection = normalizePositionSelection(YAML_POSITION_TO_API_POSITION[document.trigger.position]);
  const entry = {
    name: document.trigger.Title,
    content: document.content,
    enabled: document.enabled,
    probability: document.probability,
    strategy: {
      type: document.trigger.type === 'Constant' ? 'constant' : 'selective',
      keys: splitKeywords(document.trigger.Comma_separated_list),
      keys_secondary: {
        logic: 'and_any',
        keys: [],
      },
      scan_depth: 'same_as_global',
    },
    position: {
      type: selection.type,
      depth: document.trigger.depth,
      order: document.trigger.order,
    },
    recursion: {
      prevent_incoming: false,
      prevent_outgoing: false,
      delay_until: null,
    },
    effect: {
      sticky: null,
      cooldown: null,
      delay: null,
    },
  };
  if (selection.type === 'at_depth') {
    entry.position.role = selection.role;
  }
  if (Number.isInteger(uid)) {
    entry.uid = uid;
  }
  return entry;
}

export function worldbookEntryToYamlDocument(entry) {
  const selection = normalizePositionSelection(entry?.position);
  const positionKey = selection.type === 'at_depth' ? selection.value : selection.type;
  const document = {
    trigger: {
      Title: String(entry?.name ?? entry?.title ?? '').trim(),
      type: entry?.strategy?.type === 'constant' ? 'Constant' : 'Normal',
      Comma_separated_list: uniqueKeywords(entry?.strategy?.keys ?? entry?.keys).join(','),
      position: API_POSITION_TO_YAML_POSITION[positionKey],
      depth: Number(entry?.position?.depth ?? 0),
      order: Number(entry?.position?.order ?? 100),
    },
    content: String(entry?.content ?? ''),
    enabled: entry?.enabled !== false,
    probability: Number(entry?.probability ?? 100),
  };
  return validateWorldbookYamlDocument(document);
}

function serializeDocument(documentValue) {
  const value = validateWorldbookYamlDocument(documentValue);
  const document = new Document(value);
  const contentNode = document.getIn(['content'], true);
  if (contentNode && typeof contentNode === 'object') {
    contentNode.type = Scalar.BLOCK_LITERAL;
  }
  return `---\n${document.toString({ indent: 2, lineWidth: 0 })}`.trimEnd();
}

export function serializeWorldbookYaml(entries, { input = 'entry' } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new WorldbookYamlError('没有可序列化的世界书条目。');
  }
  return entries
    .map(entry => serializeDocument(input === 'document' ? entry : worldbookEntryToYamlDocument(entry)))
    .join('\n');
}

function nodeIdOf(node) {
  return node?.nodeId ?? node?.entryId ?? node?.id ?? null;
}

function entryNodeId(entry) {
  return entry?.nodeId ?? entry?.entryId ?? entry?.extra?.generation?.nodeId ?? entry?.extra?.generationNodeId ?? null;
}

function nodeKeys(node) {
  return uniqueKeywords(node?.strategy?.keys ?? node?.trigger?.keys ?? node?.trigger?.Comma_separated_list ?? node?.keywords);
}

/**
 * 为条件 XML 组应用可移植保底触发：开、闭边界都继承组内直属分点的主关键词。
 * 返回深拷贝，不修改调用方的草稿。
 */
export function applyXmlFallbackKeywords(entries, blueprintOrNodes) {
  const nodes = Array.isArray(blueprintOrNodes)
    ? blueprintOrNodes
    : blueprintOrNodes?.nodes ?? blueprintOrNodes?.blueprint?.nodes ?? [];
  const nextEntries = clonePlain(Array.isArray(entries) ? entries : []);
  const nodeById = new Map(nodes.map(node => [nodeIdOf(node), node]));
  const groups = new Map();

  nodes.forEach(node => {
    const groupId = node?.xml?.groupId;
    if (!groupId) return;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(node);
  });

  for (const groupNodes of groups.values()) {
    const openNodes = groupNodes.filter(node => node?.xml?.boundary === 'open');
    const closeNodes = groupNodes.filter(node => node?.xml?.boundary === 'close');
    if (openNodes.length === 0 || closeNodes.length === 0) continue;

    const parentIds = new Set(openNodes.map(nodeIdOf));
    const directBodyNodes = groupNodes.filter(node => {
      const boundary = node?.xml?.boundary ?? 'none';
      return !['open', 'close'].includes(boundary) && (!node?.parentId || parentIds.has(node.parentId));
    });
    const sharedKeys = uniqueKeywords(directBodyNodes.flatMap(nodeKeys));
    if (sharedKeys.length === 0) continue;

    const boundaryIds = new Set([...openNodes, ...closeNodes].map(nodeIdOf));
    nextEntries.forEach(entry => {
      const linkedNode = nodeById.get(entryNodeId(entry));
      const isBoundary =
        boundaryIds.has(entryNodeId(entry)) ||
        (linkedNode && ['open', 'close'].includes(linkedNode?.xml?.boundary)) ||
        ['open', 'close'].includes(entry?.xml?.boundary);
      if (!isBoundary) return;
      entry.strategy = {
        ...(entry.strategy || {}),
        type: entry?.strategy?.type === 'constant' ? 'constant' : 'selective',
        keys: uniqueKeywords([...(entry?.strategy?.keys || []), ...sharedKeys]),
        keys_secondary: entry?.strategy?.keys_secondary || { logic: 'and_any', keys: [] },
        scan_depth: entry?.strategy?.scan_depth ?? 'same_as_global',
      };
      entry.recursion = {
        prevent_incoming: false,
        prevent_outgoing: false,
        delay_until: null,
        ...(entry.recursion || {}),
      };
    });
  }

  return nextEntries;
}
