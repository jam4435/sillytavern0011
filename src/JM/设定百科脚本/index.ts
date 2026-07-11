import loreEntriesRaw from './lore-entries.json?raw';
import localImageIndexRaw from '../imageIndex.json?raw';

type LoreEntry = {
  id: string;
  title: string;
  category: string;
  aliases: string[];
  triggers?: string[];
  summary: string;
  details?: string[];
  sourceFile: string;
  sourceExcerpt?: string;
  sourceSegmentIndex?: number;
  imageKeywords: string[];
  autoLink: boolean;
};

type ImageIndex = Record<string, string[]>;
type SynonymIndex = Record<string, string[]>;
type ImageLookupData = {
  imageIndex: ImageIndex;
  synonymMap: Record<string, string>;
  allKeywords: string[];
};

const SCRIPT_KEY = 'jm-lore-encyclopedia';
const ENHANCED_ATTR = 'data-jm-lore-enhanced';
const MAX_LINKS_PER_MESSAGE = 12;
const MAX_IMAGES_PER_ENTRY = 8;
const IMAGE_BASE_URL = 'https://raw.githubusercontent.com/jam4435/my-image-hosting/main/jm/';
const IMAGE_INDEX_URL = `${IMAGE_BASE_URL}imageIndex.json`;
const SYNONYMS_URL = `${IMAGE_BASE_URL}synonyms.json`;
const SCRIPT_BUTTONS: ScriptButton[] = [
  { name: '打开百科', visible: true },
  { name: '重扫正文', visible: true },
];

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

