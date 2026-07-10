import localImageIndex from '../imageIndex.json';
import rawLoreEntries from './lore-entries.json';

type PopupApi = Pick<typeof SillyTavern, 'callGenericPopup' | 'POPUP_TYPE'>;
type ImageIndex = Record<string, string[]>;
type LoreEntryRecord = Record<string, unknown>;

type LoreEntry = {
  id: string;
  title: string;
  aliases: string[];
  category: string;
  summary: string;
  source: string;
  content: string;
  imageKeywords: string[];
  searchText: string;
  highlightTerms: string[];
};

type MessageProcessState = {
  usedTerms: Set<string>;
  appliedCount: number;
};

const SCRIPT_ID = typeof getScriptId === 'function' ? getScriptId() : 'jm-lore-browser';
const UI_ROOT_ID = `jm-lore-browser-root-${SCRIPT_ID}`;
const STYLE_ID = `jm-lore-browser-style-${SCRIPT_ID}`;
const FALLBACK_MODAL_ID = `jm-lore-browser-modal-${SCRIPT_ID}`;
const HIGHLIGHT_CLASS = 'jm-lore-highlight';
const MAX_HIGHLIGHTS_PER_MESSAGE = 12;
const MAX_SEARCH_RESULTS = 80;
const REMOTE_IMAGE_INDEX_URLS = [
  'https://raw.githubusercontent.com/jam4435/sillytavern0011/main/src/JM/imageIndex.json',
  'https://cdn.jsdelivr.net/gh/jam4435/sillytavern0011@main/src/JM/imageIndex.json',
];
const IMAGE_BASE_URLS = [
  'https://raw.githubusercontent.com/jam4435/my-image-hosting/main/JM/',
  'https://cdn.jsdelivr.net/gh/jam4435/my-image-hosting@main/JM/',
  'https://raw.githubusercontent.com/jam4435/sillytavern0011/main/src/JM/',
];

let loreEntries: LoreEntry[] = [];
let termToEntry = new Map<string, LoreEntry>();
let sortedHighlightTerms: string[] = [];
let activeImageIndexPromise: Promise<ImageIndex> | null = null;
let highlightTimer: number | null = null;
let destroyed = false;

function init() {
  loreEntries = normalizeLoreEntries(rawLoreEntries);
  buildHighlightIndex(loreEntries);
  mountUi();
  scheduleRefreshVisibleMessages();

  eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, onSingleMessageEvent);
  eventOn(tavern_events.MESSAGE_UPDATED, onSingleMessageEvent);
  eventOn(tavern_events.MESSAGE_SWIPED, onSingleMessageEvent);
  eventOn(tavern_events.MORE_MESSAGES_LOADED, () => scheduleRefreshVisibleMessages());
  $(window).on('pagehide', destroy);

  console.info('[JM设定百科脚本] initialized', {
    entryCount: loreEntries.length,
    termCount: sortedHighlightTerms.length,
  });
}

function onSingleMessageEvent(messageId?: unknown) {
  if (typeof messageId === 'number' && Number.isFinite(messageId)) {
    scheduleRefreshMessage(messageId);
    return;
  }

  scheduleRefreshVisibleMessages();
}

function destroy() {
  if (destroyed) {
    return;
  }

  destroyed = true;
  if (highlightTimer !== null) {
    window.clearTimeout(highlightTimer);
    highlightTimer = null;
  }

  $(`#${UI_ROOT_ID}`).remove();
  $(`#${FALLBACK_MODAL_ID}`).remove();
  $(`#${STYLE_ID}`).remove();
  $('.mes_text').each((_, element) => clearHighlights(element as HTMLElement));
  $(window).off('pagehide', destroy);
  $(document).off(`keydown.${SCRIPT_ID}`);

  console.info('[JM设定百科脚本] destroyed');
}

