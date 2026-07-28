import { WORLD_BOOK_YAML_POSITIONS, worldbookEntryToYamlDocument } from './worldbookYaml.js';

const HARD_CATEGORIES = new Set(['architecture', 'activation', 'position', 'order', 'xml', 'format']);
const PARENT_ROLES = new Set(['root', 'domain', 'conditional']);
const BROAD_KEYWORDS = new Set(['世界', '人物', '组织', '地点', '规则', '历史', '事件', '物品', '其他']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nodeIdOf(node, index = 0) {
  return String(node?.nodeId ?? node?.entryId ?? node?.id ?? `node-${index}`);
}

function titleOf(value) {
  return String(value?.name ?? value?.title ?? value?.trigger?.Title ?? '').trim();
}

function positionOf(value) {
  if (typeof value?.trigger?.position === 'string') {
    return {
      type: value.trigger.position,
      depth: Number(value.trigger.depth ?? 0),
      role: value.trigger.position.startsWith('At Depth as ') ? value.trigger.position.slice(12).toLowerCase() : null,
      order: Number(value.trigger.order),
    };
  }
  return {
    type: value?.position?.type ?? value?.position,
    depth: Number(value?.position?.depth ?? value?.depth ?? 0),
    role: value?.position?.role ?? null,
    order: Number(value?.position?.order ?? value?.order),
  };
}

function keywordsOf(value) {
  const raw =
    value?.strategy?.keys ??
    value?.trigger?.keys ??
    value?.trigger?.Comma_separated_list ??
    value?.keywords ??
    value?.keys ??
    [];
  const values = Array.isArray(raw) ? raw : String(raw || '').split(',');
  return [...new Set(values.map(key => (key instanceof RegExp ? key.source : String(key)).trim()).filter(Boolean))];
}

function isNormal(value) {
  const type = value?.strategy?.type ?? value?.trigger?.type ?? value?.triggerType ?? value?.type;
  return ['Normal', 'normal', 'selective'].includes(type);
}

function xmlOf(node) {
  return {
    groupId: node?.xml?.groupId ?? null,
    tag: node?.xml?.tag ?? null,
    boundary: node?.xml?.boundary ?? 'none',
  };
}

function extractBlueprint(input) {
  if (Array.isArray(input)) return { scale: null, nodes: input };
  if (input?.blueprint) {
    return {
      scale: input.blueprint.scale ?? input.scale ?? null,
      nodes: asArray(input.blueprint.nodes),
    };
  }
  return {
    scale: input?.scale ?? null,
    nodes: asArray(input?.nodes),
  };
}

function createCollector() {
  const issues = [];
  const add = (severity, category, code, message, nodeIds = []) => {
    issues.push({
      id: `${category}.${code}.${issues.length + 1}`,
      severity,
      category,
      code,
      message,
      nodeIds: asArray(nodeIds).filter(Boolean).map(String),
    });
  };
  return {
    issues,
    error(category, code, message, nodeIds) {
      add('error', category, code, message, nodeIds);
    },
    warning(category, code, message, nodeIds) {
      add('warning', category, code, message, nodeIds);
    },
  };
}

function finalize(collector) {
  const errors = collector.issues.filter(issue => issue.severity === 'error');
  const warnings = collector.issues.filter(issue => issue.severity === 'warning');
  const byCategory = {};
  collector.issues.forEach(issue => {
    if (!byCategory[issue.category]) byCategory[issue.category] = { errors: 0, warnings: 0 };
    byCategory[issue.category][issue.severity === 'error' ? 'errors' : 'warnings'] += 1;
  });
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues: collector.issues,
    summary: {
      errorCount: errors.length,
      warningCount: warnings.length,
      byCategory,
    },
  };
}

function auditTitles(values, collector) {
  const seen = new Map();
  values.forEach((value, index) => {
    const id = nodeIdOf(value, index);
    const title = titleOf(value);
    if (!title) {
      collector.error('format', 'missing-title', `条目 ${id} 缺少标题。`, [id]);
      return;
    }
    if (seen.has(title)) {
      collector.error('format', 'duplicate-title', `标题“${title}”重复。`, [seen.get(title), id]);
    } else {
      seen.set(title, id);
    }
  });
}

function auditTriggerFields(values, collector) {
  values.forEach((value, index) => {
    const id = nodeIdOf(value, index);
    if (isNormal(value) && keywordsOf(value).length === 0) {
      collector.error('activation', 'normal-without-keywords', `Normal 条目“${titleOf(value) || id}”没有主关键词。`, [
        id,
      ]);
    }
    keywordsOf(value).forEach(keyword => {
      if (BROAD_KEYWORDS.has(keyword)) {
        collector.warning('activation', 'broad-keyword', `条目“${titleOf(value) || id}”使用了过宽关键词“${keyword}”。`, [
          id,
        ]);
      }
    });
  });
}

