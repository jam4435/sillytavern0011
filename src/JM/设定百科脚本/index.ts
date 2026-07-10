import loreEntriesRaw from './lore-entries.json?raw';

type LoreEntry = {
  id: string;
  title: string;
  category: string;
  aliases: string[];
  summary: string;
  sourceFile: string;
  imageKeywords: string[];
  autoLink: boolean;
};

type PopupApi = Pick<typeof SillyTavern, 'callGenericPopup' | 'POPUP_TYPE'>;

type ImageIndex = Record<string, string[]>;

const SCRIPT_KEY = 'jm-lore-encyclopedia';
const ENHANCED_ATTR = 'data-jm-lore-enhanced';
const MAX_LINKS_PER_MESSAGE = 12;
const IMAGE_BASE_URL = 'https://raw.githubusercontent.com/jam4435/my-image-hosting/main/jm/';
const IMAGE_INDEX_URL = `${IMAGE_BASE_URL}imageIndex.json`;

const blockedAutoLinkAliases = new Set([
  '帝国',
  '女性',
  '男性',
  '女体',
  '组织',
  '机构',
  '社会',
  '产品',
  '职业',
  '设施',
  '场所',
  '地点',
  '道具',
  '物品',
  '装备',
  '设备',
  '技术',
  '规则',
  '法则',
  '制度',
  '流程',
  '文化',
  '历史',
  '概念',
  '现象',
  '详情',
  '总览',
  '概览',
  '档案',
  '体系',
  '元数据',
  '提示词',
  '文风',
  '指导',
  '模型',
]);

const ignoredAncestorSelector = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'script',
  'style',
  'code',
  'pre',
  '.jm-lore-link',
  '.jm-lore-root',
  '.jm-state-panel',
  '.status-container',
  '.TH-streaming',
  '.mes_streaming',
].join(',');

const loreEntries = parseLoreEntries();
const entryById = new Map(loreEntries.map(entry => [entry.id, entry]));
const linkCandidates = buildLinkCandidates(loreEntries);
const linkRegex = buildLinkRegex(linkCandidates.map(candidate => candidate.alias));
const stops: Array<() => void> = [];
let imageIndexPromise: Promise<ImageIndex> | null = null;
let searchInput: HTMLInputElement | null = null;
let panelElement: HTMLElement | null = null;
let resultElement: HTMLElement | null = null;

function parseLoreEntries(): LoreEntry[] {
  try {
    const data = JSON.parse(loreEntriesRaw) as LoreEntry[];
    return data.filter(entry => entry.id && entry.title && entry.summary);
  } catch (error) {
    console.error('[JM设定百科] 词条数据解析失败。', error);
    return [];
  }
}

function buildLinkCandidates(entries: LoreEntry[]) {
  const seen = new Set<string>();
  const candidates: Array<{ alias: string; entry: LoreEntry }> = [];

  entries
    .filter(entry => entry.autoLink)
    .forEach(entry => {
      [entry.title, ...entry.aliases]
        .map(alias => alias.trim())
        .filter(alias => alias.length >= 2)
        .filter(alias => !blockedAutoLinkAliases.has(alias))
        .forEach(alias => {
          if (seen.has(alias)) {
            return;
          }
          seen.add(alias);
          candidates.push({ alias, entry });
        });
    });

  return candidates.sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias, 'zh-Hans-CN'));
}