function mountUi() {
  ensureStyleMounted();

  const $root = $('<div>').attr('id', UI_ROOT_ID);
  const $button = $('<button>')
    .attr({
      type: 'button',
      class: 'jm-lore-fab',
      title: '设定百科',
      'aria-label': '打开设定百科搜索面板',
      'aria-expanded': 'false',
    })
    .text('设')
    .on('click', () => {
      const $panel = $root.find('.jm-lore-panel');
      const nextOpen = !$panel.hasClass('is-open');
      $panel.toggleClass('is-open', nextOpen);
      $button.attr('aria-expanded', String(nextOpen));

      if (nextOpen) {
        const input = $root.find('.jm-lore-search-input').get(0) as HTMLInputElement | undefined;
        input?.focus();
        input?.select();
      }
    });

  const $panel = $('<section>').addClass('jm-lore-panel').attr({
    role: 'dialog',
    'aria-label': '设定百科搜索面板',
  });

  const $header = $('<div>').addClass('jm-lore-panel-header');
  const $title = $('<div>').addClass('jm-lore-panel-title').text('设定百科');
  const $close = $('<button>')
    .attr({ type: 'button', class: 'jm-lore-icon-button', title: '关闭' })
    .text('×')
    .on('click', () => {
      $panel.removeClass('is-open');
      $button.attr('aria-expanded', 'false');
    });
  $header.append($title, $close);

  const $input = $('<input>')
    .attr({
      type: 'search',
      class: 'jm-lore-search-input',
      placeholder: '搜索标题 / 别名 / 分类',
      autocomplete: 'off',
      spellcheck: 'false',
    })
    .on('input', event => {
      const value = String((event.currentTarget as HTMLInputElement).value ?? '');
      renderSearchResults($results, value);
    });

  const $meta = $('<div>')
    .addClass('jm-lore-panel-meta')
    .text(`已加载 ${loreEntries.length} 个词条`);

  const $results = $('<div>').addClass('jm-lore-results');

  $panel.append($header, $input, $meta, $results);
  $root.append($button, $panel);
  $('body').append($root);

  renderSearchResults($results, '');

  $(document).on(`keydown.${SCRIPT_ID}`, event => {
    if (event.key === 'Escape') {
      $panel.removeClass('is-open');
      $button.attr('aria-expanded', 'false');
      document.getElementById(FALLBACK_MODAL_ID)?.classList.remove('is-open');
    }
  });
}

