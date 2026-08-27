// 存放所有的常量和配置项

// 调试模式开关 - 生产环境设为 false
export const DEBUG_MODE = false;

export const LOREBOOK_PANEL_ID = 'enhanced-lorebook-panel';
export const LOREBOOK_BUTTON_ID = 'enhanced-lorebook-button';
export const LOREBOOK_FLOATING_BUBBLE_ID = 'enhanced-lorebook-floating-bubble';
export const LOREBOOK_BUTTON_ICON = 'fa-solid fa-book-open';
export const LOREBOOK_BUTTON_TOOLTIP = '角色世界书';
export const LOREBOOK_BUTTON_TEXT_IN_MENU = '世界书编辑助手';

// 主面板移动布局的唯一宽度断点。JS 结构选择与 CSS 媒体查询必须共同使用此值。
export const MOBILE_LAYOUT_BREAKPOINT = 768;

// 标签页相关常量
export const LOREBOOK_MINIMIZE_BUTTON_CLASS = 'minimize-button';
export const CHARACTER_TAB_ID = 'character-lorebook-tab';
export const GLOBAL_TAB_ID = 'global-lorebook-tab';
export const AI_TAB_ID = 'ai-lorebook-tab';
export const CHARACTER_CONTENT_ID = 'character-lorebook-content';
export const GLOBAL_CONTENT_ID = 'global-lorebook-content';
export const AI_CONTENT_ID = 'ai-lorebook-content';
export const CHARACTER_DETAIL_CONTAINER_ID = 'character-lorebook-detail';
export const GLOBAL_DETAIL_CONTAINER_ID = 'global-lorebook-detail';
export const ACTIVE_TAB_CLASS = 'active-tab';
export const ACTIVE_CONTENT_CLASS = 'active-content';

export const LOREBOOK_UI_SORT_KEY = 'enhanced-lorebook-ui-sort';
export let hasInitializedLorebooks = false; // This state might be better managed elsewhere, but we'll keep it here for now.
export function setHasInitializedLorebooks(value) {
  hasInitializedLorebooks = value;
}

// 排序功能相关常量和状态
export const LOREBOOK_SORT_PREF_KEY = 'enhanced-lorebook-sort-pref';
export let lorebookSorts = {}; // e.g., { 'lorebookName': { by: 'uid', dir: 'desc' } }
export function setLorebookSorts(value) {
  lorebookSorts = value;
}

export const LOREBOOK_LIST_CONTAINER_ID = 'lorebook-entries-list';
export const GLOBAL_LOREBOOK_LIST_CONTAINER_ID = 'global-lorebook-entries-list';

// 全局世界书选择器
export const GLOBAL_WORLDBOOK_SELECTOR_ID = 'global-lorebook-selector';
export const GLOBAL_WORLDBOOK_SEARCH_ID = 'global-lorebook-search';
export const GLOBAL_WORLDBOOK_TAGS_CONTAINER_ID = 'global-lorebook-tags-container';

export const LOREBOOK_ENTRY_CLASS = 'lorebook-entry-item';
export const LOREBOOK_EDITOR_PANEL_ID = 'lorebook-entry-editor';
export const LOREBOOK_TOGGLE_SWITCH_CLASS = 'lorebook-entry-toggle';
export const LOREBOOK_ENTRY_CHECKBOX_CLASS = 'entry-select-checkbox';

// 性能优化：虚拟滚动相关配置
export const ENTRIES_PER_PAGE = 30; // 每次加载30个条目
export let intersectionObserver;
export function setIntersectionObserver(value) {
  intersectionObserver = value;
}

export let allEntriesData = {}; // 用于存储每个世界书的完整条目数据
export function setAllEntriesData(value) {
  allEntriesData = value;
}
export let virtualScrollers = {}; // 用于存储每个世界书的虚拟滚动实例
export function setVirtualScrollers(value) {
  virtualScrollers = value;
}

export let isApiReady = false;
export function setIsApiReady(value) {
  isApiReady = value;
}

// 本地存储键
export const LOREBOOK_THEME_KEY = 'enhanced-lorebook-theme';
export const PINNED_GLOBAL_WORLDBOOKS_KEY = 'pinned-global-worldbooks';
export const GLOBAL_WORLDBOOK_PRESETS_KEY = 'global-lorebook-presets';
export const ENTRY_TOGGLE_PRESETS_KEY = 'enhanced-lorebook-entry-toggle-presets';
export const HIGHLIGHT_ACTIVE_ENTRIES_KEY = 'enhanced-lorebook-highlight-active';
export const PINNED_ENTRIES_KEY = 'enhanced-lorebook-pinned-entries';

// 移动端长按提示
export const MOBILE_TOOLTIP_ID = 'mobile-tooltip';