function buildLinkRegex(aliases: string[]) {
  if (aliases.length === 0) {
    return null;
  }
  return new RegExp(aliases.map(escapeRegExp).join('|'), 'gu');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function installStyle() {
  const styleId = `${SCRIPT_KEY}-style`;
  $(`#${styleId}`).remove();
  $('<style>')
    .attr('id', styleId)
    .attr('script_id', getSafeScriptId())
    .text(
      `
      .jm-lore-root {
        position: fixed;
        right: 22px;
        bottom: 22px;
        z-index: 10050;
        font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
        color: #f4f0e8;
      }
      .jm-lore-fab {
        width: 42px;
        height: 42px;
        border: 1px solid rgba(218, 185, 111, 0.62);
        border-radius: 8px;
        background:
          linear-gradient(145deg, rgba(82, 17, 26, 0.96), rgba(21, 24, 23, 0.98));
        color: #f7df9b;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
        cursor: pointer;
        font-size: 20px;
        font-weight: 700;
        line-height: 1;
      }
      .jm-lore-fab:hover,
      .jm-lore-fab:focus-visible {
        border-color: #e6c97a;
        box-shadow: 0 16px 34px rgba(0, 0, 0, 0.54);
        outline: none;
      }
      .jm-lore-panel {
        position: absolute;
        right: 0;
        bottom: 52px;
        width: min(430px, calc(100vw - 28px));
        max-height: min(620px, calc(100vh - 96px));
        display: none;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(218, 185, 111, 0.36);
        border-radius: 8px;
        background:
          linear-gradient(160deg, rgba(18, 20, 19, 0.98), rgba(64, 15, 24, 0.97));
        box-shadow: 0 18px 46px rgba(0, 0, 0, 0.58);
      }
      .jm-lore-panel.open {
        display: flex;
      }
      .jm-lore-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px 10px;
        border-bottom: 1px solid rgba(218, 185, 111, 0.22);
      }
      .jm-lore-title {
        flex: 1;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0;
      }
      .jm-lore-count {
        color: #b8d6c2;
        font-size: 12px;
      }
      .jm-lore-icon-btn {
        width: 30px;
        height: 30px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.06);
        color: #f4f0e8;
        cursor: pointer;
      }
      .jm-lore-icon-btn:hover,
      .jm-lore-icon-btn:focus-visible {
        background: rgba(218, 185, 111, 0.16);
        outline: none;
      }
      .jm-lore-search {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(218, 185, 111, 0.16);
      }
      .jm-lore-search input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(218, 185, 111, 0.28);
        border-radius: 7px;
        background: rgba(0, 0, 0, 0.22);
        color: #f4f0e8;
        padding: 10px 11px;
        font: inherit;
        outline: none;
      }
      .jm-lore-search input:focus {
        border-color: rgba(139, 214, 163, 0.78);
      }
      .jm-lore-results {
        overflow: auto;
        padding: 8px;
      }
      .jm-lore-result {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 6px 10px;
        align-items: start;
        text-align: left;
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.045);
        color: inherit;
        padding: 10px;
        margin: 0 0 7px;
        cursor: pointer;
      }
      .jm-lore-result:hover,
      .jm-lore-result:focus-visible {
        border-color: rgba(139, 214, 163, 0.48);
        background: rgba(139, 214, 163, 0.08);
        outline: none;
      }
      .jm-lore-result-title {
        font-weight: 700;
        font-size: 14px;
      }
      .jm-lore-result-category {
        color: #f0cf7c;
        font-size: 12px;
        white-space: nowrap;
      }
      .jm-lore-result-summary {
        grid-column: 1 / -1;
        color: rgba(244, 240, 232, 0.78);
        font-size: 12px;
        line-height: 1.55;
      }
      .jm-lore-empty {
        padding: 20px 12px;
        color: rgba(244, 240, 232, 0.68);
        text-align: center;
      }
      .jm-lore-link {
        color: #91d7aa;
        border-bottom: 1px dotted rgba(145, 215, 170, 0.72);
        cursor: pointer;
        text-decoration: none;
      }
      .jm-lore-link:hover {
        color: #f0cf7c;
        border-bottom-color: rgba(240, 207, 124, 0.78);
      }
      .jm-lore-popup {
        display: flex;
        flex-direction: column;
        gap: 12px;
        line-height: 1.65;
      }
      .jm-lore-popup-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-weight: 700;
        font-size: 1.08rem;
      }
      .jm-lore-popup-category {
        color: #b68a37;
        font-size: 0.84rem;
        white-space: nowrap;
      }
      .jm-lore-popup-summary {
        font-size: 0.98rem;
      }
      .jm-lore-popup-meta {
        color: rgba(255, 255, 255, 0.68);
        font-size: 0.86rem;
      }
      .jm-lore-tag-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .jm-lore-tag {
        border: 1px solid rgba(182, 138, 55, 0.28);
        border-radius: 6px;
        padding: 2px 7px;
        color: #f0cf7c;
        font-size: 0.78rem;
      }
      .jm-lore-images {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
        gap: 8px;
      }
      .jm-lore-images img {
        width: 100%;
        aspect-ratio: 1 / 1;
        object-fit: cover;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.14);
      }
      @media (max-width: 520px) {
        .jm-lore-root {
          right: 14px;
          bottom: 14px;
        }
        .jm-lore-panel {
          width: calc(100vw - 28px);
          max-height: calc(100vh - 78px);
        }
      }
    `,
    )
    .appendTo('head');
}

function mountUi() {
  const rootId = `${SCRIPT_KEY}-root`;
  $(`#${rootId}`).remove();

  const $root = $('<div>')
    .attr('id', rootId)
    .attr('script_id', getSafeScriptId())
    .addClass('jm-lore-root')
    .appendTo('body');

  const $panel = $('<section>')
    .addClass('jm-lore-panel')
    .attr({ role: 'dialog', 'aria-label': 'JM设定索引' })
    .appendTo($root);
  panelElement = $panel[0];

  const $header = $('<div>').addClass('jm-lore-header').appendTo($panel);
  $('<div>').addClass('jm-lore-title').text('JM 设定索引').appendTo($header);
  $('<div>').addClass('jm-lore-count').text(`${loreEntries.length} 条`).appendTo($header);
  $('<button>')
    .addClass('jm-lore-icon-btn')
    .attr({ type: 'button', title: '关闭', 'aria-label': '关闭' })
    .text('×')
    .on('click', closePanel)
    .appendTo($header);

  const $search = $('<div>').addClass('jm-lore-search').appendTo($panel);
  searchInput = $('<input>')
    .attr({ type: 'search', placeholder: '搜索设定、别名、分类', autocomplete: 'off' })
    .on('input', renderSearchResults)
    .appendTo($search)[0] as HTMLInputElement;

  resultElement = $('<div>').addClass('jm-lore-results').appendTo($panel)[0];

  $('<button>')
    .addClass('jm-lore-fab')
    .attr({ type: 'button', title: 'JM设定索引', 'aria-label': 'JM设定索引' })
    .text('典')
    .on('click', togglePanel)
    .appendTo($root);

  renderSearchResults();
}

function togglePanel() {
  if (!panelElement) {
    return;
  }
  panelElement.classList.toggle('open');
  if (panelElement.classList.contains('open')) {
    searchInput?.focus();
  }
}

function closePanel() {
  panelElement?.classList.remove('open');
}

function renderSearchResults() {
  if (!resultElement) {
    return;
  }

  const query = normalizeForSearch(searchInput?.value ?? '');
  const matches = loreEntries
    .filter(entry => {
      if (!query) {
        return true;
      }
      return buildSearchHaystack(entry).includes(query);
    })
    .slice(0, 80);

  resultElement.replaceChildren();
  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'jm-lore-empty';
    empty.textContent = '未找到匹配词条';
    resultElement.appendChild(empty);
    return;
  }

  matches.forEach(entry => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jm-lore-result';
    button.addEventListener('click', () => {
      void showEntryPopup(entry);
    });

    const title = document.createElement('div');
    title.className = 'jm-lore-result-title';
    title.textContent = entry.title;
    button.appendChild(title);

    const category = document.createElement('div');
    category.className = 'jm-lore-result-category';
    category.textContent = entry.category;
    button.appendChild(category);

    const summary = document.createElement('div');
    summary.className = 'jm-lore-result-summary';
    summary.textContent = entry.summary;
    button.appendChild(summary);

    resultElement?.appendChild(button);
  });
}