function ensureStyleMounted() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${UI_ROOT_ID} {
      position: fixed;
      right: 20px;
      bottom: 96px;
      z-index: 2147483000;
      font-family: var(--mainFontFamily, inherit);
    }

    #${UI_ROOT_ID} .jm-lore-fab {
      width: 44px;
      height: 44px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 999px;
      background: rgba(28, 31, 38, 0.92);
      color: #f5f7fb;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      font-size: 16px;
      font-weight: 700;
    }

    #${UI_ROOT_ID} .jm-lore-panel {
      position: absolute;
      right: 0;
      bottom: 56px;
      width: min(360px, calc(100vw - 24px));
      max-height: min(70vh, 720px);
      display: none;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      background: rgba(18, 20, 25, 0.96);
      color: #edf2ff;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.36);
      backdrop-filter: blur(12px);
    }

    #${UI_ROOT_ID} .jm-lore-panel.is-open {
      display: flex;
    }

    #${UI_ROOT_ID} .jm-lore-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    #${UI_ROOT_ID} .jm-lore-panel-title {
      font-size: 14px;
      font-weight: 800;
    }

    #${UI_ROOT_ID} .jm-lore-icon-button,
    #${UI_ROOT_ID} .jm-lore-entry-button {
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      color: inherit;
      cursor: pointer;
    }

    #${UI_ROOT_ID} .jm-lore-icon-button {
      width: 30px;
      height: 30px;
      font-size: 18px;
      line-height: 1;
    }

    #${UI_ROOT_ID} .jm-lore-search-input {
      width: 100%;
      padding: 9px 10px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: inherit;
      outline: none;
    }

    #${UI_ROOT_ID} .jm-lore-panel-meta {
      font-size: 12px;
      opacity: 0.72;
    }

    #${UI_ROOT_ID} .jm-lore-results {
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-y: auto;
      min-height: 0;
    }

    #${UI_ROOT_ID} .jm-lore-empty {
      padding: 14px 10px;
      border: 1px dashed rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      font-size: 12px;
      opacity: 0.76;
      text-align: center;
    }

    #${UI_ROOT_ID} .jm-lore-entry-button {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      padding: 10px;
      text-align: left;
    }

    #${UI_ROOT_ID} .jm-lore-entry-title {
      font-size: 13px;
      font-weight: 700;
    }

    #${UI_ROOT_ID} .jm-lore-entry-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 11px;
      opacity: 0.78;
    }

    #${UI_ROOT_ID} .jm-lore-chip {
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      white-space: nowrap;
    }

    #${UI_ROOT_ID} .jm-lore-entry-summary {
      font-size: 12px;
      line-height: 1.55;
      opacity: 0.92;
    }

    .${HIGHLIGHT_CLASS} {
      display: inline;
      margin: 0;
      padding: 0 0.1em;
      border: 0;
      border-radius: 4px;
      background: rgba(126, 177, 255, 0.2);
      color: inherit;
      cursor: pointer;
      text-decoration: none;
      box-shadow: inset 0 -1px 0 rgba(126, 177, 255, 0.38);
    }

    .${HIGHLIGHT_CLASS}:hover {
      background: rgba(126, 177, 255, 0.32);
    }

    #${FALLBACK_MODAL_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.56);
    }

    #${FALLBACK_MODAL_ID}.is-open {
      display: flex;
    }

    #${FALLBACK_MODAL_ID} .jm-lore-modal-card {
      width: min(760px, calc(100vw - 24px));
      max-height: min(82vh, 860px);
      overflow-y: auto;
      padding: 16px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 12px;
      background: rgba(20, 22, 28, 0.98);
      color: #edf2ff;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.42);
    }

    #${FALLBACK_MODAL_ID} .jm-lore-popup-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    #${FALLBACK_MODAL_ID} .jm-lore-popup-title {
      font-size: 18px;
      font-weight: 800;
      line-height: 1.35;
    }

    #${FALLBACK_MODAL_ID} .jm-lore-popup-summary,
    #${FALLBACK_MODAL_ID} .jm-lore-popup-content {
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
    }

    #${FALLBACK_MODAL_ID} .jm-lore-popup-image {
      width: 100%;
      max-height: 340px;
      object-fit: contain;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.04);
      margin-bottom: 14px;
    }

    #${FALLBACK_MODAL_ID} .jm-lore-popup-grid {
      display: grid;
      grid-template-columns: 84px 1fr;
      gap: 8px 12px;
      margin-bottom: 14px;
      font-size: 13px;
      line-height: 1.55;
    }

    #${FALLBACK_MODAL_ID} .jm-lore-popup-key {
      opacity: 0.72;
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
}

function renderSearchResults($container: JQuery, query: string) {
  const trimmedQuery = query.trim();
  const entries = searchLoreEntries(trimmedQuery);
  $container.empty();

  if (entries.length === 0) {
    $container.append($('<div>').addClass('jm-lore-empty').text(trimmedQuery ? '未找到匹配词条' : '暂无可显示词条'));
    return;
  }

  entries.slice(0, MAX_SEARCH_RESULTS).forEach(entry => {
    const $button = $('<button>')
      .attr({ type: 'button', class: 'jm-lore-entry-button' })
      .on('click', () => {
        void openLoreEntryPopup(entry);
      });

    const $title = $('<div>').addClass('jm-lore-entry-title').text(entry.title);
    const $meta = $('<div>').addClass('jm-lore-entry-meta');
    if (entry.category) {
      $meta.append($('<span>').addClass('jm-lore-chip').text(entry.category));
    }
    if (entry.aliases.length > 0) {
      $meta.append($('<span>').addClass('jm-lore-chip').text(`别名 ${entry.aliases.slice(0, 3).join(' / ')}`));
    }
    if (entry.source) {
      $meta.append($('<span>').addClass('jm-lore-chip').text(`来源 ${entry.source}`));
    }
    const $summary = $('<div>')
      .addClass('jm-lore-entry-summary')
      .text(truncateText(entry.summary || entry.content || '无摘要', 120));

    $button.append($title, $meta, $summary);
    $container.append($button);
  });
}