const blockedImageKeywords = new Set([
  ...blockedAutoLinkAliases,
  '小说',
  '漫画',
  '介绍',
  '说明',
  '女人',
  '女孩',
  '身体',
  '工作',
  '公司',
  '帝国军',
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

const hiddenLoreAncestorSelector = [
  'summary',
  '.custom-konata-thinking-wrapper',
  '.custom-tucao-w',
  '.custom-tucao-c',
  '.custom-kz-w',
  '.custom-kz-c',
  '.TH-render',
  '.mes_reasoning',
  '.mes_reasoning_details',
].join(',');

const loreEntries = parseLoreEntries();
const entryById = new Map(loreEntries.map(entry => [entry.id, entry]));
const linkCandidates = buildLinkCandidates(loreEntries);
const linkRegex = buildLinkRegex(linkCandidates.map(candidate => candidate.alias));
const stops: Array<() => void> = [];
let imageLookupPromise: Promise<ImageLookupData> | null = null;
let searchInput: HTMLInputElement | null = null;
let panelElement: HTMLElement | null = null;
let resultElement: HTMLElement | null = null;
let modalElement: HTMLElement | null = null;
let modalCardElement: HTMLElement | null = null;

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
      const triggers = entry.triggers && entry.triggers.length > 0 ? entry.triggers : [entry.title, ...entry.aliases];
      triggers
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
      .jm-lore-modal {
        position: fixed;
        inset: 0;
        z-index: 10060;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(7, 8, 8, 0.72);
      }
      .jm-lore-modal.open {
        display: flex;
      }
      .jm-lore-modal-card {
        width: min(760px, calc(100vw - 32px));
        max-height: min(82vh, calc(100vh - 40px));
        overflow: auto;
        border: 1px solid rgba(218, 185, 111, 0.32);
        border-radius: 8px;
        background:
          linear-gradient(160deg, rgba(18, 20, 19, 0.99), rgba(64, 15, 24, 0.98));
        box-shadow: 0 24px 54px rgba(0, 0, 0, 0.58);
      }
      .jm-lore-modal-head {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 10px 12px 0;
        background: linear-gradient(180deg, rgba(18, 20, 19, 0.98), rgba(18, 20, 19, 0.78), transparent);
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
        display: inline;
        padding: 0 2px;
        border-radius: 4px;
        background: rgba(145, 215, 170, 0.12);
        color: #91d7aa;
        border-bottom: 1px dotted rgba(145, 215, 170, 0.72);
        cursor: pointer;
        text-decoration: none;
      }
      .jm-lore-link:hover {
        background: rgba(240, 207, 124, 0.18);
        color: #f0cf7c;
        border-bottom-color: rgba(240, 207, 124, 0.78);
      }
      .jm-lore-popup {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px 18px 20px;
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
      .jm-lore-popup-details {
        margin: 0;
        padding-left: 1.2em;
        color: rgba(255, 255, 255, 0.86);
        font-size: 0.9rem;
      }
      .jm-lore-popup-details li {
        margin: 0 0 4px;
      }
      .jm-lore-popup-meta {
        color: rgba(255, 255, 255, 0.68);
        font-size: 0.86rem;
      }
      .jm-lore-popup-excerpt {
        border-left: 2px solid rgba(182, 138, 55, 0.46);
        padding-left: 10px;
        color: rgba(255, 255, 255, 0.68);
        font-size: 0.84rem;
        line-height: 1.55;
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
        grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
        gap: 10px;
      }
      .jm-lore-images img {
        width: 100%;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(0, 0, 0, 0.24);
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

  const $modal = $('<div>')
    .addClass('jm-lore-modal')
    .attr({ 'aria-hidden': 'true' })
    .on('click', event => {
      if (event.target === event.currentTarget) {
        closeModal();
      }
    })
    .appendTo($root);
  modalElement = $modal[0];

  const $modalCard = $('<section>')
    .addClass('jm-lore-modal-card')
    .attr({ role: 'dialog', 'aria-label': 'JM设定百科详情' })
    .appendTo($modal);
  modalCardElement = $modalCard[0];

  const $modalHead = $('<div>').addClass('jm-lore-modal-head').appendTo($modalCard);
  $('<button>')
    .addClass('jm-lore-icon-btn')
    .attr({ type: 'button', title: '关闭', 'aria-label': '关闭' })
    .text('×')
    .on('click', closeModal)
    .appendTo($modalHead);

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

function openPanel() {
  if (!panelElement) {
    return;
  }
  panelElement.classList.add('open');
  searchInput?.focus();
}

function closePanel() {
  panelElement?.classList.remove('open');
}

function openModal(content: HTMLElement) {
  if (!modalElement || !modalCardElement) {
    return;
  }
  modalCardElement.querySelectorAll('.jm-lore-popup').forEach(node => node.remove());
  modalCardElement.appendChild(content);
  modalElement.classList.add('open');
  modalElement.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  modalElement?.classList.remove('open');
  modalElement?.setAttribute('aria-hidden', 'true');
  modalCardElement?.querySelectorAll('.jm-lore-popup').forEach(node => node.remove());
}

function renderSearchResults() {
  if (!resultElement) {
    return;
  }
  const ownerDocument = resultElement.ownerDocument;

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
    const empty = ownerDocument.createElement('div');
    empty.className = 'jm-lore-empty';
    empty.textContent = '未找到匹配词条';
    resultElement.appendChild(empty);
    return;
  }

  matches.forEach(entry => {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'jm-lore-result';
    button.addEventListener('click', () => {
      void showEntryPopup(entry);
    });

    const title = ownerDocument.createElement('div');
    title.className = 'jm-lore-result-title';
    title.textContent = entry.title;
    button.appendChild(title);

    const category = ownerDocument.createElement('div');
    category.className = 'jm-lore-result-category';
    category.textContent = entry.category;
    button.appendChild(category);

    const summary = ownerDocument.createElement('div');
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
  return normalizeForSearch(
    [
      entry.title,
      entry.category,
      entry.summary,
      entry.sourceFile,
      ...(entry.aliases ?? []),
      ...(entry.triggers ?? []),
      ...(entry.details ?? []),
    ].join(' '),
  );
}

async function showEntryPopup(entry: LoreEntry) {
  const ownerDocument = getHostDocument();
  const content = ownerDocument.createElement('div');
  content.className = 'jm-lore-popup';

  const titleRow = ownerDocument.createElement('div');
  titleRow.className = 'jm-lore-popup-title';
  const title = ownerDocument.createElement('span');
  title.textContent = entry.title;
  titleRow.appendChild(title);
  const category = ownerDocument.createElement('span');
  category.className = 'jm-lore-popup-category';
  category.textContent = entry.category;
  titleRow.appendChild(category);
  content.appendChild(titleRow);

  const summary = ownerDocument.createElement('div');
  summary.className = 'jm-lore-popup-summary';
  summary.textContent = entry.summary;
  content.appendChild(summary);

  if (entry.details && entry.details.length > 0) {
    const detailList = ownerDocument.createElement('ul');
    detailList.className = 'jm-lore-popup-details';
    entry.details.slice(0, 5).forEach(detail => {
      const item = ownerDocument.createElement('li');
      item.textContent = detail;
      detailList.appendChild(item);
    });
    content.appendChild(detailList);
  }

  const aliases = entry.aliases.filter(alias => alias !== entry.title).slice(0, 12);
  if (aliases.length > 0) {
    const aliasRow = ownerDocument.createElement('div');
    aliasRow.className = 'jm-lore-tag-row';
    aliases.forEach(alias => {
      const tag = ownerDocument.createElement('span');
      tag.className = 'jm-lore-tag';
      tag.textContent = alias;
      aliasRow.appendChild(tag);
    });
    content.appendChild(aliasRow);
  }

  openModal(content);
  void renderEntryImages(entry, content);
}

async function renderEntryImages(entry: LoreEntry, content: HTMLElement) {
  const images = await findImagesForEntry(entry);
  if (!content.isConnected || !modalCardElement?.contains(content)) {
    return;
  }
  if (images.length > 0) {
    const imageGrid = content.ownerDocument.createElement('div');
    imageGrid.className = 'jm-lore-images';
    images.slice(0, MAX_IMAGES_PER_ENTRY).forEach(fileName => {
      const image = content.ownerDocument.createElement('img');
      image.loading = 'lazy';
      image.alt = entry.title;
      image.src = buildImageUrl(fileName);
      imageGrid.appendChild(image);
    });
    content.appendChild(imageGrid);
  }
}

async function findImagesForEntry(entry: LoreEntry) {
  try {
    const imageLookup = await loadImageLookupData();
    const imageNames: string[] = [];

    buildDirectImageKeywords(entry).forEach(keyword => {
      const hasExactMatch = pushImagesForKeyword(keyword, imageLookup, imageNames);
      if (!hasExactMatch) {
        pushLooseImagesForKeyword(keyword, imageLookup.imageIndex, imageNames);
      }
    });

    const searchText = buildEntryImageSearchText(entry);
    const matchedKeywords = imageLookup.allKeywords
      .filter(keyword => searchText.includes(keyword))
      .filter(keyword => !isKeywordCoveredByLongerMatch(keyword, imageLookup.allKeywords, searchText))
      .sort((a, b) => searchText.indexOf(a) - searchText.indexOf(b) || b.length - a.length);

    matchedKeywords.forEach(keyword => {
      pushImagesForKeyword(keyword, imageLookup, imageNames);
    });

    return uniqueStrings(imageNames).filter(isUsableImageFile);
  } catch (error) {
    console.warn('[JM设定百科] 图片索引加载失败。', error);
    return [];
  }
}

function buildDirectImageKeywords(entry: LoreEntry) {
  return uniqueStrings([
    entry.title,
    ...(entry.triggers ?? []),
    ...(entry.aliases ?? []),
    ...(entry.imageKeywords ?? []),
  ])
    .map(keyword => keyword.trim())
    .filter(isUsefulImageKeyword)
    .sort((a, b) => b.length - a.length);
}

function buildEntryImageSearchText(entry: LoreEntry) {
  return [
    entry.title,
    ...(entry.triggers ?? []),
    ...(entry.aliases ?? []),
    entry.summary,
    ...(entry.details ?? []),
    ...(entry.imageKeywords ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}

function pushImagesForKeyword(keyword: string, imageLookup: ImageLookupData, imageNames: string[]) {
  const cleanKeyword = keyword.trim();
  const mainKeyword = imageLookup.synonymMap[cleanKeyword] ?? cleanKeyword;
  const images = imageLookup.imageIndex[mainKeyword] ?? imageLookup.imageIndex[cleanKeyword];
  if (!Array.isArray(images) || images.length === 0) {
    return false;
  }
  imageNames.push(...images);
  return true;
}

function pushLooseImagesForKeyword(keyword: string, imageIndex: ImageIndex, imageNames: string[]) {
  if (keyword.length < 3) {
    return;
  }
  Object.entries(imageIndex).forEach(([indexKey, images]) => {
    if (!isUsefulImageKeyword(indexKey)) {
      return;
    }
    if (indexKey.includes(keyword) || keyword.includes(indexKey)) {
      imageNames.push(...images);
    }
  });
}

function isKeywordCoveredByLongerMatch(keyword: string, allKeywords: string[], searchText: string) {
  return allKeywords.some(
    otherKeyword => otherKeyword.length > keyword.length && otherKeyword.includes(keyword) && searchText.includes(otherKeyword),
  );
}

function isUsefulImageKeyword(keyword: string) {
  const cleanKeyword = keyword.trim();
  if (cleanKeyword.length < 2 || blockedImageKeywords.has(cleanKeyword)) {
    return false;
  }
  return !/\.(?:json|abc)$/iu.test(cleanKeyword);
}

function isUsableImageFile(image: string) {
  return Boolean(image && image !== '非头像.abc' && !/\.(?:json|abc)$/iu.test(image));
}

function buildImageUrl(fileName: string) {
  return `${IMAGE_BASE_URL}${fileName.split('/').map(encodeURIComponent).join('/')}`;
}

async function loadImageLookupData() {
  if (!imageLookupPromise) {
    imageLookupPromise = (async () => {
      const [remoteImageIndexResult, synonymResult] = await Promise.allSettled([
        fetchJson(IMAGE_INDEX_URL),
        fetchJson(SYNONYMS_URL),
      ]);

      const localImageIndex = loadLocalImageIndex();
      const remoteImageIndex =
        remoteImageIndexResult.status === 'fulfilled' ? normalizeImageIndex(remoteImageIndexResult.value) : {};
      const synonymMap = synonymResult.status === 'fulfilled' ? buildSynonymMap(synonymResult.value) : {};

      if (remoteImageIndexResult.status === 'rejected') {
        console.warn('[JM设定百科] 远程图片索引加载失败，已使用本地索引兜底。', remoteImageIndexResult.reason);
      }
      if (synonymResult.status === 'rejected') {
        console.warn('[JM设定百科] 图片别名索引加载失败，将只使用图片主关键词。', synonymResult.reason);
      }

      const imageIndex = mergeImageIndexes(remoteImageIndex, localImageIndex);
      const allKeywords = uniqueStrings([...Object.keys(imageIndex), ...Object.keys(synonymMap)])
        .filter(isUsefulImageKeyword)
        .sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-Hans-CN'));

      return { imageIndex, synonymMap, allKeywords };
    })();
  }
  return imageLookupPromise;
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} 加载失败: ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

function loadLocalImageIndex() {
  try {
    return normalizeImageIndex(JSON.parse(localImageIndexRaw));
  } catch (error) {
    console.warn('[JM设定百科] 本地图片索引解析失败。', error);
    return {};
  }
}

function normalizeImageIndex(raw: unknown) {
  const normalized: ImageIndex = {};
  if (!raw || typeof raw !== 'object') {
    return normalized;
  }

  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (!Array.isArray(value)) {
      return;
    }
    const cleanKey = key.trim();
    const images = value.filter((image): image is string => typeof image === 'string').map(image => image.trim());
    if (!cleanKey || images.length === 0) {
      return;
    }
    normalized[cleanKey] = uniqueStrings([...(normalized[cleanKey] ?? []), ...images]);
  });
  return normalized;
}

function buildSynonymMap(raw: unknown) {
  const synonymMap: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') {
    return synonymMap;
  }

  Object.entries(raw as SynonymIndex).forEach(([mainKeyword, aliases]) => {
    const cleanMainKeyword = mainKeyword.trim();
    if (!cleanMainKeyword || !Array.isArray(aliases)) {
      return;
    }
    synonymMap[cleanMainKeyword] = cleanMainKeyword;
    aliases.forEach(alias => {
      if (typeof alias !== 'string') {
        return;
      }
      const cleanAlias = alias.trim();
      if (cleanAlias) {
        synonymMap[cleanAlias] = cleanMainKeyword;
      }
    });
  });
  return synonymMap;
}

function mergeImageIndexes(...indexes: ImageIndex[]) {
  const merged: ImageIndex = {};
  indexes.forEach(index => {
    Object.entries(index).forEach(([keyword, images]) => {
      merged[keyword] = uniqueStrings([...(merged[keyword] ?? []), ...images]);
    });
  });
  return merged;
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
    if (!isHTMLElement(element)) {
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
  const ownerDocument = root.ownerDocument;
  const nodeFilter = ownerDocument.defaultView?.NodeFilter ?? NodeFilter;

  const walker = ownerDocument.createTreeWalker(root, nodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest(ignoredAncestorSelector) ||
        parent.closest(hiddenLoreAncestorSelector) ||
        isInsideClosedDetails(node)
      ) {
        return nodeFilter.FILTER_REJECT;
      }
      const text = node.nodeValue ?? '';
      if (!text.trim() || containsHiddenSyntax(text)) {
        return nodeFilter.FILTER_REJECT;
      }
      return nodeFilter.FILTER_ACCEPT;
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

function isInsideClosedDetails(node: Node) {
  let current = node.parentElement;
  while (current) {
    if (current.tagName === 'DETAILS') {
      const details = current as HTMLDetailsElement;
      if (!details.open) {
        const summary = details.querySelector('summary');
        if (!summary?.contains(node)) {
          return true;
        }
      }
    }
    current = current.parentElement;
  }
  return false;
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
  const ownerDocument = node.ownerDocument;
  const fragment = ownerDocument.createDocumentFragment();

  while ((match = linkRegex.exec(text)) !== null) {
    const alias = match[0];
    const candidate = linkCandidates.find(item => item.alias === alias);
    if (!candidate) {
      continue;
    }

    if (match.index > cursor) {
      fragment.appendChild(ownerDocument.createTextNode(text.slice(cursor, match.index)));
    }

    if (added < remainingLinks && !usedEntryIds.has(candidate.entry.id)) {
      fragment.appendChild(createLoreLink(ownerDocument, alias, candidate.entry));
      usedEntryIds.add(candidate.entry.id);
      added += 1;
    } else {
      fragment.appendChild(ownerDocument.createTextNode(alias));
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
    fragment.appendChild(ownerDocument.createTextNode(text.slice(cursor)));
  }

  node.parentNode?.replaceChild(fragment, node);
  return added;
}

function createLoreLink(ownerDocument: Document, text: string, entry: LoreEntry) {
  const link = ownerDocument.createElement('a');
  link.href = '#';
  link.className = 'jm-lore-link';
  link.dataset.entryId = entry.id;
  link.textContent = text;
  link.title = entry.title;
  link.addEventListener('click', event => {
    event.preventDefault();
    void showEntryPopup(entry);
  });
  return link;
}

function resetEnhancedElement(root: HTMLElement) {
  root.querySelectorAll('a.jm-lore-link').forEach(link => {
    link.replaceWith(link.ownerDocument.createTextNode(link.textContent ?? ''));
  });
  root.removeAttribute(ENHANCED_ATTR);
}

function installEventListeners() {
  appendInexistentScriptButtons(SCRIPT_BUTTONS);
  stops.push(
    eventOn(getButtonEvent('打开百科'), () => {
      openPanel();
    }).stop,
  );
  stops.push(
    eventOn(getButtonEvent('重扫正文'), () => {
      enhanceVisibleMessages();
      toastr.info('已重新扫描当前可见楼层。', 'JM设定百科');
    }).stop,
  );

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

  $(window).on(`pagehide.${SCRIPT_KEY}`, cleanup);
  $(document).on(`keydown.${SCRIPT_KEY}`, event => {
    if (event.key === 'Escape') {
      closeModal();
      closePanel();
    }
  });
}

function cleanup() {
  stops.splice(0).forEach(stop => stop());
  $(document).off(`.${SCRIPT_KEY}`);
  $(window).off(`.${SCRIPT_KEY}`);
  getHostDocument().querySelectorAll<HTMLElement>(`[${ENHANCED_ATTR}="1"]`).forEach(resetEnhancedElement);
  $(`[script_id='${getSafeScriptId()}']`).remove();
}

function getSafeScriptId() {
  return typeof getScriptId === 'function' ? getScriptId() : SCRIPT_KEY;
}

function getHostDocument() {
  return window.parent?.document ?? document;
}

function isHTMLElement(element: Element): element is HTMLElement {
  const htmlElement = element.ownerDocument.defaultView?.HTMLElement ?? HTMLElement;
  return element instanceof htmlElement;
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
