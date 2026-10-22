/**
 * AI 正文追加：适用于普通 SillyTavern 聊天，不依赖武侠前端/ERA。
 *
 * 注入入口借鉴绑定Plus脚本，监听原生（awaited）MESSAGE_SENT。
 * 当前 user 楼层已经建立，但模型提示词尚未组装；修改原生 context.chat
 * 的上一条 assistant + 当前 user 后，等待 context.saveChat()。
 */
import { appendToAssistantBody, DEFAULT_APPEND_MARKER, splitMarkedInput, type MarkerPosition } from './logic';

const PREFIX = 'assistant-inline-append';
const STORAGE_KEY = 'assistant_inline_append_settings_v1';

type Config = {
  enabled: boolean;
  /** 识别当前 User 输入中的标记，例如 1: */
  marker: string;
  /** 在上一条 AI 原始文本中精确寻找的定位标记；为空则保持默认的正文尾部追加。 */
  targetMarker: string;
  /** 定位标记之前或之后。 */
  markerPosition: MarkerPosition;
  /** 每次在提取的追加文本开头原样加上固定前缀。 */
  fixedPrefix: string;
};
type Message = {
  mes: string;
  is_user?: boolean;
  is_system?: boolean;
  swipe_id?: number;
  swipes?: string[];
  extra?: Record<string, unknown>;
};
type Context = {
  chat: Message[];
  chatId?: string | number | null;
  getCurrentChatId?: () => string | number | null | undefined;
  saveChat: () => Promise<unknown>;
  eventSource: {
    on: (name: string, fn: (id: number) => Promise<void>) => void;
    removeListener: (name: string, fn: (id: number) => Promise<void>) => void;
  };
  eventTypes: { MESSAGE_SENT: string };
};
type Parent = Window & {
  SillyTavern?: { getContext?: () => Context };
  toastr?: { warning?: (message: string) => void; error?: (message: string) => void };
  __assistantInlineAppendDispose?: () => void;
};

const host = window.parent as Parent;
const doc = host.document;
let config: Config = readConfig();
let disposed = false;
let subscription: { ctx: Context; name: string } | null = null;
let menuObserver: MutationObserver | null = null;