function searchLoreEntries(query: string) {
  if (!query) {
    return loreEntries.slice().sort((left, right) => left.title.localeCompare(right.title, 'zh-Hans-CN'));
  }

  const loweredQuery = query.toLocaleLowerCase();
  return loreEntries
    .map(entry => ({ entry, score: scoreEntry(entry, loweredQuery) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || right.entry.title.length - left.entry.title.length)
    .map(item => item.entry);
}

function scoreEntry(entry: LoreEntry, loweredQuery: string) {
  let score = 0;
  const loweredTitle = entry.title.toLocaleLowerCase();
  const loweredCategory = entry.category.toLocaleLowerCase();
  const loweredAliases = entry.aliases.map(alias => alias.toLocaleLowerCase());

  if (loweredTitle === loweredQuery) {
    score += 120;
  } else if (loweredTitle.includes(loweredQuery)) {
    score += 80;
  }

  if (loweredAliases.some(alias => alias === loweredQuery)) {
    score += 90;
  } else if (loweredAliases.some(alias => alias.includes(loweredQuery))) {
    score += 54;
  }

  if (loweredCategory === loweredQuery) {
    score += 44;
  } else if (loweredCategory.includes(loweredQuery)) {
    score += 24;
  }

  if (entry.searchText.includes(loweredQuery)) {
    score += 10;
  }

  return score;
}

async function openLoreEntryPopup(entry: LoreEntry) {
  const popupContent = buildPopupContent(entry);
  const popupApi = getPopupApi();

  if (popupApi?.callGenericPopup && popupApi.POPUP_TYPE) {
    await popupApi.callGenericPopup(popupContent, popupApi.POPUP_TYPE.TEXT, '', {
      okButton: '关闭',
      cancelButton: false,
      wider: true,
      large: true,
      leftAlign: true,
      allowVerticalScrolling: true,
    });
    return;
  }

  openFallbackModal(popupContent);
}

function buildPopupContent(entry: LoreEntry) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '14px';
  wrapper.style.lineHeight = '1.65';

  const header = document.createElement('div');
  header.className = 'jm-lore-popup-header';
  header.style.display = 'flex';
  header.style.alignItems = 'flex-start';
  header.style.justifyContent = 'space-between';
  header.style.gap = '12px';

  const titleBlock = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'jm-lore-popup-title';
  title.textContent = entry.title;
  title.style.fontSize = '1.15rem';
  title.style.fontWeight = '800';
  title.style.lineHeight = '1.35';
  titleBlock.appendChild(title);

  if (entry.category) {
    const category = document.createElement('div');
    category.style.marginTop = '6px';
    category.style.opacity = '0.78';
    category.textContent = entry.category;
    titleBlock.appendChild(category);
  }

  header.appendChild(titleBlock);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'jm-lore-icon-button';
  closeButton.textContent = '×';
  closeButton.style.width = '30px';
  closeButton.style.height = '30px';
  closeButton.style.border = '1px solid rgba(255, 255, 255, 0.12)';
  closeButton.style.borderRadius = '8px';
  closeButton.style.background = 'rgba(255, 255, 255, 0.05)';
  closeButton.style.color = 'inherit';
  closeButton.style.cursor = 'pointer';
  closeButton.addEventListener('click', () => {
    document.getElementById(FALLBACK_MODAL_ID)?.classList.remove('is-open');
  });
  header.appendChild(closeButton);
  wrapper.appendChild(header);

  const image = document.createElement('img');
  image.className = 'jm-lore-popup-image';
  image.alt = entry.title;
  image.hidden = true;
  image.style.width = '100%';
  image.style.maxHeight = '340px';
  image.style.objectFit = 'contain';
  image.style.borderRadius = '10px';
  image.style.background = 'rgba(255, 255, 255, 0.04)';
  wrapper.appendChild(image);
  void fillPopupImage(image, entry);

  const grid = document.createElement('div');
  grid.className = 'jm-lore-popup-grid';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '84px 1fr';
  grid.style.gap = '8px 12px';
  grid.style.fontSize = '0.95rem';
  appendPopupField(grid, '摘要', entry.summary || '无');
  appendPopupField(grid, '分类', entry.category || '无');
  appendPopupField(grid, '别名', entry.aliases.length > 0 ? entry.aliases.join(' / ') : '无');
  appendPopupField(grid, '来源', entry.source || '无');
  wrapper.appendChild(grid);

  const content = entry.content && entry.content !== entry.summary ? entry.content : '';
  if (content) {
    const contentBlock = document.createElement('div');
    contentBlock.className = 'jm-lore-popup-content';
    contentBlock.textContent = content;
    contentBlock.style.whiteSpace = 'pre-wrap';
    contentBlock.style.wordBreak = 'break-word';
    wrapper.appendChild(contentBlock);
  }

  return wrapper;
}

function appendPopupField(grid: HTMLElement, key: string, value: string) {
  const keyNode = document.createElement('div');
  keyNode.className = 'jm-lore-popup-key';
  keyNode.textContent = key;
  keyNode.style.opacity = '0.72';
  keyNode.style.fontWeight = '700';
  const valueNode = document.createElement('div');
  valueNode.textContent = value;
  valueNode.style.whiteSpace = 'pre-wrap';
  valueNode.style.wordBreak = 'break-word';
  grid.append(keyNode, valueNode);
}

async function fillPopupImage(image: HTMLImageElement, entry: LoreEntry) {
  const imageUrl = await resolveImageUrl(entry);
  if (!imageUrl) {
    return;
  }

  const candidates = buildImageUrlCandidates(imageUrl);
  if (candidates.length === 0) {
    return;
  }

  let index = 0;
  image.onerror = () => {
    index += 1;
    if (index < candidates.length) {
      image.src = candidates[index];
      return;
    }

    image.hidden = true;
  };
  image.onload = () => {
    image.hidden = false;
  };
  image.src = candidates[index];
}

function openFallbackModal(content: HTMLElement) {
  let modal = document.getElementById(FALLBACK_MODAL_ID);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = FALLBACK_MODAL_ID;
    modal.innerHTML = `<div class="jm-lore-modal-card"></div>`;
    modal.addEventListener('click', event => {
      if (event.target === modal) {
        modal?.classList.remove('is-open');
      }
    });
    document.body.appendChild(modal);
  }

  const card = modal.querySelector('.jm-lore-modal-card');
  if (!card) {
    return;
  }

  card.replaceChildren(content);
  modal.classList.add('is-open');
}