function auditArchitecture(scale, nodes, collector) {
  const byId = new Map(nodes.map((node, index) => [nodeIdOf(node, index), node]));
  const children = new Map(nodes.map((node, index) => [nodeIdOf(node, index), []]));
  nodes.forEach((node, index) => {
    const id = nodeIdOf(node, index);
    if (!node?.parentId) return;
    if (!byId.has(String(node.parentId))) {
      collector.error('architecture', 'missing-parent', `节点“${titleOf(node) || id}”引用了不存在的父节点。`, [
        id,
        node.parentId,
      ]);
      return;
    }
    children.get(String(node.parentId)).push(id);
  });

  const roots = nodes.filter(node => !node?.parentId);
  if (scale === 'small') {
    const hierarchical = nodes.filter(node => node?.parentId || PARENT_ROLES.has(node?.role));
    if (hierarchical.length > 0) {
      collector.error(
        'architecture',
        'small-has-hierarchy',
        '小型架构必须平铺，不能设置父子关系或总点。',
        hierarchical.map((node, index) => nodeIdOf(node, index)),
      );
    }
  }

  if (scale === 'medium') {
    if (roots.length !== 1) {
      collector.error('architecture', 'medium-root-count', '中型架构必须且只能有一个根总点。', roots.map(nodeIdOf));
    }
    nodes.forEach((node, index) => {
      const id = nodeIdOf(node, index);
      const parent = node?.parentId ? byId.get(String(node.parentId)) : null;
      if (parent?.parentId) {
        collector.error('architecture', 'medium-nested-parent', '中型架构只能有“一个总点 → 直属分点”一套层级。', [
          id,
          String(node.parentId),
        ]);
      }
    });
  }

  if (scale === 'large') {
    if (roots.length !== 1) {
      collector.error('architecture', 'large-root-count', '大型架构必须且只能有一个世界根总点。', roots.map(nodeIdOf));
    }
    const rootId = roots.length === 1 ? nodeIdOf(roots[0]) : null;
    const domains = rootId ? children.get(rootId) || [] : [];
    if (domains.length < 2) {
      collector.error('architecture', 'large-domain-count', '大型架构必须由世界根总点统领多个领域。', [
        rootId,
      ]);
    }
  }

  nodes.forEach((node, index) => {
    const id = nodeIdOf(node, index);
    if (PARENT_ROLES.has(node?.role) && (children.get(id) || []).length === 0) {
      collector.error('architecture', 'empty-parent', `总点“${titleOf(node) || id}”没有任何直属分点。`, [id]);
    }
  });

  return { byId, children };
}

function auditConditionalCoverage(nodes, children, byId, collector) {
  nodes.forEach((node, index) => {
    if (node?.role !== 'conditional') return;
    const id = nodeIdOf(node, index);
    const parentKeys = new Set(keywordsOf(node));
    const missingChildren = (children.get(id) || []).filter(childId => {
      const childKeys = keywordsOf(byId.get(childId));
      return childKeys.length > 0 && !childKeys.some(key => parentKeys.has(key));
    });
    if (missingChildren.length > 0) {
      collector.error(
        'activation',
        'conditional-keyword-coverage',
        `条件式总点“${titleOf(node) || id}”没有覆盖全部直属分点的主要触发词。`,
        [id, ...missingChildren],
      );
    }
  });
}

function coordinateKey(node) {
  const position = positionOf(node);
  return `${position.type ?? ''}|${position.depth}|${position.role ?? ''}`;
}

