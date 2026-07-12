import loreEntriesRaw from './lore-entries.json?raw';

type LoreEntry = {
  id: string;
  title: string;
  category: string;
  aliases?: string[];
  triggers?: string[];
  summary: string;
  details?: string[];
  images?: string[];
  /** @deprecated 旧的 imageIndex 关键词兜底方案已停用，图片只从 images 读取。 */
  imageKeywords?: string[];
  autoLink?: boolean;
};

type DragLikeEvent = MouseEvent | TouchEvent;

const SCRIPT_KEY = 'jm-lore-encyclopedia';
const ENHANCED_ATTR = 'data-jm-lore-enhanced';
const MAX_LINKS_PER_MESSAGE = 12;
const MAX_IMAGES_PER_ENTRY = 8;
const IMAGE_BASE_URL = 'https://raw.githubusercontent.com/jam4435/my-image-hosting/main/jm/';
const FAB_ICON_FILE = '女仆.webp';
const FAB_POSITION_STORAGE_KEY = `${SCRIPT_KEY}:fab-position`;
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
let searchInput: HTMLInputElement | null = null;
let rootElement: HTMLElement | null = null;
let fabElement: HTMLButtonElement | null = null;
let panelElement: HTMLElement | null = null;
let resultElement: HTMLElement | null = null;
let modalElement: HTMLElement | null = null;
let modalCardElement: HTMLElement | null = null;
let imageViewerElement: HTMLElement | null = null;
let suppressNextFabClick = false;
let suppressNextFabClickTimer: number | null = null;
let panelWasManuallyPositioned = false;
let modalCardWasManuallyPositioned = false;

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
    .filter(entry => entry.autoLink !== false)
    .forEach(entry => {
      const aliases = entry.aliases ?? [];
      const triggers = entry.triggers && entry.triggers.length > 0 ? entry.triggers : [entry.title, ...aliases];
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
        width: 48px;
        height: 48px;
        z-index: 10050;
        box-sizing: border-box;
        font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
        color: #f4f0e8;
      }
      .jm-lore-fab {
        position: relative;
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border: 1px solid rgba(218, 185, 111, 0.62);
        border-radius: 8px;
        overflow: hidden;
        padding: 0;
        background: rgba(21, 24, 23, 0.98);
        color: #f7df9b;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
        cursor: grab;
        font-size: 20px;
        font-weight: 700;
        line-height: 1;
        touch-action: none;
        user-select: none;
      }
      .jm-lore-fab.dragging {
        cursor: grabbing;
      }
      .jm-lore-fab::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background:
          linear-gradient(145deg, rgba(255, 255, 255, 0.14), transparent 34%),
          linear-gradient(0deg, rgba(0, 0, 0, 0.22), transparent 58%);
        pointer-events: none;
      }
      .jm-lore-fab img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
      }
      .jm-lore-fab-label {
        display: none;
      }
      .jm-lore-fab-fallback .jm-lore-fab-label {
        display: block;
      }
      .jm-lore-fab:hover,
      .jm-lore-fab:focus-visible {
        border-color: #e6c97a;
        box-shadow: 0 16px 34px rgba(0, 0, 0, 0.54);
        outline: none;
      }
      .jm-lore-panel {
        position: fixed;
        z-index: 10051;
        right: 22px;
        bottom: 82px;
        width: min(430px, calc(100vw - 28px));
        max-height: min(620px, calc(100dvh - 28px));
        display: none;
        flex-direction: column;
        overflow: hidden;
        box-sizing: border-box;
        border: 1px solid rgba(218, 185, 111, 0.36);
        border-radius: 8px;
        background:
          linear-gradient(160deg, rgba(18, 20, 19, 0.98), rgba(64, 15, 24, 0.97));
        box-shadow: 0 18px 46px rgba(0, 0, 0, 0.58);
      }
      .jm-lore-panel.dragging {
        user-select: none;
      }
      .jm-lore-panel.open {
        display: flex;
      }
      .jm-lore-modal {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        width: 100dvw;
        height: 100dvh;
        z-index: 10060;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        background: rgba(7, 8, 8, 0.72);
      }
      .jm-lore-modal.open {
        display: flex;
      }
      .jm-lore-modal-card {
        width: min(760px, calc(100vw - 32px));
        max-height: min(82dvh, calc(100dvh - 40px));
        overflow: auto;
        box-sizing: border-box;
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
        cursor: move;
        touch-action: none;
        user-select: none;
        padding: 10px 12px 0;
        background: linear-gradient(180deg, rgba(18, 20, 19, 0.98), rgba(18, 20, 19, 0.78), transparent);
      }
      .jm-lore-header {
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: move;
        touch-action: none;
        user-select: none;
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
        cursor: zoom-in;
      }
      .jm-lore-image-viewer {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        width: 100dvw;
        height: 100dvh;
        z-index: 10070;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        background: rgba(4, 5, 5, 0.86);
      }
      .jm-lore-image-viewer.open {
        display: flex;
      }
      .jm-lore-image-frame {
        position: relative;
        display: grid;
        gap: 10px;
        max-width: min(94vw, 1120px);
        max-height: min(92dvh, 860px);
      }
      .jm-lore-image-frame img {
        max-width: 100%;
        max-height: calc(92dvh - 52px);
        object-fit: contain;
        border-radius: 8px;
        border: 1px solid rgba(218, 185, 111, 0.32);
        background: rgba(0, 0, 0, 0.28);
        box-shadow: 0 24px 58px rgba(0, 0, 0, 0.62);
      }
      .jm-lore-image-caption {
        color: rgba(244, 240, 232, 0.78);
        font-size: 12px;
        text-align: center;
        overflow-wrap: anywhere;
      }
      .jm-lore-image-close {
        position: absolute;
        top: -14px;
        right: -14px;
        width: 34px;
        height: 34px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 7px;
        background: rgba(20, 20, 20, 0.88);
        color: #f4f0e8;
        cursor: pointer;
        font-size: 18px;
      }
      @media (max-width: 520px) {
        .jm-lore-root {
          right: 14px;
          bottom: 14px;
        }
        .jm-lore-panel {
          width: calc(100vw - 28px);
          max-height: calc(100dvh - 28px);
        }
        .jm-lore-modal,
        .jm-lore-image-viewer {
          padding: 10px;
          align-items: center;
          justify-content: center;
        }
        .jm-lore-modal-card {
          width: calc(100vw - 20px);
          max-height: calc(100dvh - 20px);
        }
        .jm-lore-popup {
          padding: 12px 14px 18px;
        }
        .jm-lore-image-frame {
          max-width: calc(100vw - 20px);
          max-height: calc(100dvh - 20px);
        }
        .jm-lore-image-frame img {
          max-height: calc(100dvh - 62px);
        }
        .jm-lore-image-close {
          top: 6px;
          right: 6px;
          background: rgba(20, 20, 20, 0.94);
        }
      }
    `,
    )
    .appendTo(getHostDocument().head);
}

function mountUi() {
  const rootId = `${SCRIPT_KEY}-root`;
  const hostDocument = getHostDocument();
  hostDocument.querySelectorAll(`[script_id='${getSafeScriptId()}']:not(style)`).forEach(node => node.remove());

  const $root = $('<div>')
    .attr('id', rootId)
    .attr('script_id', getSafeScriptId())
    .addClass('jm-lore-root')
    .appendTo(hostDocument.body);
  rootElement = $root[0];
  restoreFabPosition(rootElement);

  const $panel = $('<section>')
    .addClass('jm-lore-panel')
    .attr('script_id', getSafeScriptId())
    .attr({ role: 'dialog', 'aria-label': 'JM设定索引' })
    .appendTo(hostDocument.body);
  panelElement = $panel[0];

  const $modal = $('<div>')
    .addClass('jm-lore-modal')
    .attr('script_id', getSafeScriptId())
    .attr({ 'aria-hidden': 'true' })
    .on('click', event => {
      if (event.target === event.currentTarget) {
        closeModal();
      }
    })
    .appendTo(hostDocument.body);
  modalElement = $modal[0];

  const $modalCard = $('<section>')
    .addClass('jm-lore-modal-card')
    .attr({ role: 'dialog', 'aria-label': 'JM设定百科详情' })
    .appendTo($modal);
  modalCardElement = $modalCard[0];

  const $modalHead = $('<div>').addClass('jm-lore-modal-head').appendTo($modalCard);
  installFloatingDrag($modalCard[0], $modalHead[0], {
    draggableClassTarget: $modalCard[0],
    onStop: dragged => {
      if (dragged) {
        modalCardWasManuallyPositioned = true;
      }
    },
  });
  $('<button>')
    .addClass('jm-lore-icon-btn')
    .attr({ type: 'button', title: '关闭', 'aria-label': '关闭' })
    .text('×')
    .on('click', closeModal)
    .appendTo($modalHead);

  const $header = $('<div>').addClass('jm-lore-header').appendTo($panel);
  installFloatingDrag(panelElement, $header[0], {
    draggableClassTarget: panelElement,
    onMove: () => {
      panelElement.style.right = 'auto';
      panelElement.style.bottom = 'auto';
    },
    onStop: dragged => {
      if (dragged) {
        panelWasManuallyPositioned = true;
      }
    },
  });
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

  imageViewerElement = $('<div>')
    .addClass('jm-lore-image-viewer')
    .attr('script_id', getSafeScriptId())
    .attr({ 'aria-hidden': 'true' })
    .on('click', event => {
      if (event.target === event.currentTarget) {
        closeImageViewer();
      }
    })
    .appendTo(hostDocument.body)[0];

  const $fab = $('<button>')
    .addClass('jm-lore-fab')
    .attr({ type: 'button', title: 'JM设定索引', 'aria-label': 'JM设定索引' })
    .appendTo($root);
  fabElement = $fab[0] as HTMLButtonElement;
  $('<img>')
    .attr({ src: buildImageUrl(FAB_ICON_FILE), alt: '' })
    .on('error', () => {
      $fab.addClass('jm-lore-fab-fallback');
    })
    .appendTo($fab);
  $('<span>').addClass('jm-lore-fab-label').text('典').appendTo($fab);
  $fab.on('click', event => {
    if (suppressNextFabClick) {
      clearSuppressedFabClick();
      event.preventDefault();
      return;
    }
    togglePanel();
  });
  installFabDrag(fabElement, rootElement);

  renderSearchResults();
}

function togglePanel() {
  if (!panelElement) {
    return;
  }
  panelElement.classList.toggle('open');
  if (panelElement.classList.contains('open')) {
    positionPanelForOpen();
    focusSearchInputIfComfortable();
  }
}

function openPanel() {
  if (!panelElement) {
    return;
  }
  panelElement.classList.add('open');
  positionPanelForOpen();
  focusSearchInputIfComfortable();
}

function closePanel() {
  panelElement?.classList.remove('open');
}

function focusSearchInputIfComfortable() {
  if (!searchInput || shouldAvoidMobileAutofocus()) {
    return;
  }
  searchInput.focus();
}

function shouldAvoidMobileAutofocus() {
  const hostWindow = getHostWindow();
  return getViewportWidth() <= 520 || Boolean(hostWindow.matchMedia?.('(pointer: coarse)').matches);
}

function restoreFabPosition(root: HTMLElement) {
  const savedPosition = readStoredFabPosition();
  if (!savedPosition) {
    return;
  }
  setFabPosition(root, savedPosition.x, savedPosition.y, false);
}

function readStoredFabPosition() {
  try {
    const raw = getHostWindow().localStorage.getItem(FAB_POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
      return null;
    }
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function installFabDrag(button: HTMLButtonElement, root: HTMLElement) {
  installFloatingDrag(root, button, {
    draggableClassTarget: button,
    onMove: positionPanelNearFab,
    onStop: dragged => {
      if (!dragged) {
        return;
      }
      suppressUpcomingFabClick();
      persistFabPosition(root);
      positionPanelNearFab();
    },
    onTap: () => {
      suppressUpcomingFabClick();
      togglePanel();
    },
  });
}

function suppressUpcomingFabClick() {
  suppressNextFabClick = true;
  if (suppressNextFabClickTimer !== null) {
    getHostWindow().clearTimeout(suppressNextFabClickTimer);
  }
  suppressNextFabClickTimer = getHostWindow().setTimeout(clearSuppressedFabClick, 450);
}

function clearSuppressedFabClick() {
  suppressNextFabClick = false;
  if (suppressNextFabClickTimer !== null) {
    getHostWindow().clearTimeout(suppressNextFabClickTimer);
    suppressNextFabClickTimer = null;
  }
}

function installFloatingDrag(
  target: HTMLElement,
  handle: HTMLElement,
  options: {
    draggableClassTarget?: HTMLElement;
    onMove?: () => void;
    onStop?: (dragged: boolean) => void;
    onTap?: (event: Event) => void;
  } = {},
) {
  const hostDocument = getHostDocument();
  let startPointerX = 0;
  let startPointerY = 0;
  let startTargetX = 0;
  let startTargetY = 0;
  let active = false;
  let dragged = false;

  const classTarget = options.draggableClassTarget ?? target;

  const start = (event: Event) => {
    const dragEvent = event as DragLikeEvent;
    if (active || !isPrimaryDragStart(dragEvent) || isInteractiveDragTarget(dragEvent.target, handle)) {
      return;
    }
    const point = getDragPoint(dragEvent);
    if (!point) {
      return;
    }
    const rect = target.getBoundingClientRect();
    active = true;
    dragged = false;
    startPointerX = point.x;
    startPointerY = point.y;
    startTargetX = rect.left;
    startTargetY = rect.top;
    target.style.left = `${rect.left}px`;
    target.style.top = `${rect.top}px`;
    target.style.right = 'auto';
    target.style.bottom = 'auto';
    if (target === modalCardElement) {
      target.style.position = 'fixed';
    }
  };

  const move = (event: Event) => {
    if (!active) {
      return;
    }
    const point = getDragPoint(event as DragLikeEvent);
    if (!point) {
      return;
    }
    const deltaX = point.x - startPointerX;
    const deltaY = point.y - startPointerY;
    if (!dragged && Math.hypot(deltaX, deltaY) < 4) {
      return;
    }
    dragged = true;
    classTarget.classList.add('dragging');
    setFloatingElementPosition(target, startTargetX + deltaX, startTargetY + deltaY);
    options.onMove?.();
    event.preventDefault();
  };

  const stop = (event: Event) => {
    if (!active) {
      return;
    }
    classTarget.classList.remove('dragging');
    const wasDragged = dragged;
    active = false;
    options.onStop?.(wasDragged);
    if (!wasDragged && event.type === 'touchend' && options.onTap) {
      event.preventDefault();
      options.onTap(event);
    }
    dragged = false;
  };

  handle.addEventListener('mousedown', start);
  handle.addEventListener('touchstart', start, { passive: false });
  hostDocument.addEventListener('mousemove', move, { passive: false });
  hostDocument.addEventListener('touchmove', move, { passive: false });
  hostDocument.addEventListener('mouseup', stop);
  hostDocument.addEventListener('touchend', stop, { passive: false });
  hostDocument.addEventListener('touchcancel', stop);

  stops.push(() => {
    handle.removeEventListener('mousedown', start);
    handle.removeEventListener('touchstart', start);
    hostDocument.removeEventListener('mousemove', move);
    hostDocument.removeEventListener('touchmove', move);
    hostDocument.removeEventListener('mouseup', stop);
    hostDocument.removeEventListener('touchend', stop);
    hostDocument.removeEventListener('touchcancel', stop);
  });
}

function setFloatingElementPosition(element: HTMLElement, x: number, y: number) {
  const rect = element.getBoundingClientRect();
  const bounds = getViewportBounds();
  const width = rect.width || element.offsetWidth || 48;
  const height = rect.height || element.offsetHeight || 48;
  const nextX = clamp(x, bounds.left + 8, bounds.right - width - 8);
  const nextY = clamp(y, bounds.top + 8, bounds.bottom - height - 8);

  element.style.left = `${nextX}px`;
  element.style.top = `${nextY}px`;
  element.style.right = 'auto';
  element.style.bottom = 'auto';
}

function getDragPoint(event: DragLikeEvent) {
  if ('touches' in event && event.touches.length > 0) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  if ('changedTouches' in event && event.changedTouches.length > 0) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }
  if ('clientX' in event) {
    return { x: event.clientX, y: event.clientY };
  }
  return null;
}

function isPrimaryDragStart(event: DragLikeEvent) {
  return event.type !== 'mousedown' || !('button' in event) || event.button === 0;
}

function isInteractiveDragTarget(target: EventTarget | null, handle: HTMLElement) {
  if (!target || !isHTMLElementLike(target)) {
    return false;
  }
  const interactive = target.closest('button, input, textarea, select, option, a, [data-no-drag]');
  return Boolean(interactive && interactive !== handle);
}

function setFabPosition(root: HTMLElement, x: number, y: number, persist: boolean) {
  const bounds = getViewportBounds();
  const rect = root.getBoundingClientRect();
  const width = rect.width || 48;
  const height = rect.height || 48;
  const nextX = clamp(x, bounds.left + 8, bounds.right - width - 8);
  const nextY = clamp(y, bounds.top + 8, bounds.bottom - height - 8);

  root.style.left = `${nextX}px`;
  root.style.top = `${nextY}px`;
  root.style.right = 'auto';
  root.style.bottom = 'auto';
  if (persist) {
    persistFabPosition(root);
  }
}

function persistFabPosition(root: HTMLElement) {
  const rect = root.getBoundingClientRect();
  try {
    getHostWindow().localStorage.setItem(
      FAB_POSITION_STORAGE_KEY,
      JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }),
    );
  } catch (error) {
    console.warn('[JM设定百科] 按钮位置保存失败。', error);
  }
}

function clampFabToViewport() {
  if (!rootElement) {
    return;
  }
  const rect = rootElement.getBoundingClientRect();
  setFabPosition(rootElement, rect.left, rect.top, true);
}

function positionPanelForOpen() {
  if (!panelElement) {
    return;
  }
  if (panelWasManuallyPositioned) {
    clampFloatingElementToViewport(panelElement);
    return;
  }
  positionPanelNearFab({ force: true });
}

function positionPanelNearFab(options: { force?: boolean } = {}) {
  if (!rootElement || !panelElement || !panelElement.classList.contains('open')) {
    return;
  }
  if (panelWasManuallyPositioned && !options.force) {
    return;
  }

  const bounds = getViewportBounds();
  const margin = 14;
  const gap = 10;
  const fabRect = rootElement.getBoundingClientRect();
  const panelRect = panelElement.getBoundingClientRect();
  const width = panelRect.width || Math.min(430, bounds.width - margin * 2);
  const height = panelRect.height || Math.min(620, bounds.height - 96);
  const maxLeft = bounds.right - width - margin;
  const maxTop = bounds.bottom - height - margin;

  const preferredLeft = fabRect.right - width;
  let nextLeft = clamp(preferredLeft, bounds.left + margin, maxLeft);
  let nextTop = fabRect.top - height - gap;
  if (nextTop < bounds.top + margin) {
    nextTop = fabRect.bottom + gap;
  }
  nextTop = clamp(nextTop, bounds.top + margin, maxTop);

  if (Number.isNaN(nextLeft)) {
    nextLeft = bounds.left + margin;
  }
  if (Number.isNaN(nextTop)) {
    nextTop = bounds.top + margin;
  }

  panelElement.style.left = `${nextLeft}px`;
  panelElement.style.top = `${nextTop}px`;
  panelElement.style.right = 'auto';
  panelElement.style.bottom = 'auto';
}

function clampOpenFloatingWindows() {
  if (panelElement?.classList.contains('open')) {
    if (panelWasManuallyPositioned) {
      clampFloatingElementToViewport(panelElement);
    } else {
      positionPanelNearFab({ force: true });
    }
  }
  if (modalElement?.classList.contains('open') && modalCardElement && modalCardWasManuallyPositioned) {
    clampFloatingElementToViewport(modalCardElement);
  }
}

function clampFloatingElementToViewport(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  setFloatingElementPosition(element, rect.left, rect.top);
}

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function getViewportBounds() {
  const hostWindow = getHostWindow();
  const hostDocument = getHostDocument();
  const visualViewport = hostWindow.visualViewport;
  const width = Math.floor(visualViewport?.width ?? hostWindow.innerWidth ?? hostDocument.documentElement.clientWidth ?? 0);
  const height = Math.floor(visualViewport?.height ?? hostWindow.innerHeight ?? hostDocument.documentElement.clientHeight ?? 0);
  const left = Math.floor(visualViewport?.offsetLeft ?? 0);
  const top = Math.floor(visualViewport?.offsetTop ?? 0);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function getViewportWidth() {
  return getViewportBounds().width;
}

function getViewportHeight() {
  return getViewportBounds().height;
}

function openModal(content: HTMLElement) {
  if (!modalElement || !modalCardElement) {
    return;
  }
  modalCardElement.querySelectorAll('.jm-lore-popup').forEach(node => node.remove());
  modalCardElement.appendChild(content);
  modalElement.classList.add('open');
  modalElement.setAttribute('aria-hidden', 'false');
  if (modalCardWasManuallyPositioned) {
    clampFloatingElementToViewport(modalCardElement);
  } else {
    modalCardElement.style.position = '';
    modalCardElement.style.left = '';
    modalCardElement.style.top = '';
    modalCardElement.style.right = '';
    modalCardElement.style.bottom = '';
  }
}

function closeModal() {
  modalElement?.classList.remove('open');
  modalElement?.setAttribute('aria-hidden', 'true');
  modalCardElement?.querySelectorAll('.jm-lore-popup').forEach(node => node.remove());
}

function openImageViewer(src: string, alt: string, caption: string) {
  if (!imageViewerElement) {
    return;
  }
  const ownerDocument = imageViewerElement.ownerDocument;
  const frame = ownerDocument.createElement('div');
  frame.className = 'jm-lore-image-frame';

  const closeButton = ownerDocument.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'jm-lore-image-close';
  closeButton.setAttribute('aria-label', '关闭图片');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', closeImageViewer);
  frame.appendChild(closeButton);

  const image = ownerDocument.createElement('img');
  image.src = src;
  image.alt = alt;
  frame.appendChild(image);

  const label = ownerDocument.createElement('div');
  label.className = 'jm-lore-image-caption';
  label.textContent = caption;
  frame.appendChild(label);

  imageViewerElement.replaceChildren(frame);
  imageViewerElement.classList.add('open');
  imageViewerElement.setAttribute('aria-hidden', 'false');
  closeButton.focus();
}

function closeImageViewer() {
  imageViewerElement?.classList.remove('open');
  imageViewerElement?.setAttribute('aria-hidden', 'true');
  imageViewerElement?.replaceChildren();
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

  const aliases = (entry.aliases ?? []).filter(alias => alias !== entry.title).slice(0, 12);
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
      const imageUrl = buildImageUrl(fileName);
      const image = content.ownerDocument.createElement('img');
      image.loading = 'lazy';
      image.alt = entry.title;
      image.tabIndex = 0;
      image.title = entry.title;
      image.src = imageUrl;
      image.addEventListener('click', () => {
        openImageViewer(imageUrl, entry.title, entry.title);
      });
      image.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openImageViewer(imageUrl, entry.title, entry.title);
        }
      });
      image.addEventListener(
        'error',
        () => {
          image.remove();
          if (!imageGrid.querySelector('img')) {
            imageGrid.remove();
          }
        },
        { once: true },
      );
      imageGrid.appendChild(image);
    });
    content.appendChild(imageGrid);
  }
}

async function findImagesForEntry(entry: LoreEntry) {
  // 旧方案已停用：不再根据 title/aliases/summary/details 去匹配 imageIndex.json 或 synonyms.json。
  // 现在只展示词条 JSON 中人工/半人工确认过的 images，避免泛词导致图片误命中。
  return uniqueStrings((entry.images ?? []).map(image => image.trim())).filter(isUsableImageFile);
}

function isUsableImageFile(image: string) {
  return Boolean(image && image !== '非头像.abc' && !/\.(?:json|abc)$/iu.test(image));
}

function buildImageUrl(fileName: string) {
  return `${IMAGE_BASE_URL}${fileName.split('/').map(encodeURIComponent).join('/')}`;
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
  const hostWindow = getHostWindow();
  const hostDocument = getHostDocument();

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

  const handleViewportChange = () => {
    clampFabToViewport();
    positionPanelNearFab();
    clampOpenFloatingWindows();
  };
  $(hostWindow).on(`resize.${SCRIPT_KEY} orientationchange.${SCRIPT_KEY}`, handleViewportChange);
  hostWindow.visualViewport?.addEventListener('resize', handleViewportChange);
  hostWindow.visualViewport?.addEventListener('scroll', handleViewportChange);
  stops.push(() => {
    hostWindow.visualViewport?.removeEventListener('resize', handleViewportChange);
    hostWindow.visualViewport?.removeEventListener('scroll', handleViewportChange);
  });
  $(window).on(`pagehide.${SCRIPT_KEY}`, cleanup);
  $(hostDocument).on(`keydown.${SCRIPT_KEY}`, event => {
    if (event.key === 'Escape') {
      if (imageViewerElement?.classList.contains('open')) {
        closeImageViewer();
        return;
      }
      closeModal();
      closePanel();
    }
  });
}

function cleanup() {
  clearSuppressedFabClick();
  stops.splice(0).forEach(stop => stop());
  $(document).off(`.${SCRIPT_KEY}`);
  $(window).off(`.${SCRIPT_KEY}`);
  $(getHostDocument()).off(`.${SCRIPT_KEY}`);
  $(getHostWindow()).off(`.${SCRIPT_KEY}`);
  getHostDocument().querySelectorAll<HTMLElement>(`[${ENHANCED_ATTR}="1"]`).forEach(resetEnhancedElement);
  getHostDocument().querySelectorAll(`[script_id='${getSafeScriptId()}']`).forEach(node => node.remove());
}

function getSafeScriptId() {
  return typeof getScriptId === 'function' ? getScriptId() : SCRIPT_KEY;
}

function getHostWindow() {
  try {
    if (window.top?.document) {
      return window.top;
    }
  } catch {
    // Cross-origin frames are not expected here, but parent is still the safest fallback.
  }
  return window.parent ?? window;
}

function getHostDocument() {
  return getHostWindow().document ?? document;
}

function isHTMLElement(element: Element): element is HTMLElement {
  const htmlElement = element.ownerDocument.defaultView?.HTMLElement ?? HTMLElement;
  return element instanceof htmlElement;
}

function isHTMLElementLike(target: EventTarget): target is HTMLElement {
  const hostHTMLElement = getHostDocument().defaultView?.HTMLElement ?? HTMLElement;
  return target instanceof hostHTMLElement;
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
