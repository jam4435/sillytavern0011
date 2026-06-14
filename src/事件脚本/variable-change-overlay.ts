import {
  collectVariableTopLevelGroups,
  createActualVariableChanges,
  createEmptyVariableChangeSummary,
  formatVariableDetailValue,
  parseDeclaredVariableChanges,
  readCurrentStatDataSnapshot,
  readStatDataSnapshotFromUnknown,
  type VariableActualChange,
  type VariableChangeSummary,
  type VariableDeclaredChange,
} from '../武侠/utils/variableChanges';

type ChatRole = 'system' | 'assistant' | 'user';

type ChatMessageWithSwipes = {
  message_id: number;
  role: ChatRole;
  is_hidden?: boolean;
  message?: string;
  swipes?: string[];
  swipe_id?: number;
};

type ActiveVariableTurn = {
  turnId: number;
  startedAfterMessageId: number;
  baselineStatData: Record<string, unknown> | null;
  assistantMessageId?: number;
};

type EraWriteDoneDetail = {
  stat?: unknown;
  statWithoutMeta?: unknown;
};

const STYLE_ID = 'wuxia-variable-change-overlay-style';
const BAR_CLASS = 'wuxia-variable-change-overlay';
const MAX_RENDER_RETRIES = 30;
const RENDER_RETRY_DELAY_MS = 250;

const ACTION_LABELS = {
  insert: '新增',
  edit: '修改',
  delete: '删除',
} as const;

const STATUS_LABELS: Record<VariableChangeSummary['status'], string> = {
  tracking: '追踪中',
  'reply-recorded': '已记录回复',
  settled: '已更新',
  error: '基线缺失',
};

let activeTurn: ActiveVariableTurn | null = null;
let currentSummary: VariableChangeSummary | null = null;
let nextTurnId = 0;
let mvuVariableListener: { stop: () => void } | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const getTH = () => (globalThis as typeof globalThis & { TavernHelper?: Record<string, unknown> }).TavernHelper;

const getHelperFunction = <T extends (...args: any[]) => any>(name: string): T | null => {
  const directValue = (globalThis as Record<string, unknown>)[name];
  if (typeof directValue === 'function') {
    return directValue as T;
  }

  const helperValue = getTH()?.[name];
  return typeof helperValue === 'function' ? helperValue as T : null;
};

function getActiveMessageText(message: ChatMessageWithSwipes): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  return message.message || swipes[swipeIndex] || swipes[0] || '';
}

function getAllChatMessages(): ChatMessageWithSwipes[] {
  const getMessages = getHelperFunction<(range: string, options: Record<string, unknown>) => ChatMessageWithSwipes[]>(
    'getChatMessages',
  );
  if (!getMessages) {
    return [];
  }

  try {
    return getMessages('0-{{lastMessageId}}', {
      role: 'all',
      hide_state: 'unhidden',
      include_swipes: true,
    }) || [];
  } catch (error) {
    console.warn('[武侠变量条] 读取聊天记录失败:', error);
    return [];
  }
}

function getLatestMessageId(): number {
  return getAllChatMessages().reduce((latestId, message) => Math.max(latestId, Number(message.message_id)), -1);
}

function getMessageById(messageId: number): ChatMessageWithSwipes | null {
  return getAllChatMessages().find(message => Number(message.message_id) === Number(messageId)) || null;
}

function getNewestAssistantAfter(messageId: number): ChatMessageWithSwipes | null {
  return getAllChatMessages()
    .filter(message => message.role === 'assistant' && Number(message.message_id) > messageId)
    .sort((left, right) => Number(right.message_id) - Number(left.message_id))
    .find(message => getActiveMessageText(message).trim().length > 0) || null;
}