function context(): Context | null {
  return host.SillyTavern?.getContext?.() ?? null;
}
function identity(ctx: Context): string {
  const raw = ctx.getCurrentChatId?.() ?? ctx.chatId;
  return raw === null || raw === undefined ? '' : String(raw);
}
function readConfig(): Config {
  try {
    const v = JSON.parse(host.localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Config>;
    return {
      enabled: v.enabled !== false,
      marker: typeof v.marker === 'string' && v.marker.trim() && !/[\r\n]/.test(v.marker)
        ? v.marker.trim().slice(0, 32) : DEFAULT_APPEND_MARKER,
      targetMarker: typeof v.targetMarker === 'string' ? v.targetMarker.slice(0, 256) : '',
      markerPosition: v.markerPosition === 'after' ? 'after' : 'before',
      fixedPrefix: typeof v.fixedPrefix === 'string' ? v.fixedPrefix.slice(0, 500) : '',
    };
  } catch {
    return {
      enabled: true, marker: DEFAULT_APPEND_MARKER, targetMarker: '',
      markerPosition: 'before', fixedPrefix: '',
    };
  }
}
function saveConfig(): void {
  try {
    host.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('[AI正文追加] 设置保存失败', error);
  }
}
function warn(message: string, error = false): void {
  const fn = error ? host.toastr?.error : host.toastr?.warning;
  if (fn) fn(message);
  else console.warn('[AI正文追加] ' + message);
}

function getActive(message: Message): { text: string; index: number } {
  const index = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  if (!message.swipes?.length) return { text: message.mes, index: 0 };
  if (index < 0 || index >= message.swipes.length || message.swipes[index] !== message.mes) {
    throw new Error('上一条 AI 回复与 active swipe 不一致，已保护原文。');
  }
  return { text: message.mes, index };
}

/**
 * 原生发送已创建 user message，但还未生成 AI 回复。
 * 失败时只回滚自己在内存中修改的字段，让普通发送保持原样。
 */
async function onMessageSent(messageId: number): Promise<void> {
  if (disposed || !config.enabled) return;
  const ctx = context();
  if (!ctx || !Array.isArray(ctx.chat) || !Number.isInteger(messageId) ||
      messageId <= 0 || messageId !== ctx.chat.length - 1) return;

  const user = ctx.chat[messageId];
  const assistant = ctx.chat[messageId - 1];
  if (!user?.is_user || user.is_system || typeof user.mes !== 'string') return;
  const parsed = splitMarkedInput(user.mes, config.marker);
  if (!parsed.matched) return;
  if (!parsed.appendText || !parsed.userText) {
    warn('标记和普通 User 消息都需要非空内容；本轮按原文发送。');
    return;
  }
  if (!assistant || assistant.is_user || assistant.is_system || !assistant.mes?.trim()) {
    warn('上一楼不是正常的 AI 回复；本轮按原文发送。');
    return;
  }

  const chatId = identity(ctx);
  if (!chatId) {
    warn('无法确认聊天身份；本轮按原文发送。');
    return;
  }

  const oldUser = user.mes;
  const oldAssistant = assistant.mes;
  const oldSwipes = assistant.swipes?.slice();
  const oldDisplay = assistant.extra?.display_text;
  const displayWasMirror = oldDisplay === oldAssistant;
  let saved = false;
  try {
    const active = getActive(assistant);
    const next = appendToAssistantBody(active.text, parsed.appendText, {
      targetMarker: config.targetMarker,
      markerPosition: config.markerPosition,
      fixedPrefix: config.fixedPrefix,
    });
    if (context()?.chat !== ctx.chat || identity(ctx) !== chatId ||
        ctx.chat[messageId] !== user || ctx.chat[messageId - 1] !== assistant) {
      throw new Error('聊天或楼层发生变动，取消此次修改。');
    }
    assistant.mes = next;
    if (assistant.swipes?.length) assistant.swipes[active.index] = next;
    if (displayWasMirror && assistant.extra) assistant.extra.display_text = next;
    user.mes = parsed.userText;

    await ctx.saveChat();
    saved = true;

    // 不强制重绘上一条 AI 的 .mes_text：
    // 此时新 User 已存在，旧 AI 在显示正则中的 depth 从 0 变为 1。
    // updateMessageBlock 会重跑 Markdown/显示正则并替换整个 DOM，
    // 深度限定的美化正则可能失效，导致已经渲染好的 HTML 状态栏显示成源码。
    // 实际 mes + active swipe 已写入并保存，下一轮模型仍会读到修改后的正文。
    // 旧气泡保持原 DOM；刷新页面时由酒馆自身按当前正则设置正常渲染。
  } catch (error) {
    if (!saved && ctx.chat[messageId] === user && ctx.chat[messageId - 1] === assistant) {
      user.mes = oldUser;
      assistant.mes = oldAssistant;
      if (oldSwipes) assistant.swipes = oldSwipes;
      if (displayWasMirror && assistant.extra) assistant.extra.display_text = oldDisplay;
    }
    console.error('[AI正文追加] 更新失败', error);
    warn('追加失败，原文继续发送：' + String(error instanceof Error ? error.message : error), true);
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.textContent = text;
  return node;
}
function showPanel(show: boolean): void {
  const layer = doc.getElementById(PREFIX + '-layer');
  if (layer) layer.hidden = !show;
}
function escapeClose(event: KeyboardEvent): void {
  if (event.key === 'Escape') showPanel(false);
}

function mountMenu(): void {
  if (disposed || doc.getElementById(PREFIX + '-menu')) return;
  const menu = doc.getElementById('extensionsMenu');
  if (!menu) return;
  const item = element('div');
  item.id = PREFIX + '-menu';
  item.className = 'list-group-item flex-container flexGap5 interactable';
  item.tabIndex = 0;
  item.title = '设置 AI 正文追加标记';
  const icon = element('i');
  icon.className = 'fa-solid fa-pen-to-square';
  item.append(icon, element('span', 'AI 正文追加'));
  item.addEventListener('click', () => showPanel(true));
  item.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showPanel(true); }
  });
  menu.appendChild(item);
}
function mountPanel(): void {
  if (doc.getElementById(PREFIX + '-layer')) return;
  const style = element('style');
  style.id = PREFIX + '-style';
  style.textContent = [
    '#assistant-inline-append-layer[hidden]{display:none!important}',
    '#assistant-inline-append-layer{position:fixed;inset:0;background:#000a;z-index:11000;display:flex;align-items:center;justify-content:center;padding:16px}',
    '#assistant-inline-append-panel{width:min(500px,94vw);max-height:90vh;overflow:auto;border:1px solid var(--SmartThemeBorderColor,#666);border-radius:12px;background:var(--SmartThemeBlurTintColor,#222);color:var(--SmartThemeBodyColor,#eee);font-family:var(--mainFontFamily,sans-serif);box-shadow:0 12px 40px #0009}',
    '#assistant-inline-append-panel header{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border-bottom:1px solid var(--SmartThemeBorderColor,#666)}',
    '#assistant-inline-append-panel .body{padding:18px;display:grid;gap:16px}',
    '#assistant-inline-append-panel label{display:flex;align-items:center;gap:9px}',
    '#assistant-inline-append-panel .field{display:grid;gap:7px}',
    '#assistant-inline-append-panel input[type=text]{width:100%;box-sizing:border-box;color:inherit;background:#0003;padding:9px 10px;border:1px solid var(--SmartThemeBorderColor,#666);border-radius:6px}',
    '#assistant-inline-append-panel pre{margin:0;padding:12px;white-space:pre-wrap;word-break:break-word;background:#0003;font-size:13px;line-height:1.7}',
    '#assistant-inline-append-panel p{margin:0;font-size:13px;line-height:1.7;opacity:.85}',
    '#assistant-inline-append-panel button{background:#7773;color:inherit;border:1px solid var(--SmartThemeBorderColor,#777);padding:4px 9px;border-radius:6px;cursor:pointer}',
    '#assistant-inline-append-panel textarea,#assistant-inline-append-panel select{width:100%;box-sizing:border-box;color:inherit;background:var(--SmartThemeBlurTintColor,#222);border:1px solid var(--SmartThemeBorderColor,#666);padding:9px 10px;border-radius:6px;font:inherit}',
    '#assistant-inline-append-panel .field small{font-size:12px;line-height:1.55;opacity:.78}',
  ].join('\n');
  doc.head.appendChild(style);

  const layer = element('div');
  layer.id = PREFIX + '-layer';
  layer.hidden = true;
  const panel = element('section');
  panel.id = PREFIX + '-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'AI 正文追加设置');

  const header = element('header');
  header.append(element('strong', 'AI 正文追加'));
  const close = element('button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭');
  close.addEventListener('click', () => showPanel(false));
  header.append(close);
  const body = element('div');
  body.className = 'body';
  const enabled = element('label');
  const checkbox = element('input');
  checkbox.type = 'checkbox';
  checkbox.checked = config.enabled;
  checkbox.addEventListener('change', () => {
    config.enabled = checkbox.checked;
    saveConfig();
  });
  enabled.append(checkbox, doc.createTextNode('启用行首标记自动追加'));
  const field = element('div');
  field.className = 'field';
  const label = element('label', '输入标记（当前 User 消息）');
  label.htmlFor = PREFIX + '-marker';
  const input = element('input');
  input.type = 'text';
  input.id = PREFIX + '-marker';
  input.maxLength = 32;
  input.value = config.marker;

  const targetField = element('div');
  targetField.className = 'field';
  const targetLabel = element('label', 'AI 正文定位标记（精确匹配）');
  targetLabel.htmlFor = PREFIX + '-target';
  const target = element('input');
  target.id = PREFIX + '-target';
  target.type = 'text';
  target.maxLength = 256;
  target.placeholder = '例如 </content>；留空则默认追加在正文末尾';
  target.value = config.targetMarker;
  targetField.append(
    targetLabel,
    target,
    element('small', '在上一条 AI 原始消息中查找标记的第一次出现；找不到时保留本轮原文发送，不修改历史。'),
  );

  const positionField = element('div');
  positionField.className = 'field';
  const positionLabel = element('label', '追加位置（相对于 AI 定位标记）');
  positionLabel.htmlFor = PREFIX + '-position';
  const position = element('select');
  position.id = PREFIX + '-position';
  const before = element('option', '放在标记前面');
  before.value = 'before';
  const after = element('option', '放在标记后面');
  after.value = 'after';
  position.append(before, after);
  position.value = config.markerPosition;
  position.disabled = !config.targetMarker;
  positionField.append(positionLabel, position);

  const prefixField = element('div');
  prefixField.className = 'field';
  const prefixLabel = element('label', '固定前缀（只添加到 AI 的追加文字）');
  prefixLabel.htmlFor = PREFIX + '-fixed-prefix';
  const fixedPrefix = element('textarea');
  fixedPrefix.id = PREFIX + '-fixed-prefix';
  fixedPrefix.rows = 3;
  fixedPrefix.maxLength = 500;
  fixedPrefix.placeholder = '例如 【补充叙述】 或 [旁白] ';
  fixedPrefix.value = config.fixedPrefix;
  prefixField.append(
    prefixLabel,
    fixedPrefix,
    element('small', '前缀会原样放在所有标记行提取结果之前，可包含空格或换行，不会添加到 User 消息。'),
  );

  const preview = element('pre');
  preview.id = PREFIX + '-preview';
  function renderPreview(): void {
    const placement = config.targetMarker
      ? '定位标记 ' + JSON.stringify(config.targetMarker) +
        (config.markerPosition === 'before' ? ' 的前面' : ' 的后面')
      : '正文末尾（受保护系统尾块之前）';
    preview.textContent =
      '输入：\n' + config.marker + '补充的文字\n我继续行动。\n\n' +
      '插入位置：' + placement + '\n\n' +
      '写入 AI 的内容：\n' + config.fixedPrefix + '补充的文字\n\n' +
      '正常发送的 User：\n我继续行动。';
  }
  input.addEventListener('change', () => {
    const value = input.value.trim();
    if (!value || /[\r\n]/.test(value)) {
      input.value = config.marker;
      warn('输入标记不能为空或包含换行。');
      return;
    }
    config.marker = value;
    renderPreview();
    saveConfig();
  });
  target.addEventListener('change', () => {
    if (target.value && !target.value.trim()) {
      target.value = config.targetMarker;
      warn('定位标记不能只有空格；清空输入框可以恢复默认位置。');
      return;
    }
    config.targetMarker = target.value;
    position.disabled = !config.targetMarker;
    renderPreview();
    saveConfig();
  });
  position.addEventListener('change', () => {
    config.markerPosition = position.value === 'after' ? 'after' : 'before';
    renderPreview();
    saveConfig();
  });
  fixedPrefix.addEventListener('change', () => {
    config.fixedPrefix = fixedPrefix.value;
    renderPreview();
    saveConfig();
  });
  field.append(label, input);
  renderPreview();
  body.append(
    enabled,
    field,
    targetField,
    positionField,
    prefixField,
    element('strong', '处理示例'),
    preview,
    element('p', '输入标记用于从当前 User 提取内容；定位标记只用于寻找上一条 AI 消息中的插入位置。'),
    element('p', '固定前缀 → 追加文字 → 按目标位置插入；其余 User 内容正常发送。'),
    element('p', '使用酒馆原生 MESSAGE_SENT 和 saveChat；只有追加文本而没有正常 User 内容时仍按原文发送。'),
  );
  panel.append(header, body);
  layer.appendChild(panel);
  layer.addEventListener('click', e => { if (e.target === layer) showPanel(false); });
  doc.body.appendChild(layer);
  doc.addEventListener('keydown', escapeClose);
}