function auditXml(nodes, collector) {
  const groups = new Map();
  nodes.forEach((node, index) => {
    const xml = xmlOf(node);
    if (!xml.groupId) return;
    if (!groups.has(xml.groupId)) groups.set(xml.groupId, []);
    groups.get(xml.groupId).push({ node, id: nodeIdOf(node, index), xml, position: positionOf(node) });
  });

  const intervals = [];
  for (const [groupId, members] of groups) {
    const open = members.filter(member => member.xml.boundary === 'open');
    const close = members.filter(member => member.xml.boundary === 'close');
    if (open.length !== 1 || close.length !== 1) {
      collector.error('xml', 'boundary-count', `XML 组“${groupId}”必须恰好有一个开始边界和一个结束边界。`, [
        ...members.map(member => member.id),
      ]);
      continue;
    }
    if (!open[0].xml.tag || open[0].xml.tag !== close[0].xml.tag) {
      collector.error('xml', 'tag-mismatch', `XML 组“${groupId}”的开闭标签不一致。`, [open[0].id, close[0].id]);
    }

    const coordinateKeys = new Set(members.map(member => coordinateKey(member.node)));
    if (coordinateKeys.size !== 1) {
      collector.error('position', 'xml-coordinate-mismatch', `XML 组“${groupId}”的 position、depth 或 role 不一致。`, [
        ...members.map(member => member.id),
      ]);
    }

    const invalidOrder = members.filter(member => !Number.isFinite(member.position.order));
    if (invalidOrder.length > 0) {
      collector.error('order', 'missing-order', `XML 组“${groupId}”存在缺失或非法 order。`, invalidOrder.map(member => member.id));
      continue;
    }
    const body = members.filter(member => !['open', 'close'].includes(member.xml.boundary));
    const openOrder = open[0].position.order;
    const closeOrder = close[0].position.order;
    if (body.some(member => member.position.order <= openOrder)) {
      collector.error('order', 'open-order', `XML 组“${groupId}”的开始边界必须早于全部组内条目。`, [
        open[0].id,
        ...body.map(member => member.id),
      ]);
    }
    if (body.some(member => member.position.order >= closeOrder)) {
      collector.error('order', 'close-order', `XML 组“${groupId}”的结束边界必须晚于全部组内条目。`, [
        close[0].id,
        ...body.map(member => member.id),
      ]);
    }
    intervals.push({
      groupId,
      coordinate: coordinateKey(open[0].node),
      start: openOrder,
      end: closeOrder,
      ids: members.map(member => member.id),
    });
  }

  for (let leftIndex = 0; leftIndex < intervals.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < intervals.length; rightIndex += 1) {
      const left = intervals[leftIndex];
      const right = intervals[rightIndex];
      if (left.coordinate !== right.coordinate) continue;
      const crosses =
        (left.start < right.start && right.start < left.end && left.end < right.end) ||
        (right.start < left.start && left.start < right.end && right.end < left.end);
      if (crosses) {
        collector.error('xml', 'crossed-groups', `XML 组“${left.groupId}”与“${right.groupId}”发生交叉嵌套。`, [
          ...left.ids,
          ...right.ids,
        ]);
      }
    }
  }
}

function auditEntryFormat(entries, collector) {
  entries.forEach((entry, index) => {
    const id = nodeIdOf(entry, index);
    try {
      const document = worldbookEntryToYamlDocument(entry);
      if (!WORLD_BOOK_YAML_POSITIONS.includes(document.trigger.position)) {
        collector.error('format', 'invalid-position', `条目“${titleOf(entry) || id}”的位置枚举非法。`, [id]);
      }
    } catch (error) {
      collector.error('format', 'invalid-entry', `条目“${titleOf(entry) || id}”格式非法：${error.message}`, [id]);
    }
    if (!String(entry?.content ?? '').trim()) {
      collector.error('format', 'empty-content', `条目“${titleOf(entry) || id}”正文为空。`, [id]);
    } else if (String(entry.content).trim().length < 20) {
      collector.warning('content', 'thin-content', `条目“${titleOf(entry) || id}”正文可能过于简略。`, [id]);
    }
  });
}

export function auditGenerationBlueprint(input) {
  const { scale, nodes } = extractBlueprint(input);
  const collector = createCollector();
  if (!['small', 'medium', 'large'].includes(scale)) {
    collector.error('architecture', 'invalid-scale', '蓝图必须指定 small、medium 或 large 架构规模。');
  }
  if (nodes.length === 0) {
    collector.error('architecture', 'empty-blueprint', '蓝图没有任何节点。');
    return finalize(collector);
  }
  auditTitles(nodes, collector);
  auditTriggerFields(nodes, collector);
  const { byId, children } = auditArchitecture(scale, nodes, collector);
  auditConditionalCoverage(nodes, children, byId, collector);
  auditXml(nodes, collector);
  return finalize(collector);
}

export function auditGeneratedEntries(entries, { blueprint = null } = {}) {
  const values = asArray(entries);
  const collector = createCollector();
  if (values.length === 0) {
    collector.error('format', 'empty-entries', '没有任何生成条目。');
    return finalize(collector);
  }
  auditTitles(values, collector);
  auditTriggerFields(values, collector);
  auditEntryFormat(values, collector);

  const blueprintNodes = extractBlueprint(blueprint).nodes;
  if (blueprintNodes.length > 0) {
    const entryIds = new Set(values.map((entry, index) => nodeIdOf(entry, index)));
    const selectedNodes = blueprintNodes.filter(
      (node, index) => entryIds.has(nodeIdOf(node, index)) || values.some(entry => entry?.entryId === node?.entryId),
    );
    auditXml(selectedNodes.length > 0 ? selectedNodes : blueprintNodes, collector);
  } else {
    auditXml(values, collector);
  }
  return finalize(collector);
}

export function auditGenerationProject(project) {
  const blueprintReport = auditGenerationBlueprint(project?.blueprint ?? project);
  const entriesReport = project?.entryDrafts?.length
    ? auditGeneratedEntries(project.entryDrafts, { blueprint: project.blueprint })
    : { valid: true, errors: [], warnings: [], issues: [], summary: { errorCount: 0, warningCount: 0, byCategory: {} } };
  const collector = createCollector();
  collector.issues.push(...blueprintReport.issues, ...entriesReport.issues);
  return finalize(collector);
}

export function isHardGenerationIssue(issue) {
  return issue?.severity === 'error' && HARD_CATEGORIES.has(issue?.category);
}