function getLatestAssistantMessage(): ChatMessageWithSwipes | null {
  return getAllChatMessages()
    .filter(message => message.role === 'assistant' && getActiveMessageText(message).trim().length > 0)
    .sort((left, right) => Number(right.message_id) - Number(left.message_id))[0] || null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(value: string, maxLength = 120): string {
  const compactValue = value.replace(/\s+/g, ' ').trim();
  return compactValue.length > maxLength ? `${compactValue.slice(0, maxLength)}...` : compactValue;
}

function ensureStyles(targetDocument: Document = window.parent?.document || document): void {
  if (targetDocument.getElementById(STYLE_ID)) {
    return;
  }

  const style = targetDocument.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.${BAR_CLASS} {
  margin: 14px 0 4px;
  border: 1px solid rgba(181, 137, 80, 0.32);
  border-radius: 6px;
  background:
    linear-gradient(90deg, rgba(181, 137, 80, 0.12), transparent 42%),
    rgba(15, 13, 12, 0.72);
  color: #d8d2c6;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 10px 24px rgba(0, 0, 0, 0.2);
  font-family: "Noto Serif SC", "Songti SC", "SimSun", serif;
  overflow: hidden;
}
.${BAR_CLASS} * { box-sizing: border-box; }
.${BAR_CLASS} .wuxia-vcb-summary {
  display: grid;
  grid-template-columns: max-content max-content max-content max-content minmax(0, 1fr) 18px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 7px 9px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.${BAR_CLASS} .wuxia-vcb-summary:hover { background: rgba(255, 255, 255, 0.035); }
.${BAR_CLASS} .wuxia-vcb-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #e9dfca;
  font-size: 13px;
  white-space: nowrap;
}
.${BAR_CLASS} .wuxia-vcb-pill,
.${BAR_CLASS} .wuxia-vcb-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  padding: 2px 7px;
  border: 1px solid rgba(120, 113, 108, 0.45);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.18);
  color: #a8a29e;
  font: 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
}
.${BAR_CLASS} .wuxia-vcb-pill.declared { border-color: rgba(217, 119, 6, 0.42); color: #e5a64b; }
.${BAR_CLASS} .wuxia-vcb-pill.actual { border-color: rgba(34, 197, 94, 0.34); color: #86efac; }
.${BAR_CLASS} .wuxia-vcb-status.error { border-color: rgba(239, 68, 68, 0.36); color: #fca5a5; }
.${BAR_CLASS} .wuxia-vcb-groups {
  min-width: 0;
  overflow: hidden;
  color: #8f867b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${BAR_CLASS} .wuxia-vcb-chevron {
  color: #a8a29e;
  font-size: 12px;
  text-align: center;
}
.${BAR_CLASS}.expanded .wuxia-vcb-chevron { transform: rotate(180deg); }
.${BAR_CLASS} .wuxia-vcb-detail {
  display: none;
  padding: 8px;
  border-top: 1px solid rgba(181, 137, 80, 0.18);
  background: rgba(0, 0, 0, 0.18);
}
.${BAR_CLASS}.expanded .wuxia-vcb-detail { display: grid; gap: 8px; }
.${BAR_CLASS} .wuxia-vcb-section {
  min-width: 0;
  border: 1px solid rgba(68, 64, 60, 0.7);
  border-radius: 5px;
  background: rgba(28, 25, 23, 0.46);
  overflow: hidden;
}
.${BAR_CLASS} .wuxia-vcb-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 9px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.045);
  color: #d8d2c6;
  font-size: 12px;
}
.${BAR_CLASS} .wuxia-vcb-section-count { color: #8f867b; font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.${BAR_CLASS} .wuxia-vcb-empty,
.${BAR_CLASS} .wuxia-vcb-omitted,
.${BAR_CLASS} .wuxia-vcb-error {
  padding: 9px;
  color: #8f867b;
  font-size: 12px;
  line-height: 1.5;
}
.${BAR_CLASS} .wuxia-vcb-error { color: #fca5a5; }
.${BAR_CLASS} .wuxia-vcb-row {
  display: grid;
  gap: 6px;
  padding: 8px 9px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.045);
}
.${BAR_CLASS} .wuxia-vcb-row:last-child { border-bottom: 0; }
.${BAR_CLASS} .wuxia-vcb-row-head {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  align-items: center;
  gap: 8px;
}
.${BAR_CLASS} .wuxia-vcb-action {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(217, 119, 6, 0.12);
  color: #e5a64b;
  font-size: 11px;
  white-space: nowrap;
}
.${BAR_CLASS} .wuxia-vcb-action.insert { background: rgba(34, 197, 94, 0.1); color: #86efac; }
.${BAR_CLASS} .wuxia-vcb-action.delete { background: rgba(239, 68, 68, 0.1); color: #fca5a5; }
.${BAR_CLASS} .wuxia-vcb-path {
  min-width: 0;
  overflow: hidden;
  color: #e7e5e4;
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${BAR_CLASS} .wuxia-vcb-values {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  color: #a8a29e;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.${BAR_CLASS} .wuxia-vcb-values.diff { grid-template-columns: minmax(0, 1fr) 14px minmax(0, 1fr); align-items: center; }
.${BAR_CLASS} .wuxia-vcb-value {
  min-width: 0;
  overflow: hidden;
  padding: 5px 6px;
  border: 1px solid rgba(68, 64, 60, 0.72);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${BAR_CLASS} .wuxia-vcb-value.new { color: #d9f99d; }
.${BAR_CLASS} .wuxia-vcb-value.old { color: #f5c2a7; }
.${BAR_CLASS} .wuxia-vcb-arrow { color: #8f867b; text-align: center; }
.${BAR_CLASS} .wuxia-vcb-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: 4px;
  border: 1px solid rgba(120, 113, 108, 0.42);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.18);
  color: #a8a29e;
  cursor: pointer;
}
.${BAR_CLASS} .wuxia-vcb-copy:hover { border-color: rgba(217, 119, 6, 0.68); color: #e5a64b; }
.${BAR_CLASS} .wuxia-vcb-thought {
  padding: 7px 9px;
  color: #a8a29e;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
@media (max-width: 640px) {
  .${BAR_CLASS} .wuxia-vcb-summary {
    grid-template-columns: max-content max-content max-content 18px;
    grid-template-areas:
      "title declared actual chevron"
      "status groups groups groups";
  }
  .${BAR_CLASS} .wuxia-vcb-title { grid-area: title; }
  .${BAR_CLASS} .wuxia-vcb-pill.declared { grid-area: declared; }
  .${BAR_CLASS} .wuxia-vcb-pill.actual { grid-area: actual; }
  .${BAR_CLASS} .wuxia-vcb-status { grid-area: status; justify-self: start; }
  .${BAR_CLASS} .wuxia-vcb-groups { grid-area: groups; }
  .${BAR_CLASS} .wuxia-vcb-chevron { grid-area: chevron; }
  .${BAR_CLASS} .wuxia-vcb-values.diff { grid-template-columns: minmax(0, 1fr); }
  .${BAR_CLASS} .wuxia-vcb-arrow { display: none; }
}
`;
  targetDocument.head.appendChild(style);
}

function getTotalCount(visibleCount: number, omittedCount: number): number {
  return visibleCount + omittedCount;
}

function getGroupText(summary: VariableChangeSummary): string {
  if (!summary.topLevelGroups.length) {
    return '暂无字段变化';
  }
  const visibleGroups = summary.topLevelGroups.slice(0, 4).join('、');
  return summary.topLevelGroups.length > 4 ? `${visibleGroups} 等` : visibleGroups;
}

function renderDeclaredRow(change: VariableDeclaredChange): string {
  const value = formatVariableDetailValue(change.value);
  return `
    <div class="wuxia-vcb-row declared">
      <div class="wuxia-vcb-row-head">
        <span class="wuxia-vcb-action ${change.action}">${ACTION_LABELS[change.action]}</span>
        <span class="wuxia-vcb-path" title="${escapeHtml(change.copyPath)}">${escapeHtml(change.displayPath)}</span>
        <span>
          <button type="button" class="wuxia-vcb-copy" data-copy="${escapeHtml(change.copyPath)}" title="复制路径">径</button>
          <button type="button" class="wuxia-vcb-copy" data-copy="${escapeHtml(value)}" title="复制值">值</button>
        </span>
      </div>
      <div class="wuxia-vcb-values">
        <span class="wuxia-vcb-value new" title="${escapeHtml(value)}">${escapeHtml(change.valuePreview)}</span>
      </div>
    </div>
  `;
}

function renderActualRow(change: VariableActualChange): string {
  const beforeValue = formatVariableDetailValue(change.beforeValue);
  const afterValue = formatVariableDetailValue(change.afterValue);
  return `
    <div class="wuxia-vcb-row actual">
      <div class="wuxia-vcb-row-head">
        <span class="wuxia-vcb-action ${change.action}">${ACTION_LABELS[change.action]}</span>
        <span class="wuxia-vcb-path" title="${escapeHtml(change.copyPath)}">${escapeHtml(change.displayPath)}</span>
        <span>
          <button type="button" class="wuxia-vcb-copy" data-copy="${escapeHtml(change.copyPath)}" title="复制路径">径</button>
          <button type="button" class="wuxia-vcb-copy" data-copy="${escapeHtml(afterValue)}" title="复制新值">值</button>
        </span>
      </div>
      <div class="wuxia-vcb-values diff">
        <span class="wuxia-vcb-value old" title="${escapeHtml(beforeValue)}">${escapeHtml(change.beforePreview)}</span>
        <span class="wuxia-vcb-arrow">→</span>
        <span class="wuxia-vcb-value new" title="${escapeHtml(afterValue)}">${escapeHtml(change.afterPreview)}</span>
      </div>
    </div>
  `;
}

function renderSection(title: string, count: number, body: string): string {
  return `
    <section class="wuxia-vcb-section">
      <div class="wuxia-vcb-section-head">
        <span>${escapeHtml(title)}</span>
        <span class="wuxia-vcb-section-count">${count}</span>
      </div>
      ${body}
    </section>
  `;
}

function renderSummary(summary: VariableChangeSummary): string {
  const declaredTotal = getTotalCount(summary.declaredChanges.length, summary.omittedDeclaredCount);
  const actualTotal = getTotalCount(summary.actualChanges.length, summary.omittedActualCount);
  const groupText = getGroupText(summary);
  const thoughtBody = summary.thoughts.length > 0
    ? renderSection(
      'AI 思考摘要',
      summary.thoughts.length,
      summary.thoughts.map(thought => `<div class="wuxia-vcb-thought" title="${escapeHtml(thought.text)}">${escapeHtml(thought.preview)}</div>`).join(''),
    )
    : '';
  const declaredBody = summary.declaredChanges.length > 0
    ? `${summary.declaredChanges.map(renderDeclaredRow).join('')}${
      summary.omittedDeclaredCount > 0
        ? `<div class="wuxia-vcb-omitted">另有 ${summary.omittedDeclaredCount} 条声明变更未显示。</div>`
        : ''
    }`
    : '<div class="wuxia-vcb-empty">本轮回复没有声明变量写入。</div>';
  const actualBody = summary.actualChanges.length > 0
    ? `${summary.actualChanges.map(renderActualRow).join('')}${
      summary.omittedActualCount > 0
        ? `<div class="wuxia-vcb-omitted">另有 ${summary.omittedActualCount} 条实际变更未显示。</div>`
        : ''
    }`
    : '<div class="wuxia-vcb-empty">尚未观察到本轮实际变量差分。</div>';
  const errorBody = summary.parseErrors.length > 0
    ? renderSection(
      '解析问题',
      summary.parseErrors.length,
      summary.parseErrors.map(error => `<div class="wuxia-vcb-error">${escapeHtml(error)}</div>`).join(''),
    )
    : '';

  return `
    <button type="button" class="wuxia-vcb-summary" aria-expanded="false">
      <span class="wuxia-vcb-title"><i class="fa-solid fa-database"></i><span>变量变更</span></span>
      <span class="wuxia-vcb-pill declared">AI ${declaredTotal}</span>
      <span class="wuxia-vcb-pill actual">实际 ${actualTotal}</span>
      <span class="wuxia-vcb-status ${summary.status}">${STATUS_LABELS[summary.status]}</span>
      <span class="wuxia-vcb-groups" title="${escapeHtml(groupText)}">${escapeHtml(groupText)}</span>
      <span class="wuxia-vcb-chevron">⌄</span>
    </button>
    <div class="wuxia-vcb-detail">
      ${thoughtBody}
      ${renderSection('AI 声明', declaredTotal, declaredBody)}
      ${renderSection('实际变更', actualTotal, actualBody)}
      ${errorBody}
    </div>
  `;
}

function getParentJQuery(): JQueryStatic | null {
  const parentDollar = window.parent?.$;
  if (typeof parentDollar === 'function') {
    return parentDollar as JQueryStatic;
  }
  return typeof $ === 'function' ? $ : null;
}

function findMessageElement(messageId?: number): JQuery<HTMLElement> | null {
  const parentDollar = getParentJQuery();
  if (!parentDollar) {
    return null;
  }

  if (Number.isInteger(messageId)) {
    const byId = parentDollar(`.mes[mesid="${messageId}"]`);
    if (byId.length) {
      return byId as JQuery<HTMLElement>;
    }
  }

  const latestVisibleAssistant = parentDollar('.mes[is_user="false"]').last();
  return latestVisibleAssistant.length ? latestVisibleAssistant as JQuery<HTMLElement> : null;
}

function getMessageIframeDocument($message: JQuery<HTMLElement>): Document | null {
  const iframe = $message.find('iframe[id^="TH-message--"]').get(0) as HTMLIFrameElement | undefined;
  if (!iframe) {
    return null;
  }

  try {
    return iframe.contentDocument || iframe.contentWindow?.document || null;
  } catch {
    return null;
  }
}

function bindBarEvents($bar: JQuery<HTMLElement>): void {
  $bar.off('click.wuxiaVariableBar');
  $bar.on('click.wuxiaVariableBar', '.wuxia-vcb-summary', event => {
    const button = event.currentTarget as HTMLElement;
    const nextExpanded = !$bar.hasClass('expanded');
    $bar.toggleClass('expanded', nextExpanded);
    button.setAttribute('aria-expanded', String(nextExpanded));
  });
  $bar.on('click.wuxiaVariableBar', '.wuxia-vcb-copy', event => {
    event.stopPropagation();
    const button = event.currentTarget as HTMLButtonElement;
    const text = button.dataset.copy || '';
    void copyText(text).then(() => {
      const originalText = button.textContent || '';
      button.textContent = '✓';
      window.setTimeout(() => {
        button.textContent = originalText;
      }, 900);
    });
  });
}

function bindNativeBarEvents(bar: HTMLElement): void {
  bar.addEventListener('click', event => {
    const target = event.target as HTMLElement | null;
    const summaryButton = target?.closest?.('.wuxia-vcb-summary') as HTMLElement | null;
    if (summaryButton) {
      const nextExpanded = !bar.classList.contains('expanded');
      bar.classList.toggle('expanded', nextExpanded);
      summaryButton.setAttribute('aria-expanded', String(nextExpanded));
      return;
    }

    const copyButton = target?.closest?.('.wuxia-vcb-copy') as HTMLButtonElement | null;
    if (!copyButton) {
      return;
    }

    event.stopPropagation();
    const text = copyButton.dataset.copy || '';
    void copyText(text).then(() => {
      const originalText = copyButton.textContent || '';
      copyButton.textContent = '✓';
      window.setTimeout(() => {
        copyButton.textContent = originalText;
      }, 900);
    });
  });
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(text);
    return;
  } catch {
    // fall through
  }

  const parentDocument = window.parent?.document || document;
  const textarea = parentDocument.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  parentDocument.body.appendChild(textarea);
  textarea.select();
  parentDocument.execCommand('copy');
  textarea.remove();
}

function mountSummaryInsideMessageIframe(
  summary: VariableChangeSummary,
  $message: JQuery<HTMLElement>,
  retryCount: number,
): boolean {
  const iframeDocument = getMessageIframeDocument($message);
  if (!iframeDocument) {
    return false;
  }

  const reactBar = iframeDocument.querySelector('.variable-change-bar');
  if (reactBar) {
    iframeDocument.querySelectorAll(`.${BAR_CLASS}`).forEach(element => element.remove());
    return true;
  }

  const target = iframeDocument.querySelector('.game-content .maintext-container');
  if (!target) {
    if (retryCount < MAX_RENDER_RETRIES) {
      window.setTimeout(() => mountSummary(summary, retryCount + 1), RENDER_RETRY_DELAY_MS);
      return true;
    }
    return false;
  }

  ensureStyles(iframeDocument);
  const existingBar = iframeDocument.querySelector(`.${BAR_CLASS}`);
  const wasExpanded = existingBar?.classList.contains('expanded') ?? false;
  existingBar?.remove();

  const bar = iframeDocument.createElement('div');
  bar.className = `${BAR_CLASS}${wasExpanded ? ' expanded' : ''}`;
  bar.dataset.turnId = String(summary.turnId);
  bar.innerHTML = renderSummary(summary);
  if (wasExpanded) {
    bar.querySelector('.wuxia-vcb-summary')?.setAttribute('aria-expanded', 'true');
  }
  bindNativeBarEvents(bar);
  target.insertAdjacentElement('afterend', bar);
  $message.find(`.${BAR_CLASS}`).remove();
  return true;
}

function mountSummary(summary: VariableChangeSummary, retryCount = 0): void {
  const parentDollar = getParentJQuery();
  const $message = findMessageElement(summary.assistantMessageId);
  const $content = $message?.find('.mes_text').first();

  if (!$message || !$content?.length) {
    if (retryCount < MAX_RENDER_RETRIES) {
      window.setTimeout(() => mountSummary(summary, retryCount + 1), RENDER_RETRY_DELAY_MS);
    }
    return;
  }

  if (!parentDollar) {
    return;
  }

  if (mountSummaryInsideMessageIframe(summary, $message, retryCount)) {
    return;
  }

  ensureStyles();
  const wasExpanded = $message.find(`.${BAR_CLASS}`).hasClass('expanded');
  $message.find(`.${BAR_CLASS}`).remove();
  const $bar = parentDollar(`<div class="${BAR_CLASS}${wasExpanded ? ' expanded' : ''}" data-turn-id="${summary.turnId}"></div>`);
  $bar.html(renderSummary(summary));
  if (wasExpanded) {
    $bar.find('.wuxia-vcb-summary').attr('aria-expanded', 'true');
  }
  bindBarEvents($bar);
  $content.after($bar);
}

function setSummary(nextSummary: VariableChangeSummary | null): void {
  currentSummary = nextSummary;
  if (nextSummary) {
    mountSummary(nextSummary);
  }
}

function startTurn(): void {
  const turnId = nextTurnId + 1;
  nextTurnId = turnId;
  activeTurn = {
    turnId,
    startedAfterMessageId: getLatestMessageId(),
    baselineStatData: readCurrentStatDataSnapshot(),
  };
  setSummary(createEmptyVariableChangeSummary(turnId, activeTurn.baselineStatData ? 'tracking' : 'error'));
}

function recordAssistantReply(message?: ChatMessageWithSwipes | null): void {
  const assistantMessage = message || (activeTurn ? getNewestAssistantAfter(activeTurn.startedAfterMessageId) : getLatestAssistantMessage());
  if (!assistantMessage) {
    return;
  }

  const rawReply = getActiveMessageText(assistantMessage);
  const turn = activeTurn || {
    turnId: nextTurnId + 1,
    startedAfterMessageId: Number(assistantMessage.message_id) - 1,
    baselineStatData: null,
    assistantMessageId: Number(assistantMessage.message_id),
  };

  if (!activeTurn) {
    nextTurnId = turn.turnId;
  }

  const parsed = parseDeclaredVariableChanges(rawReply);
  const previousActualChanges = currentSummary?.turnId === turn.turnId ? currentSummary.actualChanges : [];
  const nextSummary: VariableChangeSummary = {
    ...(currentSummary?.turnId === turn.turnId
      ? currentSummary
      : createEmptyVariableChangeSummary(turn.turnId, turn.baselineStatData ? 'reply-recorded' : 'error')),
    status: turn.baselineStatData ? 'reply-recorded' : 'error',
    assistantMessageId: Number(assistantMessage.message_id),
    updatedAt: Date.now(),
    declaredChanges: parsed.declaredChanges,
    thoughts: parsed.thoughts,
    parseErrors: parsed.parseErrors,
    omittedDeclaredCount: parsed.omittedDeclaredCount,
    topLevelGroups: collectVariableTopLevelGroups(parsed.declaredChanges, previousActualChanges),
  };

  if (activeTurn) {
    activeTurn.assistantMessageId = Number(assistantMessage.message_id);
  }

  setSummary(nextSummary);
  refreshActualChanges();
}

function refreshActualChanges(nextData?: unknown): void {
  if (!activeTurn || !currentSummary || currentSummary.turnId !== activeTurn.turnId) {
    return;
  }

  const nextStatData = nextData === undefined
    ? readCurrentStatDataSnapshot()
    : readStatDataSnapshotFromUnknown(nextData) || readCurrentStatDataSnapshot();
  const { actualChanges, omittedActualCount } = createActualVariableChanges(
    activeTurn.baselineStatData,
    nextStatData,
  );
  const hasComparableData = Boolean(activeTurn.baselineStatData && nextStatData);

  setSummary({
    ...currentSummary,
    status: hasComparableData ? 'settled' : 'error',
    updatedAt: Date.now(),
    actualChanges,
    omittedActualCount,
    topLevelGroups: collectVariableTopLevelGroups(currentSummary.declaredChanges, actualChanges),
  });
}

function registerMvuVariableListener(): boolean {
  if (mvuVariableListener) {
    return true;
  }

  const mvu = (globalThis as { Mvu?: { events?: { VARIABLE_UPDATE_ENDED?: string } } }).Mvu;
  if (!mvu?.events?.VARIABLE_UPDATE_ENDED) {
    return false;
  }

  const eventOnFn = getHelperFunction<(eventName: string, callback: (...args: any[]) => void) => { stop: () => void }>('eventOn');
  if (!eventOnFn) {
    return false;
  }

  mvuVariableListener = eventOnFn(mvu.events.VARIABLE_UPDATE_ENDED, (variables: unknown) => {
    refreshActualChanges(variables);
  });
  return true;
}

function hydrateLatestVisibleAssistant(): void {
  const parentDollar = getParentJQuery();
  if (!parentDollar) {
    return;
  }

  const visibleAssistantId = Number(parentDollar('.mes[is_user="false"]').last().attr('mesid'));
  const latestAssistant = Number.isFinite(visibleAssistantId)
    ? getMessageById(visibleAssistantId)
    : getLatestAssistantMessage();

  if (!latestAssistant) {
    return;
  }

  recordAssistantReply(latestAssistant);
}

function initVariableChangeOverlay(): void {
  if ((globalThis as { __WUXIA_VARIABLE_CHANGE_OVERLAY_STARTED__?: boolean }).__WUXIA_VARIABLE_CHANGE_OVERLAY_STARTED__) {
    return;
  }
  (globalThis as { __WUXIA_VARIABLE_CHANGE_OVERLAY_STARTED__?: boolean }).__WUXIA_VARIABLE_CHANGE_OVERLAY_STARTED__ = true;

  const eventOnFn = getHelperFunction<(eventName: string, callback: (...args: any[]) => void) => { stop: () => void }>('eventOn');
  const tavernEvents = (globalThis as { tavern_events?: Record<string, string> }).tavern_events
    || (getTH()?.tavern_events as Record<string, string> | undefined);

  window.setTimeout(hydrateLatestVisibleAssistant, 800);

  if (!eventOnFn || !isRecord(tavernEvents)) {
    console.warn('[武侠变量条] 缺少事件接口，仅执行启动时历史楼层挂载。');
    return;
  }

  eventOnFn(tavernEvents.MESSAGE_SENT, () => {
    startTurn();
  });
  eventOnFn(tavernEvents.MESSAGE_RECEIVED, () => {
    window.setTimeout(() => recordAssistantReply(), 0);
  });
  eventOnFn(tavernEvents.MESSAGE_UPDATED, () => {
    window.setTimeout(hydrateLatestVisibleAssistant, 100);
  });
  eventOnFn(tavernEvents.MESSAGE_SWIPED, () => {
    window.setTimeout(hydrateLatestVisibleAssistant, 100);
  });
  eventOnFn(tavernEvents.CHAT_CHANGED, () => {
    activeTurn = null;
    currentSummary = null;
    window.setTimeout(hydrateLatestVisibleAssistant, 800);
  });
  eventOnFn('era:writeDone', (detail?: EraWriteDoneDetail) => {
    refreshActualChanges(detail?.statWithoutMeta ?? detail?.stat);
  });

  if (!registerMvuVariableListener()) {
    const waitGlobalInitialized = getHelperFunction<(name: string) => Promise<void>>('waitGlobalInitialized');
    void waitGlobalInitialized?.('Mvu')
      .then(() => {
        registerMvuVariableListener();
      })
      .catch(() => undefined);
  }

  console.info('[武侠变量条] 原生楼层变量变更条已启动');
}

$(() => {
  initVariableChangeOverlay();
});