function normalizeForSearch(value: string) {
  return value.toLowerCase().replace(/[·・\s_\-:：]/gu, '').trim();
}

function buildSearchHaystack(entry: LoreEntry) {
  return normalizeForSearch([entry.title, entry.category, entry.summary, entry.sourceFile, ...entry.aliases].join(' '));
}

async function showEntryPopup(entry: LoreEntry) {
  const content = document.createElement('div');
  content.className = 'jm-lore-popup';

  const titleRow = document.createElement('div');
  titleRow.className = 'jm-lore-popup-title';
  const title = document.createElement('span');
  title.textContent = entry.title;
  titleRow.appendChild(title);
  const category = document.createElement('span');
  category.className = 'jm-lore-popup-category';
  category.textContent = entry.category;
  titleRow.appendChild(category);
  content.appendChild(titleRow);

  const summary = document.createElement('div');
  summary.className = 'jm-lore-popup-summary';
  summary.textContent = entry.summary;
  content.appendChild(summary);

  const aliases = entry.aliases.filter(alias => alias !== entry.title).slice(0, 12);
  if (aliases.length > 0) {
    const aliasRow = document.createElement('div');
    aliasRow.className = 'jm-lore-tag-row';
    aliases.forEach(alias => {
      const tag = document.createElement('span');
      tag.className = 'jm-lore-tag';
      tag.textContent = alias;
      aliasRow.appendChild(tag);
    });
    content.appendChild(aliasRow);
  }

  const images = await findImagesForEntry(entry);
  if (images.length > 0) {
    const imageGrid = document.createElement('div');
    imageGrid.className = 'jm-lore-images';
    images.slice(0, 6).forEach(fileName => {
      const image = document.createElement('img');
      image.loading = 'lazy';
      image.alt = entry.title;
      image.src = `${IMAGE_BASE_URL}${fileName}`;
      imageGrid.appendChild(image);
    });
    content.appendChild(imageGrid);
  }

  const source = document.createElement('div');
  source.className = 'jm-lore-popup-meta';
  source.textContent = `来源：${entry.sourceFile}`;
  content.appendChild(source);

  const popupApi = getPopupApi();
  if (popupApi?.callGenericPopup) {
    await popupApi.callGenericPopup(content, popupApi.POPUP_TYPE.TEXT, '', {
      okButton: '关闭',
      cancelButton: false,
      wider: true,
      large: images.length > 2,
      leftAlign: true,
      allowVerticalScrolling: true,
    });
    return;
  }

  alert(`${entry.title}\n\n${entry.summary}\n\n${entry.sourceFile}`);
}