function scheduleRefreshMessage(messageId: number) {
  if (destroyed) {
    return;
  }

  if (highlightTimer !== null) {
    window.clearTimeout(highlightTimer);
  }

  highlightTimer = window.setTimeout(() => {
    highlightTimer = null;
    enhanceDisplayedMessage(messageId);
  }, 30);
}

function scheduleRefreshVisibleMessages() {
  if (destroyed) {
    return;
  }

  if (highlightTimer !== null) {
    window.clearTimeout(highlightTimer);
  }

  highlightTimer = window.setTimeout(() => {
    highlightTimer = null;
    getVisibleMessageIds().forEach(messageId => enhanceDisplayedMessage(messageId));
  }, 40);
}

function getVisibleMessageIds() {
  return $('#chat .mes[mesid]')
    .toArray()
    .map(element => Number((element as HTMLElement).getAttribute('mesid')))
    .filter(messageId => Number.isFinite(messageId));
}

function enhanceDisplayedMessage(messageId: number) {
  const root = resolveMessageTextRoot(messageId);
  if (!root) {
    return;
  }

  clearHighlights(root);

  const state: MessageProcessState = {
    usedTerms: new Set<string>(),
    appliedCount: 0,
  };

  const textNodes = collectEligibleTextNodes(root);
  for (const textNode of textNodes) {
    if (state.appliedCount >= MAX_HIGHLIGHTS_PER_MESSAGE) {
      break;
    }

    highlightTextNode(textNode, state);
  }
}

function resolveMessageTextRoot(messageId: number) {
  const $displayed = retrieveDisplayedMessage(messageId);
  if ($displayed.length === 0) {
    return null;
  }

  const root = $displayed.hasClass('mes_text')
    ? ($displayed.get(0) as HTMLElement | undefined)
    : ($displayed.find('.mes_text').get(0) as HTMLElement | undefined);

  return root ?? null;
}

function clearHighlights(root: HTMLElement) {
  root.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(node => {
    const element = node as HTMLElement;
    const parent = element.parentNode;
    if (!parent) {
      return;
    }

    parent.replaceChild(document.createTextNode(element.textContent ?? ''), element);
    parent.normalize();
  });
}

function collectEligibleTextNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (!parent || shouldSkipNode(parent)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function shouldSkipNode(element: Element) {
  if (element.closest(`.${HIGHLIGHT_CLASS}`)) {
    return true;
  }

  const skipSelector = [
    'a',
    'pre',
    'code',
    'textarea',
    'input',
    'select',
    'button',
    'script',
    'style',
    '[hidden]',
    '[contenteditable="true"]',
    '.mes_buttons',
    '.mes_reasoning',
    '.mes_reasoning_details',
    '.mes_prompt',
    '.displayNone',
    '.hidden',
  ].join(',');

  if (element.closest(skipSelector)) {
    return true;
  }

  for (let current: Element | null = element; current; current = current.parentElement) {
    const tagName = current.tagName.toLowerCase();
    if (/^state\d+$/.test(tagName)) {
      return true;
    }

    if (['variableedit', 'datahidden', 'chatdata', 'mesinput'].includes(tagName)) {
      return true;
    }

    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return true;
    }
  }

  return false;
}

function highlightTextNode(textNode: Text, state: MessageProcessState) {
  const text = textNode.nodeValue ?? '';
  const loweredText = text.toLocaleLowerCase();
  const candidates: Array<{ start: number; length: number; term: string; entry: LoreEntry }> = [];

  for (const term of sortedHighlightTerms) {
    if (state.appliedCount >= MAX_HIGHLIGHTS_PER_MESSAGE) {
      break;
    }

    if (state.usedTerms.has(term)) {
      continue;
    }

    const index = loweredText.indexOf(term);
    if (index < 0) {
      continue;
    }

    const entry = termToEntry.get(term);
    if (!entry) {
      continue;
    }

    candidates.push({ start: index, length: term.length, term, entry });
  }

  if (candidates.length === 0) {
    return;
  }

  candidates.sort((left, right) => left.start - right.start || right.length - left.length);

  const picks: typeof candidates = [];
  for (const candidate of candidates) {
    if (state.usedTerms.has(candidate.term)) {
      continue;
    }

    const overlaps = picks.some(
      pick =>
        candidate.start < pick.start + pick.length &&
        pick.start < candidate.start + candidate.length,
    );
    if (overlaps) {
      continue;
    }

    picks.push(candidate);
    state.usedTerms.add(candidate.term);
    state.appliedCount += 1;

    if (state.appliedCount >= MAX_HIGHLIGHTS_PER_MESSAGE) {
      break;
    }
  }

  if (picks.length === 0 || !textNode.parentNode) {
    return;
  }

  picks.sort((left, right) => right.start - left.start);
  for (const pick of picks) {
    wrapTextRange(textNode, pick.start, pick.start + pick.length, pick.entry);
  }
}

function wrapTextRange(textNode: Text, start: number, end: number, entry: LoreEntry) {
  if (!textNode.parentNode) {
    return;
  }

  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = HIGHLIGHT_CLASS;
  button.dataset.entryId = entry.id;
  button.title = `查看设定：${entry.title}`;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    void openLoreEntryPopup(entry);
  });

  try {
    range.surroundContents(button);
  } catch (error) {
    console.warn('[JM设定百科脚本] surroundContents failed', { entry: entry.title, error });
  }
}

function normalizeLoreEntries(input: unknown) {
  const records = Array.isArray(input)
    ? input
    : typeof input === 'object' && input
      ? Object.values(input as Record<string, unknown>)
      : [];

  return records
    .map((record, index) => normalizeLoreEntry(record, index))
    .filter((entry): entry is LoreEntry => entry !== null);
}

function normalizeLoreEntry(record: unknown, index: number): LoreEntry | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const source = record as LoreEntryRecord;
  const title = readString(source, ['title', 'name', '标题', '词条名']) || `未命名词条-${index + 1}`;
  const aliases = normalizeStringArray([
    source.aliases,
    source.alias,
    source.tags,
    source.keywords,
    source['别名'],
    source['同义词'],
  ]);
  const category = readString(source, ['category', 'type', '分类', '类别']);
  const summary =
    readString(source, ['summary', 'abstract', '简介', '摘要']) ||
    readString(source, ['description', 'desc', '说明']);
  const content =
    readString(source, ['content', 'text', '正文', '详细内容']) ||
    summary ||
    readString(source, ['description', 'desc', '说明']);
  const sourceText = readString(source, ['source', 'origin', '出处', '来源']);
  const imageKeywords = normalizeStringArray([
    source.imageKeywords,
    source.images,
    source.imageKeyword,
    source['图片关键词'],
  ]);

  const dedupedAliases = aliases.filter(alias => alias && alias !== title);
  const highlightTerms = uniqueStrings([title, ...dedupedAliases])
    .filter(term => term.length >= 2)
    .sort((left, right) => right.length - left.length || left.localeCompare(right, 'zh-Hans-CN'));

  return {
    id: readString(source, ['id', 'uid']) || `${index}-${title}`,
    title,
    aliases: dedupedAliases,
    category,
    summary,
    source: sourceText,
    content,
    imageKeywords,
    searchText: uniqueStrings([title, category, summary, sourceText, ...dedupedAliases]).join(' ').toLocaleLowerCase(),
    highlightTerms,
  };
}