function dispose(): void {
  disposed = true;
  subscription?.ctx.eventSource.removeListener(subscription.name, onMessageSent);
  subscription = null;
  menuObserver?.disconnect();
  menuObserver = null;
  doc.removeEventListener('keydown', escapeClose);
  doc.getElementById(PREFIX + '-menu')?.remove();
  doc.getElementById(PREFIX + '-layer')?.remove();
  doc.getElementById(PREFIX + '-style')?.remove();
}
function initialize(): void {
  host.__assistantInlineAppendDispose?.();
  host.__assistantInlineAppendDispose = dispose;
  disposed = false;
  mountPanel();
  mountMenu();
  if (!doc.getElementById(PREFIX + '-menu')) {
    menuObserver = new MutationObserver(() => {
      mountMenu();
      if (doc.getElementById(PREFIX + '-menu')) {
        menuObserver?.disconnect();
        menuObserver = null;
      }
    });
    menuObserver.observe(doc.body, { childList: true, subtree: true });
  }
  const ctx = context();
  if (!ctx?.eventTypes?.MESSAGE_SENT || !ctx.eventSource?.on || !ctx.saveChat) {
    warn('当前 SillyTavern 缺少原生消息 API，追加功能未启用。', true);
    return;
  }
  subscription = { ctx, name: ctx.eventTypes.MESSAGE_SENT };
  ctx.eventSource.on(subscription.name, onMessageSent);
  console.info('[AI正文追加] 已订阅原生 MESSAGE_SENT。');
}

$(() => initialize());