async function findImagesForEntry(entry: LoreEntry) {
  if (!entry.imageKeywords || entry.imageKeywords.length === 0) {
    return [];
  }

  try {
    const imageIndex = await loadImageIndex();
    const imageNames: string[] = [];
    entry.imageKeywords.forEach(keyword => {
      const exactImages = imageIndex[keyword] ?? [];
      imageNames.push(...exactImages);

      if (exactImages.length === 0 && keyword.length >= 3) {
        Object.entries(imageIndex).forEach(([indexKey, images]) => {
          if (indexKey.includes(keyword) || keyword.includes(indexKey)) {
            imageNames.push(...images);
          }
        });
      }
    });
    return uniqueStrings(imageNames).filter(image => image && image !== '非头像.abc');
  } catch (error) {
    console.warn('[JM设定百科] 图片索引加载失败。', error);
    return [];
  }
}

async function loadImageIndex() {
  if (!imageIndexPromise) {
    imageIndexPromise = fetch(IMAGE_INDEX_URL).then(async response => {
      if (!response.ok) {
        throw new Error(`图片索引加载失败: ${response.status}`);
      }
      return (await response.json()) as ImageIndex;
    });
  }
  return imageIndexPromise;
}

function enhanceVisibleMessages() {
  $('#chat')
    .children(".mes[is_user='false'][is_system='false']")
    .each((_index, node) => {
      const messageId = Number($(node).attr('mesid'));
      if (Number.isInteger(messageId)) {
        enhanceMessage(messageId);
      }
    });
}

function enhanceMessage(messageId: number) {
  if (!linkRegex || linkCandidates.length === 0) {
    return;
  }

  const $message = $(`#chat > .mes[mesid='${messageId}']`);
  if ($message.attr('is_user') === 'true' || $message.attr('is_system') === 'true') {
    return;
  }

  const $display = getDisplayedMessageElement(messageId);
  $display.each((_index, element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    resetEnhancedElement(element);
    element.setAttribute(ENHANCED_ATTR, '1');
    enhanceRootElement(element);
  });
}

function getDisplayedMessageElement(messageId: number) {
  if (typeof retrieveDisplayedMessage === 'function') {
    const displayed = retrieveDisplayedMessage(messageId);
    if (displayed.length > 0) {
      return displayed;
    }
  }
  return $(`#chat > .mes[mesid='${messageId}'] .mes_text`);
}

function enhanceRootElement(root: HTMLElement) {
  const fullText = root.textContent ?? '';
  const skipRanges = buildSkipRanges(fullText);
  const usedEntryIds = new Set<string>();
  let linkCount = 0;
  let offset = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(ignoredAncestorSelector)) {
        return NodeFilter.FILTER_REJECT;
      }
      const text = node.nodeValue ?? '';
      if (!text.trim() || containsHiddenSyntax(text)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const textLength = node.nodeValue?.length ?? 0;
    const start = offset;
    const end = start + textLength;
    nodes.push({ node, start, end });
    offset = end;
  }

  nodes.forEach(({ node, start, end }) => {
    if (linkCount >= MAX_LINKS_PER_MESSAGE || overlapsSkipRange(start, end, skipRanges)) {
      return;
    }
    const added = linkifyTextNode(node, usedEntryIds, MAX_LINKS_PER_MESSAGE - linkCount);
    linkCount += added;
  });
}

function containsHiddenSyntax(text: string) {
  return /<\/?state\d+>|<Variable(?:Think|Insert|Edit|Delete)>|<\/Variable(?:Think|Insert|Edit|Delete)>|<\/?era_data>/iu.test(
    text,
  );
}

