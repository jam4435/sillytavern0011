/**
 * AI 正文追加：适用于普通 SillyTavern 聊天，不依赖武侠前端/ERA。
 *
 * 注入入口借鉴绑定Plus脚本，监听原生（awaited）MESSAGE_SENT。
 * 当前 user 楼层已经建立，但模型提示词尚未组装；修改原生 context.chat
 * 的上一条 assistant + 当前 user 后，等待 context.saveChat()。
 */
import { appendToAssistantBody, DEFAULT_APPEND_MARKER, splitMarkedInput } from './logic';

const PREFIX = 'assistant-inline-append';
const STORAGE_KEY = 'assistant_inline_append_settings_v1';

type Config = { enabled: boolean; marker: string };
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
  updateMessageBlock?: (index: number, message: Message) => void;
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
    };
  } catch {
    return { enabled: true, marker: DEFAULT_APPEND_MARKER };
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
    const next = appendToAssistantBody(active.text, parsed.appendText);
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

    // 用户楼层在原生 MESSAGE_SENT 返回后由 SillyTavern 自行渲染。
    // 对已存在的 assistant 气泡只做一次同步刷新。
    try {
      const fresh = context();
      if (fresh?.chat === ctx.chat && identity(fresh) === chatId) {
        fresh.updateMessageBlock?.(messageId - 1, assistant);
      }
    } catch (renderError) {
      console.warn('[AI正文追加] 聊天已保存，气泡重绘失败', renderError);
    }
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
  const label = element('label', '行首标记');
  label.htmlFor = PREFIX + '-marker';
  const input = element('input');
  input.type = 'text';
  input.id = PREFIX + '-marker';
  input.maxLength = 32;
  input.value = config.marker;
  const preview = element('pre');
  preview.id = PREFIX + '-preview';
  preview.textContent = config.marker + '这里是添加到上一条 AI 正文的内容。\n我继续采取行动。';
  input.addEventListener('change', () => {
    const value = input.value.trim();
    if (!value || /[\r\n]/.test(value)) {
      input.value = config.marker;
      warn('标记不能为空或包含换行。');
      return;
    }
    config.marker = value;
    preview.textContent = value + '这里是添加到上一条 AI 正文的内容。\n我继续采取行动。';
    saveConfig();
  });
  field.append(label, input);
  body.append(
    enabled, field, element('strong', '示例'), preview,
    element('p', '标记行追加到上一条 AI 正文；其它行保留为正常 User 输入。标记行可以有多条。'),
    element('p', '采用酒馆原生 MESSAGE_SENT 和 saveChat，不接管 Enter / 发送按钮，不依赖武侠卡。'),
    element('p', '只支持“正常 User 文本 + 标记文本”同时存在的输入；只有标记文本时按原文发送。'),
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
