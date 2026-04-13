import { ensureNumericUID } from '../utils.js';

// Isolated MD token badge feature: remove this file plus its imports/call sites to disable entirely.
const ENABLE_MASTER_ENTRY_TOKENS = true;
const TOKEN_PLACEHOLDER = '...';
const TOKEN_QUEUE_TIMEOUT = 240;
const TOKEN_QUEUE_DELAY = 40;

const tokenCache = new Map();
const inFlightTokenRequests = new Map();
const activeRuns = new Map();

function isFeatureEnabled() {
  return ENABLE_MASTER_ENTRY_TOKENS;
}

function getParentDoc() {
  return window.parent.document;
}

function getRunKey(lorebookName, isGlobal = false) {
  return `${isGlobal ? 'global' : 'character'}::${lorebookName || ''}`;
}

function hashText(text = '') {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildTokenSignature(entry = {}) {
  const content = `${entry?.content || ''}`;
  return `${ensureNumericUID(entry.uid)}:${content.length}:${hashText(content)}`;
}

function buildTokenPayload(tokenCount, source = 'tokenizer') {
  if (source === 'fallback') {
    return {
      text: `${tokenCount}字`,
      title: `当前显示为 ${tokenCount} 字（tokenizer 不可用，使用字符数后备）`,
      state: 'fallback',
    };
  }

  return {
    text: `${tokenCount}词符`,
    title: `当前内容约 ${tokenCount} 词符`,
    state: 'ready',
  };
}

async function computeTokenPayload(content = '') {
  const normalizedContent = `${content || ''}`;
  if (window.SillyTavern && typeof window.SillyTavern.getTokenCountAsync === 'function') {
    try {
      const tokenCount = await window.SillyTavern.getTokenCountAsync(normalizedContent);
      if (Number.isFinite(tokenCount)) {
        return buildTokenPayload(tokenCount, 'tokenizer');
      }
    } catch (error) {
      console.warn('MD 条目 token 计算失败，改用字符数后备。', error);
    }
  }

  return buildTokenPayload(normalizedContent.length, 'fallback');
}

function getTokenPayload(signature, content = '') {
  if (tokenCache.has(signature)) {
    return Promise.resolve(tokenCache.get(signature));
  }

  if (inFlightTokenRequests.has(signature)) {
    return inFlightTokenRequests.get(signature);
  }

  const request = computeTokenPayload(content)
    .then(payload => {
      tokenCache.set(signature, payload);
      return payload;
    })
    .finally(() => {
      inFlightTokenRequests.delete(signature);
    });

  inFlightTokenRequests.set(signature, request);
  return request;
}

function findBadges(lorebookName, uid, isGlobal = false, parentDoc = getParentDoc()) {
  return $('.master-entry-token', parentDoc).filter(function () {
    const $badge = $(this);
    return ensureNumericUID($badge.attr('data-entry-uid')) === ensureNumericUID(uid)
      && ($badge.attr('data-entry-lorebook') || '') === `${lorebookName || ''}`
      && (($badge.attr('data-is-global') || 'false') === (isGlobal ? 'true' : 'false'));
  });
}

function setBadgePending($badges, signature) {
  $badges.each(function () {
    const $badge = $(this);
    if ($badge.attr('data-token-signature') === signature && $badge.attr('data-token-state') === 'ready') {
      return;
    }
    $badge
      .attr('data-token-signature', signature)
      .attr('data-token-state', 'pending')
      .attr('title', '词符计算中')
      .text(TOKEN_PLACEHOLDER);
  });
}

function applyBadgePayload(lorebookName, uid, isGlobal, signature, payload) {
  const $badges = findBadges(lorebookName, uid, isGlobal);
  if (!$badges.length) {
    return;
  }

  $badges.each(function () {
    const $badge = $(this);
    if (($badge.attr('data-token-signature') || '') !== signature) {
      return;
    }
    $badge
      .attr('data-token-state', payload.state || 'ready')
      .attr('title', payload.title || '')
      .text(payload.text || TOKEN_PLACEHOLDER);
  });
}

export function buildMasterEntryTokenBadgeHtml(entry, lorebookName, isGlobal = false) {
  if (!isFeatureEnabled()) {
    return '';
  }

  return `
    <span
      class="master-entry-token"
      data-entry-uid="${ensureNumericUID(entry?.uid)}"
      data-entry-lorebook="${lorebookName || ''}"
      data-is-global="${isGlobal ? 'true' : 'false'}"
      data-token-state="pending"
      title="词符计算中"
    >${TOKEN_PLACEHOLDER}</span>
  `;
}

function cancelRunTimer(run) {
  if (!run?.scheduled) {
    return;
  }

  if (run.scheduled.type === 'idle' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(run.scheduled.handle);
  } else {
    clearTimeout(run.scheduled.handle);
  }
  run.scheduled = null;
}

function scheduleRun(key) {
  const run = activeRuns.get(key);
  if (!run || run.scheduled || run.queue.length === 0) {
    return;
  }

  const callback = () => {
    run.scheduled = null;
    void processNextToken(key, run.id);
  };

  if (typeof window.requestIdleCallback === 'function') {
    run.scheduled = {
      type: 'idle',
      handle: window.requestIdleCallback(callback, { timeout: TOKEN_QUEUE_TIMEOUT }),
    };
    return;
  }

  run.scheduled = {
    type: 'timeout',
    handle: window.setTimeout(callback, TOKEN_QUEUE_DELAY),
  };
}

function sortQueueByVisibility(items = [], $container) {
  if (!$container?.length) {
    return items;
  }

  const containerRect = $container[0].getBoundingClientRect();
  const visibleItems = [];
  const hiddenItems = [];

  items.forEach(item => {
    const rowElement = item.$badge?.closest('.master-entry-item')?.get(0);
    if (!rowElement || rowElement.offsetParent === null) {
      hiddenItems.push(item);
      return;
    }

    const rect = rowElement.getBoundingClientRect();
    const isVisible = rect.bottom >= containerRect.top && rect.top <= containerRect.bottom;
    (isVisible ? visibleItems : hiddenItems).push(item);
  });

  return [...visibleItems, ...hiddenItems];
}

async function processNextToken(key, runId) {
  const run = activeRuns.get(key);
  if (!run || run.id !== runId) {
    return;
  }

  const item = run.queue.shift();
  if (!item) {
    activeRuns.delete(key);
    return;
  }

  try {
    const payload = await getTokenPayload(item.signature, item.content);
    const latestRun = activeRuns.get(key);
    if (!latestRun || latestRun.id !== runId) {
      return;
    }
    applyBadgePayload(item.lorebookName, item.uid, item.isGlobal, item.signature, payload);
  } finally {
    const latestRun = activeRuns.get(key);
    if (latestRun && latestRun.id === runId) {
      if (latestRun.queue.length === 0) {
        activeRuns.delete(key);
      } else {
        scheduleRun(key);
      }
    }
  }
}

export function scheduleMasterEntryTokenHydration($container, entries = [], lorebookName, isGlobal = false) {
  if (!isFeatureEnabled() || !$container?.length) {
    return;
  }

  const entryMap = new Map(
    (Array.isArray(entries) ? entries : []).map(entry => [ensureNumericUID(entry.uid), entry]),
  );
  const queue = [];

  $container.find('.master-entry-token').each(function () {
    const $badge = $(this);
    const uid = ensureNumericUID($badge.attr('data-entry-uid'));
    const entry = entryMap.get(uid);
    if (!entry) {
      return;
    }

    const signature = buildTokenSignature(entry);
    setBadgePending($badge, signature);

    const cached = tokenCache.get(signature);
    if (cached) {
      applyBadgePayload(lorebookName, uid, isGlobal, signature, cached);
      return;
    }

    queue.push({
      $badge,
      lorebookName,
      isGlobal,
      uid,
      content: `${entry.content || ''}`,
      signature,
    });
  });

  const key = getRunKey(lorebookName, isGlobal);
  const existingRun = activeRuns.get(key);
  if (existingRun) {
    cancelRunTimer(existingRun);
  }

  if (queue.length === 0) {
    activeRuns.delete(key);
    return;
  }

  const run = {
    id: Date.now() + Math.random(),
    queue: sortQueueByVisibility(queue, $container),
    scheduled: null,
  };
  activeRuns.set(key, run);
  scheduleRun(key);
}

export function refreshSingleMasterEntryTokenBadge(lorebookName, entry, isGlobal = false) {
  if (!isFeatureEnabled() || !entry) {
    return;
  }

  const uid = ensureNumericUID(entry.uid);
  const signature = buildTokenSignature(entry);
  const $badges = findBadges(lorebookName, uid, isGlobal);
  if (!$badges.length) {
    return;
  }

  setBadgePending($badges, signature);

  const cached = tokenCache.get(signature);
  if (cached) {
    applyBadgePayload(lorebookName, uid, isGlobal, signature, cached);
    return;
  }

  void getTokenPayload(signature, `${entry.content || ''}`).then(payload => {
    applyBadgePayload(lorebookName, uid, isGlobal, signature, payload);
  });
}