function buildSkipRanges(text: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  const patterns = [
    /<state\d+>[\s\S]*?<\/state\d+>/giu,
    /<Variable(?:Think|Insert|Edit|Delete)>[\s\S]*?<\/Variable(?:Think|Insert|Edit|Delete)>/giu,
    /<era_data>[\s\S]*?<\/era_data>/giu,
  ];

  patterns.forEach(pattern => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  });

  return ranges;
}

function overlapsSkipRange(start: number, end: number, ranges: Array<{ start: number; end: number }>) {
  return ranges.some(range => start < range.end && end > range.start);
}

function linkifyTextNode(node: Text, usedEntryIds: Set<string>, remainingLinks: number) {
  if (!linkRegex || remainingLinks <= 0) {
    return 0;
  }

  const text = node.nodeValue ?? '';
  linkRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  let cursor = 0;
  let added = 0;
  const fragment = document.createDocumentFragment();

  while ((match = linkRegex.exec(text)) !== null) {
    const alias = match[0];
    const candidate = linkCandidates.find(item => item.alias === alias);
    if (!candidate) {
      continue;
    }

    if (match.index > cursor) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)));
    }

    if (added < remainingLinks && !usedEntryIds.has(candidate.entry.id)) {
      fragment.appendChild(createLoreLink(alias, candidate.entry));
      usedEntryIds.add(candidate.entry.id);
      added += 1;
    } else {
      fragment.appendChild(document.createTextNode(alias));
    }

    cursor = match.index + alias.length;
    if (added >= remainingLinks) {
      break;
    }
  }

  if (added === 0) {
    return 0;
  }

  if (cursor < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
  }

  node.parentNode?.replaceChild(fragment, node);
  return added;
}

function createLoreLink(text: string, entry: LoreEntry) {
  const link = document.createElement('a');
  link.href = '#';
  link.className = 'jm-lore-link';
  link.dataset.entryId = entry.id;
  link.textContent = text;
  link.title = entry.title;
  return link;
}

function resetEnhancedElement(root: HTMLElement) {
  root.querySelectorAll('a.jm-lore-link').forEach(link => {
    link.replaceWith(document.createTextNode(link.textContent ?? ''));
  });
  root.removeAttribute(ENHANCED_ATTR);
}

function installEventListeners() {
  stops.push(
    eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, messageId => {
      enhanceMessage(Number(messageId));
    }).stop,
  );
  stops.push(
    eventOn(tavern_events.MESSAGE_UPDATED, messageId => {
      setTimeout(() => enhanceMessage(Number(messageId)), 120);
    }).stop,
  );
  stops.push(
    eventOn(tavern_events.MESSAGE_SWIPED, messageId => {
      setTimeout(() => enhanceMessage(Number(messageId)), 120);
    }).stop,
  );
  stops.push(
    eventOn(tavern_events.MORE_MESSAGES_LOADED, () => {
      setTimeout(enhanceVisibleMessages, 240);
    }).stop,
  );
  stops.push(
    eventOn(tavern_events.CHAT_CHANGED, () => {
      setTimeout(enhanceVisibleMessages, 400);
    }).stop,
  );

  $(document).on(`click.${SCRIPT_KEY}`, '.jm-lore-link', event => {
    event.preventDefault();
    const entryId = (event.currentTarget as HTMLElement).dataset.entryId;
    const entry = entryId ? entryById.get(entryId) : null;
    if (entry) {
      void showEntryPopup(entry);
    }
  });

  $(window).on(`pagehide.${SCRIPT_KEY}`, cleanup);
}

function cleanup() {
  stops.splice(0).forEach(stop => stop());
  $(document).off(`.${SCRIPT_KEY}`);
  $(window).off(`.${SCRIPT_KEY}`);
  document.querySelectorAll<HTMLElement>(`[${ENHANCED_ATTR}="1"]`).forEach(resetEnhancedElement);
  $(`[script_id='${getSafeScriptId()}']`).remove();
}

function getPopupApi(): PopupApi | undefined {
  const parentWindow = window.parent as Window & typeof globalThis & { SillyTavern?: typeof SillyTavern };
  const currentWindow = window as Window & typeof globalThis & { SillyTavern?: typeof SillyTavern };
  return parentWindow.SillyTavern || currentWindow.SillyTavern;
}

function getSafeScriptId() {
  return typeof getScriptId === 'function' ? getScriptId() : SCRIPT_KEY;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function init() {
  installStyle();
  mountUi();
  installEventListeners();
  setTimeout(enhanceVisibleMessages, 200);
  console.info('[JM设定百科] 已加载。', {
    entries: loreEntries.length,
    linkCandidates: linkCandidates.length,
  });
}

$(() => {
  errorCatched(init)();
});
