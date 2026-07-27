const DEFAULT_RECENT_MESSAGE_COUNT = 8;
const RESERVED_ENTRY_PREFIXES = ['__WI_', '__LOREBOOK_EDITOR_'];

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getBlueprintNodes(project) {
  const blueprint = project?.blueprint;
  if (Array.isArray(blueprint)) return blueprint;
  return asArray(blueprint?.nodes || blueprint?.entries);
}

function getNodeId(node) {
  return node?.nodeId || node?.entryId || node?.id || null;
}

function getParentId(node) {
  return node?.parentId || node?.parentNodeId || null;
}

function getScopeIds(scope) {
  if (!scope || scope.type === 'global' || scope.type === 'book') return [];
  return [...new Set(asArray(scope.ids || scope.nodeIds || scope.entryIds).filter(Boolean))];
}

function collectRelatedNodeIds(nodes, scope) {
  const requestedIds = getScopeIds(scope);
  if (requestedIds.length === 0) {
    return new Set(nodes.map(getNodeId).filter(Boolean));
  }

  const nodeById = new Map(nodes.map(node => [getNodeId(node), node]).filter(([id]) => id));
  const childrenByParent = new Map();
  nodes.forEach(node => {
    const parentId = getParentId(node);
    if (!parentId) return;
    const children = childrenByParent.get(parentId) || [];
    children.push(getNodeId(node));
    childrenByParent.set(parentId, children);
  });

  const related = new Set(requestedIds);
  const pendingDescendants = [...requestedIds];
  while (pendingDescendants.length > 0) {
    const currentId = pendingDescendants.shift();
    asArray(childrenByParent.get(currentId)).forEach(childId => {
      if (childId && !related.has(childId)) {
        related.add(childId);
        pendingDescendants.push(childId);
      }
    });
  }

  requestedIds.forEach(requestedId => {
    let current = nodeById.get(requestedId);
    while (current) {
      const parentId = getParentId(current);
      if (!parentId || related.has(parentId)) break;
      related.add(parentId);
      current = nodeById.get(parentId);
    }
  });

  const groupIds = new Set(
    nodes
      .filter(node => related.has(getNodeId(node)))
      .map(node => node?.xml?.groupId)
      .filter(Boolean),
  );
  nodes.forEach(node => {
    if (node?.xml?.groupId && groupIds.has(node.xml.groupId)) {
      related.add(getNodeId(node));
    }
  });

  return related;
}

function sourceMatchesScope(source, relatedIds, requestedScopeIds) {
  const sourceScope = source?.scope;
  if (!sourceScope || sourceScope.type === 'global' || sourceScope.type === 'book') return true;
  const ids = getScopeIds(sourceScope);
  if (ids.length === 0) return true;
  return ids.some(id => relatedIds.has(id) || requestedScopeIds.has(id));
}

function isReservedEntry(entry) {
  const name = `${entry?.name || entry?.title || ''}`;
  return RESERVED_ENTRY_PREFIXES.some(prefix => name.startsWith(prefix));
}

function getDraftNodeId(draft) {
  return draft?.nodeId || draft?.entryId || draft?.blueprintNodeId || null;
}

/**
 * Build a bounded, scope-aware snapshot for one generation request.
 * Full project conversations remain persisted by the caller; only the rolling
 * summary and latest messages enter the model context.
 */
export function buildGenerationContext(project, options = {}) {
  const scope = options.scope || { type: 'global', ids: [] };
  const nodes = getBlueprintNodes(project);
  const relatedIds = collectRelatedNodeIds(nodes, scope);
  const requestedScopeIds = new Set(getScopeIds(scope));
  const relevantNodes = nodes.filter(node => relatedIds.has(getNodeId(node)));
  const relevantSources = asArray(project?.sources).filter(source =>
    sourceMatchesScope(source, relatedIds, requestedScopeIds),
  );
  const relevantDrafts = asArray(project?.entryDrafts || project?.drafts).filter(draft => {
    const nodeId = getDraftNodeId(draft);
    return !nodeId || relatedIds.has(nodeId);
  });
  const baselineEntries = asArray(
    project?.existingWorldbookBaseline?.entries ||
    project?.existingWorldbookBaseline ||
    project?.baseline?.entries ||
    project?.targetBaseline?.entries,
  )
    .filter(entry => !isReservedEntry(entry))
    .filter(entry => {
      const nodeId = getDraftNodeId(entry);
      return requestedScopeIds.size === 0 || !nodeId || relatedIds.has(nodeId);
    });
  const conversations = asArray(project?.conversations || project?.conversation);
  const recentMessageCount = Math.max(
    1,
    Number.parseInt(`${options.recentMessageCount ?? DEFAULT_RECENT_MESSAGE_COUNT}`, 10) ||
      DEFAULT_RECENT_MESSAGE_COUNT,
  );

  return {
    project: {
      id: project?.id || project?.projectId || null,
      name: project?.name || '',
      revision: Number(project?.revision || 0),
      scale: project?.scale || project?.blueprint?.scale || 'medium',
      goal: project?.goal || project?.description || '',
    },
    request: {
      intent: options.intent || 'discussion',
      scope: clone(scope),
      lifetime: options.lifetime || 'once',
      instruction: options.instruction || options.message || '',
    },
    rules: clone(project?.projectRules || project?.rules || []),
    sources: clone(relevantSources),
    blueprint: {
      scale: project?.blueprint?.scale || project?.scale || 'medium',
      nodes: clone(relevantNodes),
    },
    entryDrafts: clone(relevantDrafts),
    baselineEntries: clone(baselineEntries),
    audits: clone(asArray(project?.audits).slice(-3)),
    conversation: {
      summary: project?.conversationSummary || project?.summary || '',
      recentMessages: clone(conversations.slice(-recentMessageCount)),
    },
  };
}

export function serializeGenerationContext(context) {
  return JSON.stringify(context, null, 2);
}

export function getGenerationScopeNodeIds(project, scope) {
  return [...collectRelatedNodeIds(getBlueprintNodes(project), scope)];
}

export const generationContextInternals = {
  collectRelatedNodeIds,
  getBlueprintNodes,
  isReservedEntry,
};