function buildHighlightIndex(entries: LoreEntry[]) {
  termToEntry = new Map<string, LoreEntry>();

  for (const entry of entries) {
    for (const rawTerm of entry.highlightTerms) {
      const term = rawTerm.toLocaleLowerCase();
      const existing = termToEntry.get(term);
      if (!existing || entry.title.length > existing.title.length) {
        termToEntry.set(term, entry);
      }
    }
  }

  sortedHighlightTerms = Array.from(termToEntry.keys()).sort(
    (left, right) => right.length - left.length || left.localeCompare(right, 'zh-Hans-CN'),
  );
}

async function resolveImageUrl(entry: LoreEntry) {
  if (entry.imageKeywords.length === 0) {
    return null;
  }

  const imageIndex = await loadImageIndex();
  const indexKeys = Object.keys(imageIndex);
  for (const keyword of entry.imageKeywords) {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();
    const matchedKey =
      indexKeys.find(key => key.trim().toLocaleLowerCase() === normalizedKeyword) ??
      indexKeys.find(key => key.trim().toLocaleLowerCase().includes(normalizedKeyword));
    const fileName = matchedKey ? imageIndex[matchedKey]?.[0] : undefined;
    if (fileName) {
      return fileName;
    }
  }

  return null;
}

function loadImageIndex() {
  if (!activeImageIndexPromise) {
    activeImageIndexPromise = fetchRemoteImageIndex().catch(error => {
      console.warn('[JM设定百科脚本] failed to load remote image index, fallback to local', error);
      return normalizeImageIndex(localImageIndex);
    });
  }

  return activeImageIndexPromise;
}

async function fetchRemoteImageIndex() {
  for (const url of REMOTE_IMAGE_INDEX_URLS) {
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as unknown;
      const normalized = normalizeImageIndex(data);
      if (Object.keys(normalized).length > 0) {
        return normalized;
      }
    } catch (error) {
      console.warn('[JM设定百科脚本] image index fetch failed', { url, error });
    }
  }

  return normalizeImageIndex(localImageIndex);
}

function normalizeImageIndex(input: unknown): ImageIndex {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const result: ImageIndex = {};
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    if (!Array.isArray(value)) {
      return;
    }

    const fileNames = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
    if (fileNames.length > 0) {
      result[key] = fileNames;
    }
  });
  return result;
}

function buildImageUrlCandidates(fileName: string) {
  if (/^https?:\/\//i.test(fileName)) {
    return [fileName];
  }

  return IMAGE_BASE_URLS.map(baseUrl => `${baseUrl}${encodeURIComponent(fileName)}`);
}

function readString(source: LoreEntryRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function normalizeStringArray(values: unknown[]) {
  const flattened = values.flatMap(value => {
    if (Array.isArray(value)) {
      return value;
    }
    return typeof value === 'string' ? value.split(/[、,，/|]/g) : [];
  });

  return uniqueStrings(
    flattened
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean),
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getPopupApi(): PopupApi | undefined {
  const parentWindow = window.parent as Window & typeof globalThis & { SillyTavern?: typeof SillyTavern };
  const currentWindow = window as Window & typeof globalThis & { SillyTavern?: typeof SillyTavern };
  return parentWindow.SillyTavern || currentWindow.SillyTavern;
}

$(() => {
  try {
    init();
  } catch (error) {
    console.error('[JM设定百科脚本] init failed', error);
    throw error;
  }
});
