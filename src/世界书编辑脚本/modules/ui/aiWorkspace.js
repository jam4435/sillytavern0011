import { getWorldbookNamesSafe } from '../api.js';
import { applyAiPreview, collectAiTargetEntries, generateAiPlan, generateAiPreview } from '../features/aiActionsBatch.js';
import { cancelLlmGeneration } from '../features/llmClient.js';
import { AI_CONTENT_ID } from '../config.js';
import { getAiWorkspaceSettings, setAiWorkspaceSettings } from '../settings.js';
import { initDesktopAiWorkspace, isDesktopAiWorkspace, refreshDesktopAiWorkspace, resetDesktopAiWorkspace } from './aiWorkspaceDesktop.js';
import { errorCatched } from '../utils.js';

const ROOT_ID = 'lorebook-ai-workspace';
const MODEL_LIST_ID = 'lorebook-ai-model-list';
const SOURCES = [
  ['openai', 'OpenAI'],
  ['openrouter', 'OpenRouter'],
  ['claude', 'Claude'],
  ['google', 'Gemini'],
  ['groq', 'Groq'],
  ['mistral', 'Mistral'],
  ['deepseek', 'DeepSeek'],
  ['custom', '自定义（OpenAI兼容）'],
];

const state = {
  entries: [],
  worldbookNames: [],
  selectedEntryUids: new Set(),
  readonlyEntryUids: new Set(),
  planningResult: null,
  previewResult: null,
  modelOptions: [],
  statusText: '',
  modelStatusText: '',
  loadedLorebookName: '',
  isGenerating: false,
  activeGenerationId: '',
  stopRequested: false,
  previewRunId: 0,
  formHydrated: false,
  initialized: false,
};

const parentDoc = () => window.parent.document;
const root = () => $(`#${ROOT_ID}`, parentDoc());
const settings = () => getAiWorkspaceSettings();
const currentLorebook = () => ($('#ai-workspace-lorebook', parentDoc()).val() || '').trim();
const lorebookSearch = () => ($('#ai-workspace-lorebook-search', parentDoc()).val() || '').trim().toLowerCase();
const entrySearch = () => ($('#ai-workspace-search', parentDoc()).val() || '').trim().toLowerCase();
const instructionValue = () => ($('#ai-workspace-instruction', parentDoc()).val() || '').trim();
const jailbreakPromptTemplateValue = () => ($('#ai-workspace-jailbreak-prompt-template', parentDoc()).val() || '').trim();
const builtinPromptTemplateValue = () => ($('#ai-workspace-builtin-prompt-template', parentDoc()).val() || '').trim();
const getApiMode = () => ($('input[name="ai-workspace-api-mode"]:checked', parentDoc()).val() || 'preset').trim();
const selectedSource = () => ($('#ai-workspace-source-select', parentDoc()).val() || 'openai').trim();
const isKnownSource = source => SOURCES.some(([value]) => value === source);
const isCustomSource = source => (source || '').trim() === 'custom';
const isStreamEnabled = () => $('#ai-workspace-stream', parentDoc()).prop('checked');
const debouncedRenderLorebookSearchResults = _.debounce(() => renderLorebookSearchResults(), 150);

function saveSettings(patch = {}) {
  const current = settings();
  const hasPlanningResultPatch = Object.prototype.hasOwnProperty.call(patch, 'planningResult');
  const hasPreviewResultPatch = Object.prototype.hasOwnProperty.call(patch, 'previewResult');
  setAiWorkspaceSettings({
    ...current,
    ...patch,
    lorebookName: typeof patch.lorebookName === 'string'
      ? patch.lorebookName
      : currentLorebook() || current.lorebookName || '',
    selectedEntryUids: Array.isArray(patch.selectedEntryUids)
      ? [...patch.selectedEntryUids]
      : Array.from(state.selectedEntryUids),
    readonlyEntryUids: Array.isArray(patch.readonlyEntryUids)
      ? [...patch.readonlyEntryUids]
      : Array.from(state.readonlyEntryUids),
    planningResult: hasPlanningResultPatch ? _.cloneDeep(patch.planningResult) : _.cloneDeep(state.planningResult),
    previewResult: hasPreviewResultPatch ? _.cloneDeep(patch.previewResult) : _.cloneDeep(state.previewResult),
    statusText: typeof patch.statusText === 'string' ? patch.statusText : state.statusText,
    promptSettings: { ...current.promptSettings, ...(patch.promptSettings || {}) },
    customApi: { ...current.customApi, ...(patch.customApi || {}) },
    editableFields: { ...current.editableFields, ...(patch.editableFields || {}) },
  });
}

function normalizeUidList(value) {
  return _.uniq((Array.isArray(value) ? value : [])
    .map(uid => Number(uid))
    .filter(uid => Number.isFinite(uid)));
}

function hydrateWorkspaceState(saved = settings(), lorebookName = '') {
  const targetLorebook = (lorebookName || saved?.lorebookName || '').trim();
  const canReuseSavedState = !targetLorebook || (saved?.lorebookName || '').trim() === targetLorebook;

  state.selectedEntryUids = new Set(canReuseSavedState ? normalizeUidList(saved?.selectedEntryUids) : []);
  state.readonlyEntryUids = new Set(canReuseSavedState ? normalizeUidList(saved?.readonlyEntryUids) : []);
  state.planningResult = canReuseSavedState ? _.cloneDeep(saved?.planningResult || null) : null;
  state.previewResult = canReuseSavedState ? _.cloneDeep(saved?.previewResult || null) : null;
  state.statusText = canReuseSavedState ? (saved?.statusText || '') : '';
}

function setStatus(text) {
  state.statusText = text || '';
  $('#ai-workspace-status', parentDoc()).text(state.statusText);
}

function setModelStatus(text) {
  state.modelStatusText = text || '';
  $('#ai-workspace-models-status', parentDoc()).text(state.modelStatusText);
}

function setGeneratingState(isGenerating) {
  state.isGenerating = Boolean(isGenerating);
  $('#ai-workspace-plan', parentDoc()).prop('disabled', state.isGenerating);
  $('#ai-workspace-preview', parentDoc()).prop('disabled', state.isGenerating);
  $('#ai-workspace-stop', parentDoc()).prop('disabled', !state.isGenerating);
  if (!state.isGenerating) {
    state.activeGenerationId = '';
  }
}

function renderDebugInfo(debug = {}) {
  const fields = {
    request: $('#ai-workspace-debug-request', parentDoc()),
    response: $('#ai-workspace-debug-response', parentDoc()),
    json: $('#ai-workspace-debug-json', parentDoc()),
    error: $('#ai-workspace-debug-error', parentDoc()),
    diagnostics: $('#ai-workspace-debug-diagnostics', parentDoc()),
  };
  fields.request.val(debug.requestPrompt || '');
  fields.response.val(debug.rawResponse || '');
  fields.json.val(debug.parsedJsonCandidate || '');
  fields.error.val(debug.errorDetails || '');
  fields.diagnostics.val(debug.diagnosticsReport || '');

  const hasFailure = Boolean(debug.errorDetails);
  const hasAnySuccessDebug = Boolean(debug.requestPrompt || debug.rawResponse || debug.parsedJsonCandidate);
  const visibility = hasFailure
    ? {
      request: false,
      response: false,
      json: false,
      error: Boolean(debug.errorDetails),
      diagnostics: Boolean(debug.diagnosticsReport),
    }
    : {
      request: hasAnySuccessDebug,
      response: hasAnySuccessDebug,
      json: hasAnySuccessDebug,
      error: false,
      diagnostics: false,
    };

  Object.entries(fields).forEach(([key, $field]) => {
    const $block = $field.closest('.ai-debug-block');
    const shouldShow = Boolean(visibility[key]);
    $block.toggle(shouldShow);
    if (!shouldShow) {
      $block.prop('open', false);
    }
  });
}

function renderPlanningResult(planningResult = null) {
  state.planningResult = planningResult || null;
  if (!planningResult) {
    $('#ai-workspace-plan-summary', parentDoc()).text('尚未生成改造方案。');
    $('#ai-workspace-plan-json', parentDoc()).val('');
    return;
  }

  const plan = planningResult.plan || {};
  const summaryLines = [
    `只读 ${planningResult.readonly_uids?.length || 0} 条，可修改 ${planningResult.editable_uids?.length || 0} 条`,
  ];
  if (plan.goal) {
    summaryLines.push(`目标：${plan.goal}`);
  }

  $('#ai-workspace-plan-summary', parentDoc()).text(summaryLines.join(' | '));
  $('#ai-workspace-plan-json', parentDoc()).val(
    JSON.stringify(
      {
        readonly_uids: planningResult.readonly_uids || [],
        editable_uids: planningResult.editable_uids || [],
        plan: planningResult.plan || {},
      },
      null,
      2,
    ),
  );
}

function clearPreview(text = '尚未生成预览。') {
  state.previewResult = null;
  closePreviewModal();
  $('#ai-workspace-preview-summary', parentDoc()).text(text);
  $('#ai-workspace-preview-errors', parentDoc()).removeClass('has-errors').empty();
  $('#ai-workspace-preview-list', parentDoc()).empty();
  $('#ai-workspace-apply', parentDoc()).prop('disabled', true);
  renderDebugInfo();
}

function hasManualSelection() {
  return state.selectedEntryUids.size > 0 || state.readonlyEntryUids.size > 0;
}

function ensureMarkup() {
  const $content = $(`#${AI_CONTENT_ID} .ai-workspace-list-container`, parentDoc());
  if (!$content.length) {
    return;
  }

  if (root().attr('data-layout') === 'desktop') {
    $content.empty();
  }

  if (root().length) {
    return;
  }

  const sourceOptions = SOURCES.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  $content.html(`
    <div id="${ROOT_ID}">
      <div class="ai-drawer" data-expanded="true">
        <div class="ai-drawer-summary" tabindex="0">API 设置</div>
        <div class="ai-drawer-body">
          <div class="ai-toolbar">
            <label><input type="radio" name="ai-workspace-api-mode" value="preset"> 使用当前预设</label>
            <label><input type="radio" name="ai-workspace-api-mode" value="custom"> 覆盖当前预设 API 配置</label>
          </div>
          <div id="ai-workspace-custom-api">
            <div id="ai-workspace-custom-api-fields">
            <div class="ai-row">
              <div class="ai-field">
                <label for="ai-workspace-source-select">API 渠道</label>
                <select id="ai-workspace-source-select">${sourceOptions}</select>
              </div>
              <div class="ai-field ai-grow" id="ai-workspace-apiurl-field">
                <label for="ai-workspace-apiurl">API URL</label>
                <input id="ai-workspace-apiurl" type="text" placeholder="https://...">
              </div>
            </div>
            <div class="ai-row">
              <div class="ai-field ai-grow">
                <label for="ai-workspace-apikey">API Key</label>
                <input id="ai-workspace-apikey" type="password" placeholder="覆盖模式下必填">
              </div>
              <div class="ai-field ai-grow">
                <label for="ai-workspace-model">Model</label>
                <input id="ai-workspace-model" type="text" list="${MODEL_LIST_ID}" placeholder="模型名称">
                <datalist id="${MODEL_LIST_ID}"></datalist>
              </div>
              <div class="ai-field ai-btn-field">
                <label>&nbsp;</label>
                <button type="button" id="ai-workspace-load-models">读取模型列表</button>
              </div>
            </div>
            </div>
            <div class="ai-toolbar ai-api-toolbar">
              <label><input type="checkbox" id="ai-workspace-stream"> 流式生成</label>
              <span id="ai-workspace-models-status" class="ai-text"></span>
            </div>
            <div id="ai-workspace-api-hint" class="ai-note"></div>
          </div>
        </div>
      </div>

      <div class="ai-drawer ai-selection-drawer" data-expanded="true">
        <div class="ai-drawer-summary" tabindex="0">条目列表</div>
        <div class="ai-drawer-body">
          <div class="ai-row ai-worldbook-row">
            <div class="ai-field ai-grow">
              <label for="ai-workspace-lorebook-search">目标世界书</label>
              <input id="ai-workspace-lorebook" type="hidden">
              <div class="global-lorebook-adder ai-worldbook-adder">
                <div class="global-lorebook-search-wrapper">
                  <i class="fa-solid fa-search"></i>
                  <input id="ai-workspace-lorebook-search" type="text" placeholder="搜索并选择目标世界书...">
                </div>
                <div id="ai-workspace-lorebook-search-results" class="add-worldbook-results"></div>
              </div>
              <div id="ai-workspace-current-lorebook" class="ai-current-lorebook" data-empty="true">
                当前目标世界书：<strong id="ai-workspace-current-lorebook-name">未选择</strong>
              </div>
            </div>
            <div class="ai-field ai-btn-field">
              <label>&nbsp;</label>
              <button type="button" id="ai-workspace-refresh-entries">刷新条目</button>
            </div>
          </div>
          <div class="ai-row">
            <div class="ai-field ai-grow">
              <label for="ai-workspace-search">搜索条目</label>
              <input id="ai-workspace-search" type="text" placeholder="按标题筛选当前世界书条目">
            </div>
          </div>
          <div class="ai-toolbar">
            <button type="button" id="ai-workspace-select-visible">当前筛选设为修改</button>
            <button type="button" id="ai-workspace-mark-visible-readonly">当前筛选设为只读</button>
            <button type="button" id="ai-workspace-clear-selection">清空选择</button>
            <span id="ai-workspace-selection-summary" class="ai-text">尚未加载条目</span>
          </div>
          <div id="ai-workspace-entry-list" class="ai-scroll ai-entry-list"></div>
        </div>
      </div>

      <div class="ai-drawer" data-expanded="true">
        <div class="ai-drawer-summary" tabindex="0">AI 指令</div>
        <div class="ai-drawer-body">
          <div class="ai-toolbar">
            <label><input type="checkbox" id="ai-workspace-field-title"> 条目标题</label>
            <label><input type="checkbox" id="ai-workspace-field-content"> 条目内容</label>
            <label><input type="checkbox" id="ai-workspace-field-prompt"> 条目提示词</label>
          </div>
          <div class="ai-field">
            <label for="ai-workspace-instruction">发送给 AI 的指令</label>
            <textarea id="ai-workspace-instruction" placeholder="例如：保留原意，但压缩内容，统一语气，并补全更明确的提示词。"></textarea>
          </div>
          <div class="ai-toolbar">
            <button type="button" id="ai-workspace-plan">生成改造方案</button>
            <button type="button" id="ai-workspace-preview">生成预览</button>
            <button type="button" id="ai-workspace-stop" disabled>停止生成</button>
            <button type="button" id="ai-workspace-apply" disabled>应用预览</button>
            <span id="ai-workspace-status" class="ai-text">先选择世界书、条目和 AI 指令。</span>
          </div>
        </div>
      </div>

      <div class="ai-drawer" data-expanded="true">
        <div class="ai-drawer-summary" tabindex="0">改造方案</div>
        <div class="ai-drawer-body">
          <div id="ai-workspace-plan-summary" class="ai-text">尚未生成改造方案。</div>
          <div class="ai-debug-grid">
            <details class="ai-debug-block">
              <summary>改造方案 JSON</summary>
              <textarea id="ai-workspace-plan-json" readonly></textarea>
            </details>
          </div>
        </div>
      </div>

      <div class="ai-drawer" data-expanded="true">
        <div class="ai-drawer-summary" tabindex="0">提示词设置</div>
        <div class="ai-drawer-body">
          <div class="ai-note">破限提示词默认放在最前面，不使用 XML 包裹。指导提示词放在后面的&lt;提示词&gt;段内。</div>
          <div class="ai-field">
            <label for="ai-workspace-jailbreak-prompt-template">破限提示词</label>
            <textarea id="ai-workspace-jailbreak-prompt-template" class="ai-prompt-template"></textarea>
          </div>
          <div class="ai-note">这里的“指导提示词”是实际发给 AI 的模板文本，可自由修改，不是 BuiltinPrompt 勾选项。</div>
          <div class="ai-field">
            <label for="ai-workspace-builtin-prompt-template">指导提示词</label>
            <textarea id="ai-workspace-builtin-prompt-template" class="ai-prompt-template"></textarea>
          </div>
        </div>
      </div>

      <div class="ai-drawer" data-expanded="true">
        <div class="ai-drawer-summary" tabindex="0">预览结果</div>
        <div class="ai-drawer-body">
          <div id="ai-workspace-preview-summary" class="ai-text">尚未生成预览。</div>
          <div id="ai-workspace-preview-errors" class="ai-preview-errors"></div>
          <div id="ai-workspace-preview-list" class="ai-scroll ai-preview-list"></div>
          <div class="ai-debug-grid">
            <details class="ai-debug-block">
              <summary>发送给 AI 的完整内容</summary>
              <textarea id="ai-workspace-debug-request" readonly></textarea>
            </details>
            <details class="ai-debug-block">
              <summary>AI 返回的完整内容</summary>
              <textarea id="ai-workspace-debug-response" readonly></textarea>
            </details>
            <details class="ai-debug-block">
              <summary>解析出的 JSON</summary>
              <textarea id="ai-workspace-debug-json" readonly></textarea>
            </details>
            <details class="ai-debug-block">
              <summary>请求失败的完整报错</summary>
              <textarea id="ai-workspace-debug-error" readonly></textarea>
            </details>
            <details class="ai-debug-block">
              <summary>兼容诊断报告</summary>
              <textarea id="ai-workspace-debug-diagnostics" readonly></textarea>
            </details>
          </div>
        </div>
      </div>

      <div id="ai-workspace-preview-modal" class="ai-preview-modal" style="display:none;">
        <div class="ai-preview-modal-dialog">
          <div class="ai-preview-modal-header">
            <h4 id="ai-workspace-preview-modal-title">条目完整预览</h4>
            <span class="ai-preview-modal-close" tabindex="0">&times;</span>
          </div>
          <div class="ai-preview-modal-body">
            <div id="ai-workspace-preview-modal-summary" class="ai-text"></div>
            <div id="ai-workspace-preview-modal-content"></div>
          </div>
          <div class="ai-preview-modal-footer">
            <button type="button" id="ai-workspace-preview-modal-close-button">关闭</button>
          </div>
        </div>
      </div>
    </div>
  `);
}

function ensureStyles() {
  if ($('#lorebook-ai-workspace-styles', parentDoc()).length) {
    return;
  }

  $('head', parentDoc()).append(`
    <style id="lorebook-ai-workspace-styles">
      #${AI_CONTENT_ID}{overflow:hidden!important;padding-right:0;box-sizing:border-box}
      #${AI_CONTENT_ID} .ai-workspace-list-container{overflow-y:auto;flex-grow:1;padding-right:5px;margin-right:-5px}
      #${ROOT_ID}{display:flex;flex-direction:column;gap:12px;min-height:100%;padding-right:4px;box-sizing:border-box;color:var(--panel-text-color,#eee)}
      #${ROOT_ID} .ai-drawer{border:1px solid var(--panel-border-color,#555);border-radius:6px;background:var(--panel-bg-color,rgba(42,42,42,.95));overflow:hidden}
      #${ROOT_ID} .ai-drawer-summary{cursor:pointer;padding:10px 12px;background:var(--panel-entry-bg-color,#333);color:var(--panel-text-color,#eee);font-weight:600;user-select:none;outline:none}
      #${ROOT_ID} .ai-drawer-summary::before{content:'>';display:inline-block;margin-right:8px;transition:transform .2s ease}
      #${ROOT_ID} .ai-drawer[data-expanded="true"] .ai-drawer-summary::before{transform:rotate(90deg)}
      #${ROOT_ID} .ai-drawer-body{padding:12px;background:var(--panel-bg-color,rgba(42,42,42,.95))}
      #${ROOT_ID} .ai-selection-drawer{position:relative;overflow:visible;z-index:2}
      #${ROOT_ID} .ai-selection-drawer .ai-drawer-body{overflow:visible}
      #${ROOT_ID} .ai-row{display:flex;gap:10px;align-items:flex-end;margin-bottom:10px}
      #${ROOT_ID} .ai-row:last-child{margin-bottom:0}
      #${ROOT_ID} .ai-worldbook-row{align-items:flex-start}
      #${ROOT_ID} .ai-field{display:flex;flex-direction:column;gap:6px;min-width:160px}
      #${ROOT_ID} .ai-grow{flex:1 1 auto}
      #${ROOT_ID} .ai-btn-field{flex:0 0 auto;min-width:120px}
      #${ROOT_ID} label{font-size:13px;color:var(--panel-text-color,#ddd)}
      #${ROOT_ID} input[type='text'],#${ROOT_ID} input[type='password'],#${ROOT_ID} select,#${ROOT_ID} textarea{width:100%;box-sizing:border-box;border:1px solid var(--panel-border-color,#555);border-radius:4px;background:var(--search-input-bg-color,#222);color:var(--panel-text-color,#eee);padding:8px 10px}
      #${ROOT_ID} textarea{min-height:120px;resize:vertical}
      #${ROOT_ID} .ai-prompt-template{min-height:220px;font-family:Consolas,Monaco,monospace}
      #${ROOT_ID} button{border:1px solid var(--panel-border-color,#666);border-radius:4px;background:var(--panel-accent-color,#4a6a8a);color:var(--panel-text-color,#fff);padding:8px 12px;cursor:pointer}
      #${ROOT_ID} button[disabled]{opacity:.6;cursor:not-allowed}
      #${ROOT_ID} .ai-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      #${ROOT_ID} .ai-api-toolbar{justify-content:space-between}
      #${ROOT_ID} .ai-text{color:var(--panel-text-color,#cfd8dc);line-height:1.4;font-size:13px}
      #${ROOT_ID} .ai-note{font-size:13px;line-height:1.5;color:var(--panel-text-color,#cfd8dc);opacity:.9;margin-bottom:10px}
      #${ROOT_ID} .ai-scroll{overflow-y:auto;border:1px solid var(--panel-border-color,#444);border-radius:4px;background:var(--panel-entry-bg-color,#242424)}
      #${ROOT_ID} .ai-entry-list{min-height:360px;max-height:480px;margin-top:10px}
      #${ROOT_ID} .ai-preview-list{min-height:240px;max-height:420px;margin-top:10px}
      #${ROOT_ID} .ai-entry-item{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-bottom:1px solid var(--panel-border-color,#3e3e3e)}
      #${ROOT_ID} .ai-entry-item:last-child,#${ROOT_ID} .ai-preview-item:last-child{border-bottom:0}
      #${ROOT_ID} .ai-entry-main{min-width:0;flex:1 1 auto}
      #${ROOT_ID} .ai-entry-mode{width:150px;flex:0 0 150px}
      #${ROOT_ID} .ai-entry-item-title,#${ROOT_ID} .ai-preview-item-title{font-weight:600;margin-bottom:4px;color:var(--panel-text-color,#eee)}
      #${ROOT_ID} .ai-entry-item-meta,#${ROOT_ID} .ai-entry-item-snippet{color:var(--panel-text-color,#ccc);font-size:13px;line-height:1.5}
      #${ROOT_ID} .ai-entry-item-snippet{margin-top:4px}
      #${ROOT_ID} .ai-preview-errors{display:none;margin-top:10px;margin-bottom:10px;color:#ffb4b4;white-space:pre-wrap}
      #${ROOT_ID} .ai-preview-errors.has-errors{display:block}
      #${ROOT_ID} .ai-preview-item{padding:10px 12px;border-bottom:1px solid var(--panel-border-color,#3e3e3e);cursor:pointer}
      #${ROOT_ID} .ai-preview-item:hover{background:rgba(255,255,255,.04)}
      #${ROOT_ID} .ai-preview-diff + .ai-preview-diff{margin-top:8px}
      #${ROOT_ID} .ai-preview-diff-label{color:var(--panel-accent-color,#9fc8e4);margin-bottom:2px}
      #${ROOT_ID} .ai-preview-diff-before,#${ROOT_ID} .ai-preview-diff-after{font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
      #${ROOT_ID} .ai-preview-diff-before{color:var(--panel-text-color,#b8b8b8);opacity:.8}
      #${ROOT_ID} .ai-preview-diff-after{color:var(--panel-text-color,#f3df94)}
      #${ROOT_ID} .ai-preview-modal{position:fixed;z-index:10006;left:0;top:0;width:100vw;height:100vh;background-color:rgba(0,0,0,.7);overflow-y:auto;box-sizing:border-box}
      #${ROOT_ID} .ai-preview-modal-dialog{background:var(--panel-bg-color,#2c2c2c);color:var(--panel-text-color,#eee);padding:0;border:1px solid var(--panel-border-color,#555);width:90%;max-width:900px;border-radius:8px;box-shadow:0 5px 15px rgba(0,0,0,.5);display:flex;flex-direction:column;max-height:calc(100vh - 150px);margin:80px auto 50px auto;box-sizing:border-box}
      #${ROOT_ID} .ai-preview-modal-header{padding:10px 15px;background:var(--panel-accent-color,#3a6a8e);color:#fff;border-top-left-radius:8px;border-top-right-radius:8px;display:flex;justify-content:space-between;align-items:center}
      #${ROOT_ID} .ai-preview-modal-header h4{margin:0;font-size:16px}
      #${ROOT_ID} .ai-preview-modal-close{font-size:28px;font-weight:700;cursor:pointer;line-height:1}
      #${ROOT_ID} .ai-preview-modal-body{padding:15px;max-height:70vh;overflow-y:auto}
      #${ROOT_ID} .ai-preview-modal-section + .ai-preview-modal-section{margin-top:14px}
      #${ROOT_ID} .ai-preview-modal-section-title{font-weight:600;margin-bottom:6px;color:var(--panel-accent-color,#9fc8e4)}
      #${ROOT_ID} .ai-preview-modal-panel{display:grid;gap:10px}
      #${ROOT_ID} .ai-preview-modal-field textarea{min-height:180px;font-family:Consolas,Monaco,monospace}
      #${ROOT_ID} .ai-preview-modal-footer{padding:10px 15px;text-align:right;border-top:1px solid var(--panel-border-color,#444)}
      #${ROOT_ID} .ai-empty{padding:12px;color:var(--panel-text-color,#bbb);opacity:.8}
      #${ROOT_ID} .ai-worldbook-adder{position:relative}
      #${ROOT_ID} .ai-worldbook-adder .global-lorebook-search-wrapper{margin-bottom:0}
      #${ROOT_ID} .ai-worldbook-adder .fa-search{position:absolute;top:50%;left:10px;transform:translateY(-50%);color:#888}
      #${ROOT_ID} #ai-workspace-lorebook-search{padding:8px 12px 8px 35px}
      #${ROOT_ID} #ai-workspace-lorebook-search-results{position:absolute;top:calc(100% + 4px);left:0;right:0;display:none;max-height:320px;overflow-y:auto;box-sizing:border-box;z-index:320}
      #${ROOT_ID} #ai-workspace-lorebook-search-results .add-worldbook-result-item.is-active{background:rgba(255,255,255,.08)}
      #${ROOT_ID} .ai-current-lorebook{padding:8px 10px;border:1px solid var(--panel-border-color,#555);border-radius:4px;background:var(--panel-entry-bg-color,#2a2a2a);color:var(--panel-text-color,#d7d7d7);font-size:13px;line-height:1.4}
      #${ROOT_ID} .ai-current-lorebook[data-empty='true'] strong{font-weight:500;opacity:.75}
      #${ROOT_ID} .ai-debug-grid{display:grid;gap:10px;margin-top:12px}
      #${ROOT_ID} .ai-debug-block{border:1px solid var(--panel-border-color,#444);border-radius:4px;background:var(--panel-entry-bg-color,#242424);overflow:hidden}
      #${ROOT_ID} .ai-debug-block summary{cursor:pointer;padding:10px 12px;font-size:13px;font-weight:600;color:var(--panel-text-color,#ddd);background:rgba(255,255,255,.03)}
      #${ROOT_ID} .ai-debug-block textarea{border:0;border-top:1px solid var(--panel-border-color,#444);border-radius:0;min-height:180px;background:transparent;font-family:Consolas,Monaco,monospace}
      #${ROOT_ID} #ai-workspace-api-hint{margin-top:8px}
      #${AI_CONTENT_ID} .ai-workspace-list-container,#${ROOT_ID} .ai-scroll{scrollbar-width:thin;scrollbar-color:var(--panel-accent-color,#6c88a3) var(--panel-entry-bg-color,#232323)}
      #${AI_CONTENT_ID} .ai-workspace-list-container::-webkit-scrollbar,#${ROOT_ID} .ai-scroll::-webkit-scrollbar{width:10px;height:10px}
      #${AI_CONTENT_ID} .ai-workspace-list-container::-webkit-scrollbar-track,#${ROOT_ID} .ai-scroll::-webkit-scrollbar-track{background:var(--panel-entry-bg-color,#232323)}
      #${AI_CONTENT_ID} .ai-workspace-list-container::-webkit-scrollbar-thumb,#${ROOT_ID} .ai-scroll::-webkit-scrollbar-thumb{background:var(--panel-accent-color,#6c88a3);border-radius:999px;border:2px solid var(--panel-entry-bg-color,#232323)}
      #${AI_CONTENT_ID} .ai-workspace-list-container::-webkit-scrollbar-thumb:hover,#${ROOT_ID} .ai-scroll::-webkit-scrollbar-thumb:hover{filter:brightness(1.1)}
      @media (max-width:900px){
        #${ROOT_ID} .ai-row{flex-direction:column;align-items:stretch}
        #${ROOT_ID} .ai-field,#${ROOT_ID} .ai-btn-field{min-width:0;width:100%}
        #${ROOT_ID} .ai-api-toolbar{justify-content:flex-start}
        #${ROOT_ID} .ai-entry-list{min-height:280px}
        #${ROOT_ID} .ai-preview-list{min-height:220px}
      }
    </style>
  `);
}

function selectedFields() {
  return {
    title: $('#ai-workspace-field-title', parentDoc()).prop('checked'),
    content: $('#ai-workspace-field-content', parentDoc()).prop('checked'),
    prompt: $('#ai-workspace-field-prompt', parentDoc()).prop('checked'),
  };
}

function currentPromptSettings() {
  return {
    jailbreakPromptTemplate: jailbreakPromptTemplateValue(),
    builtinPromptTemplate: builtinPromptTemplateValue(),
  };
}

function customApi() {
  return {
    apiurl: ($('#ai-workspace-apiurl', parentDoc()).val() || '').trim(),
    key: ($('#ai-workspace-apikey', parentDoc()).val() || '').trim(),
    model: ($('#ai-workspace-model', parentDoc()).val() || '').trim(),
    source: selectedSource(),
  };
}

function getSillyTavernApi() {
  const parentWin = typeof window.parent !== 'undefined' ? window.parent : window;
  return (typeof SillyTavern !== 'undefined' ? SillyTavern : parentWin.SillyTavern) || null;
}

function parseModelListPayload(data) {
  const modelsList = Array.isArray(data?.models)
    ? data.models
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data)
        ? data
        : [];

  return modelsList
    .map(model => (typeof model === 'string' ? model : model?.id || model?.name || model?.model || ''))
    .filter(Boolean);
}

function buildStatusApiRequestBodies(apiConfig) {
  const source = (apiConfig?.source || 'openai').trim() || 'openai';
  if (isCustomSource(source)) {
    return [
      {
        label: 'custom-status',
        body: {
          reverse_proxy: apiConfig.apiurl,
          proxy_password: '',
          chat_completion_source: 'custom',
          custom_url: apiConfig.apiurl,
          custom_include_headers: apiConfig.key ? 'Authorization: Bearer ' + apiConfig.key : '',
        },
      },
    ];
  }

  return [
    {
      label: 'official-status-minimal',
      body: {
        chat_completion_source: source,
      },
    },
    {
      label: 'official-status-with-credentials',
      body: {
        chat_completion_source: source,
        source,
        model: apiConfig.model || '',
        key: apiConfig.key || '',
        api_key: apiConfig.key || '',
      },
    },
  ];
}

async function loadModelListViaStatusApi(apiConfig) {
  const stApi = getSillyTavernApi();
  if (!stApi || typeof stApi.getRequestHeaders !== 'function') {
    throw new Error('当前环境没有可用的 SillyTavern.getRequestHeaders()');
  }

  const attempts = buildStatusApiRequestBodies(apiConfig);
  const errors = [];

  for (const attempt of attempts) {
    console.info('[Lorebook AI] status endpoint request', {
      label: attempt.label,
      source: apiConfig?.source || 'openai',
      body: {
        ...attempt.body,
        key: attempt.body.key ? '[redacted]' : '',
        api_key: attempt.body.api_key ? '[redacted]' : '',
        custom_include_headers: attempt.body.custom_include_headers ? '[redacted]' : '',
      },
    });

    const response = await fetch('/api/backends/chat-completions/status', {
    method: 'POST',
    headers: { ...stApi.getRequestHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(attempt.body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(('状态接口请求失败: ' + response.status + ' ' + response.statusText + ' ' + errorText).trim());
  }

  const data = await response.json();
  console.info('[Lorebook AI] status endpoint raw result', data);
  return parseModelListPayload(data);
}

}

async function loadModelListViaStatusApiWithFallback(apiConfig) {
  const stApi = getSillyTavernApi();
  if (!stApi || typeof stApi.getRequestHeaders !== 'function') {
    throw new Error('当前环境没有可用的 SillyTavern.getRequestHeaders()');
  }

  const attempts = buildStatusApiRequestBodies(apiConfig);
  const errors = [];

  for (const attempt of attempts) {
    console.info('[Lorebook AI] status endpoint request', {
      label: attempt.label,
      source: apiConfig?.source || 'openai',
      body: {
        ...attempt.body,
        key: attempt.body.key ? '[redacted]' : '',
        api_key: attempt.body.api_key ? '[redacted]' : '',
        custom_include_headers: attempt.body.custom_include_headers ? '[redacted]' : '',
      },
    });

    const response = await fetch('/api/backends/chat-completions/status', {
      method: 'POST',
      headers: { ...stApi.getRequestHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(attempt.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[Lorebook AI] status endpoint failed', {
        label: attempt.label,
        status: response.status,
        statusText: response.statusText,
        errorText,
      });
      errors.push(`${attempt.label}: ${response.status} ${response.statusText} ${errorText}`.trim());
      continue;
    }

    const data = await response.json();
    console.info('[Lorebook AI] status endpoint raw result', {
      label: attempt.label,
      data,
    });

    const models = parseModelListPayload(data);
    if (models.length > 0) {
      return models;
    }

    errors.push(`${attempt.label}: status endpoint returned no parsable models`);
  }

  throw new Error(errors.join(' | ') || '状态接口未返回可用模型列表。');
}

function persist() {
  saveSettings({
    lorebookName: currentLorebook(),
    apiMode: getApiMode(),
    stream: isStreamEnabled(),
    promptSettings: currentPromptSettings(),
    customApi: customApi(),
    editableFields: selectedFields(),
  });
}

function syncSource(source) {
  const normalized = (source || 'openai').trim() || 'openai';
  $('#ai-workspace-source-select', parentDoc()).val(isKnownSource(normalized) ? normalized : 'custom');
}

function toggleCustomApi() {
  const apiMode = getApiMode();
  const source = selectedSource();
  const isCustomMode = apiMode === 'custom';
  const showApiUrl = isCustomMode && isCustomSource(source);

  $('#ai-workspace-custom-api', parentDoc()).show();
  $('#ai-workspace-custom-api-fields', parentDoc()).toggle(isCustomMode);
  $('#ai-workspace-apiurl-field', parentDoc()).toggle(showApiUrl);

  const hint = !isCustomMode
    ? '完全沿用酒馆当前预设，不覆盖 URL、Key、Model。'
    : showApiUrl
      ? 'OpenAI兼容渠道需要填写 URL、Key 和 Model。'
      : '官方渠道只需要填写 Key 和 Model，不强制填写 URL。';
  $('#ai-workspace-api-hint', parentDoc()).text(hint);
}

function setDrawerExpanded($drawer, expanded, animate = true) {
  $drawer.attr('data-expanded', expanded ? 'true' : 'false');
  const $body = $drawer.children('.ai-drawer-body');
  if (!$body.length) {
    return;
  }

  if (animate) {
    $body.stop(true, true)[expanded ? 'slideDown' : 'slideUp'](200);
  } else {
    $body.toggle(expanded);
  }
}

function syncDrawerBodies() {
  root()
    .find('.ai-drawer')
    .each(function () {
      const $drawer = $(this);
      setDrawerExpanded($drawer, $drawer.attr('data-expanded') !== 'false', false);
    });
}

function syncForm() {
  const saved = settings();
  $(`input[name="ai-workspace-api-mode"][value="${saved.apiMode || 'preset'}"]`, parentDoc()).prop('checked', true);
  $('#ai-workspace-apiurl', parentDoc()).val(saved.customApi?.apiurl || '');
  $('#ai-workspace-apikey', parentDoc()).val(saved.customApi?.key || '');
  $('#ai-workspace-model', parentDoc()).val(saved.customApi?.model || '');
  $('#ai-workspace-stream', parentDoc()).prop('checked', saved.stream === true);
  $('#ai-workspace-field-title', parentDoc()).prop('checked', saved.editableFields?.title !== false);
  $('#ai-workspace-field-content', parentDoc()).prop('checked', saved.editableFields?.content !== false);
  $('#ai-workspace-field-prompt', parentDoc()).prop('checked', saved.editableFields?.prompt !== false);
  $('#ai-workspace-jailbreak-prompt-template', parentDoc()).val(saved.promptSettings?.jailbreakPromptTemplate || '');
  $('#ai-workspace-builtin-prompt-template', parentDoc()).val(saved.promptSettings?.builtinPromptTemplate || '');
  syncSource(saved.customApi?.source || 'openai');
  toggleCustomApi();
}

function renderModelOptions() {
  const $datalist = $(`#${MODEL_LIST_ID}`, parentDoc());
  $datalist.empty();
  state.modelOptions.forEach(model => $datalist.append(`<option value="${_.escape(model)}"></option>`));
}

function legacyRenderSelectionSummary(filteredEntries) {
  $('#ai-workspace-selection-summary', parentDoc()).text(
    `已选 ${state.selectedEntryUids.size} 条，可见 ${filteredEntries.length} 条，总计 ${state.entries.length} 条`,
  );
}

function hideLorebookSearchResults() {
  $('#ai-workspace-lorebook-search-results', parentDoc()).empty().hide();
}

function syncCurrentLorebookDisplay(lorebookName = '') {
  const name = (lorebookName || '').trim();
  $('#ai-workspace-lorebook', parentDoc()).val(name);
  $('#ai-workspace-current-lorebook', parentDoc()).attr('data-empty', name ? 'false' : 'true');
  $('#ai-workspace-current-lorebook-name', parentDoc()).text(name || '未选择');
}

function filteredLorebookNames(searchText = lorebookSearch()) {
  const normalizedSearch = (searchText || '').trim().toLowerCase();
  return normalizedSearch
    ? state.worldbookNames.filter(name => name.toLowerCase().includes(normalizedSearch))
    : [...state.worldbookNames];
}

function renderLorebookSearchResults(searchText = lorebookSearch()) {
  const $results = $('#ai-workspace-lorebook-search-results', parentDoc());
  if (!$results.length) {
    return;
  }

  const names = filteredLorebookNames(searchText);
  const activeLorebook = currentLorebook();

  if (!state.worldbookNames.length) {
    $results.html('<div class="add-worldbook-no-results">没有可用世界书</div>').show();
    return;
  }

  if (!names.length) {
    $results.html('<div class="add-worldbook-no-results">没有找到匹配的世界书</div>').show();
    return;
  }

  $results.html(
    names
      .map(
        name => `
          <div class="add-worldbook-result-item${name === activeLorebook ? ' is-active' : ''}" data-lorebook-name="${_.escape(name)}">
            ${_.escape(name)}
          </div>
        `,
      )
      .join(''),
  ).show();
}

function syncSelectedLorebook(preferred = '') {
  let target = (preferred || currentLorebook() || settings().lorebookName || '').trim();
  if (!state.worldbookNames.includes(target)) {
    target = state.worldbookNames[0] || '';
  }
  syncCurrentLorebookDisplay(target);
  return target;
}

async function populateLorebooks() {
  const saved = settings();
  state.worldbookNames = await getWorldbookNamesSafe();

  if (!state.worldbookNames.length) {
    syncCurrentLorebookDisplay('');
    hideLorebookSearchResults();
    saveSettings({ lorebookName: '' });
    return '';
  }

  const preferred = state.worldbookNames.includes(saved.lorebookName) ? saved.lorebookName : state.worldbookNames[0];
  const selected = syncSelectedLorebook(preferred);
  hideLorebookSearchResults();
  saveSettings({ lorebookName: selected });
  return selected;
}

function filteredEntries() {
  return entrySearch()
    ? state.entries.filter(entry => (entry.name || '').toLowerCase().includes(entrySearch()))
    : state.entries;
}

function legacyRenderEntryList() {
  const $list = $('#ai-workspace-entry-list', parentDoc());
  const entries = filteredEntries();
  $list.empty();

  if (!entries.length) {
    $list.append('<div class="ai-empty">没有匹配的条目。</div>');
    renderSelectionSummary(entries);
    return;
  }

  entries.forEach(entry => {
    const uid = Number(entry.uid);
    const checked = state.selectedEntryUids.has(uid);
    const snippet = (entry.content || '').replace(/\s+/g, ' ').trim();
    $list.append(`
      <label class="ai-entry-item">
        <input type="checkbox" class="ai-entry-checkbox" data-entry-uid="${uid}" ${checked ? 'checked' : ''}>
        <div class="ai-entry-main">
          <div class="ai-entry-item-title">${_.escape(entry.name || `UID ${entry.uid}`)}</div>
          <div class="ai-entry-item-meta">UID: ${uid}</div>
          <div class="ai-entry-item-snippet">${_.escape(snippet.slice(0, 180) || '无内容摘要')}</div>
        </div>
      </label>
    `);
  });

  renderSelectionSummary(entries);
}

function summarizePreviewError(errorText = '') {
  if (typeof errorText !== 'string') {
    return '未知错误';
  }

  const lines = errorText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const summaryLines = [];
  for (const line of lines) {
    if (
      line.startsWith('完整发送内容:') ||
      line.startsWith('完整返回内容:') ||
      line.startsWith('提取出的 JSON:') ||
      line.startsWith('错误堆栈:')
    ) {
      break;
    }
    summaryLines.push(line);
    if (summaryLines.length >= 3) {
      break;
    }
  }

  return summaryLines.join(' | ') || '未知错误';
}

function describeResolvedConfig(previewResult) {
  const resolvedConfig = previewResult?.resolvedConfig || {};
  const model = resolvedConfig.model || '当前模型';
  const streamText = resolvedConfig.shouldStream ? '开' : '关';
  return `${model} / 流式${streamText}`;
}

function buildPreviewSummaryText(previewResult) {
  const summary = previewResult?.summary || { total: 0, succeeded: 0, failed: 0, changed: 0, unchanged: 0 };
  const diagnostics = summary.diagnostics;
  const batching = summary.batching;
  const lines = [
    `总计 ${summary.total} 条，成功 ${summary.succeeded} 条，失败 ${summary.failed} 条，有变更 ${summary.changed} 条，无变更 ${summary.unchanged} 条。`,
  ];

  if (batching?.totalBatches > 1) {
    lines.push(`本次已按 ${batching.totalBatches} 批发送，条目内容总计约 ${batching.totalEntryTokens} tokens。`);
  }

  if (diagnostics?.triggered) {
    lines.push(`兼容诊断 ${diagnostics.totalAttempts} 组，成功 ${diagnostics.succeededAttempts} 组，失败 ${diagnostics.failedAttempts} 组。`);
    if (diagnostics.foundWorkingConfig) {
      lines.push(`当前预览采用：${describeResolvedConfig(previewResult)}。`);
    } else {
      lines.push('兼容诊断未找到可用组合。');
    }
    if (diagnostics.stopped) {
      lines.push('诊断过程已手动停止。');
    }
  }

  return lines.join(' ');
}

function buildDiagnosticsErrorSummary(previewResult) {
  const diagnostics = previewResult?.summary?.diagnostics;
  if (!diagnostics?.triggered) {
    return '';
  }

  const lines = [];
  if (diagnostics.initialErrorSummary) {
    lines.push(`初始失败：${diagnostics.initialErrorSummary}`);
  }
  lines.push(`诊断统计：共 ${diagnostics.totalAttempts} 组，成功 ${diagnostics.succeededAttempts} 组，失败 ${diagnostics.failedAttempts} 组。`);
  lines.push(
    diagnostics.foundWorkingConfig
      ? `已采用可用组合：${describeResolvedConfig(previewResult)}`
      : '未找到可用组合。',
  );
  if (diagnostics.stopped) {
    lines.push('诊断过程已手动停止。');
  }
  return lines.join('\n');
}

function getPreviewStatusText(previewResult) {
  const diagnostics = previewResult?.summary?.diagnostics;
  if (diagnostics?.stopped) {
    return '已停止生成，已返回当前可用诊断结果。';
  }
  if (diagnostics?.triggered) {
    return diagnostics.foundWorkingConfig
      ? `兼容诊断完成，已采用 ${describeResolvedConfig(previewResult)}。`
      : '兼容诊断完成，未找到可用组合。';
  }
  if ((previewResult?.summary?.succeeded || 0) === 0) {
    return '预览生成失败，没有可用结果。';
  }
  return '预览生成完成。';
}

function renderPreviewDiff(diff) {
  if (diff?.type === 'content-snippets' && Array.isArray(diff.snippets) && diff.snippets.length) {
    return diff.snippets.map((snippet, index) => `
          <div class="ai-preview-diff">
            <div class="ai-preview-diff-label">${_.escape(diff.label)}${diff.snippets.length > 1 ? ` #${index + 1}` : ''}</div>
            <div class="ai-preview-diff-before">当前: ${_.escape(snippet.before || '')}</div>
            <div class="ai-preview-diff-after">预览: ${_.escape(snippet.after || '')}</div>
          </div>
        `).join('');
  }

  return `
        <div class="ai-preview-diff">
          <div class="ai-preview-diff-label">${_.escape(diff.label)}</div>
          <div class="ai-preview-diff-before">当前: ${_.escape(JSON.stringify(diff.before, null, 2))}</div>
          <div class="ai-preview-diff-after">预览: ${_.escape(JSON.stringify(diff.after, null, 2))}</div>
        </div>
      `;
}

function formatPreviewModalValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return JSON.stringify(value, null, 2);
  }
  return value == null ? '' : String(value);
}

function buildPreviewModalSections(item) {
  const sections = [];
  const beforeEntry = item?.beforeEntry || {};
  const afterEntry = item?.afterEntry || {};
  const beforeKeywords = Array.isArray(beforeEntry?.strategy?.keys) ? beforeEntry.strategy.keys : [];
  const afterKeywords = Array.isArray(afterEntry?.strategy?.keys) ? afterEntry.strategy.keys : [];

  if ((beforeEntry?.name || '') !== (afterEntry?.name || '')) {
    sections.push({
      title: '标题',
      before: beforeEntry?.name || '',
      after: afterEntry?.name || '',
    });
  }

  if ((beforeEntry?.content || '') !== (afterEntry?.content || '')) {
    sections.push({
      title: '内容',
      before: beforeEntry?.content || '',
      after: afterEntry?.content || '',
    });
  }

  if (!_.isEqual(beforeKeywords, afterKeywords)) {
    sections.push({
      title: '关键词',
      before: beforeKeywords,
      after: afterKeywords,
    });
  }

  if (!sections.length) {
    sections.push({
      title: '当前条目',
      before: beforeEntry?.content || '',
      after: afterEntry?.content || '',
    });
  }

  return sections;
}

function closePreviewModal() {
  $('#ai-workspace-preview-modal', parentDoc()).hide();
}

function openPreviewModal(uid) {
  const item = state.previewResult?.items?.find(previewItem => Number(previewItem?.uid) === Number(uid));
  if (!item) {
    return;
  }

  const sections = buildPreviewModalSections(item);
  $('#ai-workspace-preview-modal-title', parentDoc()).text(`${item.title || '条目'} (UID: ${item.uid})`);
  $('#ai-workspace-preview-modal-summary', parentDoc()).text(item.changed ? '显示本条目的完整修改内容。' : '本条目当前无实际变更。');
  $('#ai-workspace-preview-modal-content', parentDoc()).html(
    sections.map(section => `
          <div class="ai-preview-modal-section">
            <div class="ai-preview-modal-section-title">${_.escape(section.title)}</div>
            <div class="ai-preview-modal-panel">
              <div class="ai-preview-modal-field">
                <label>当前</label>
                <textarea readonly>${_.escape(formatPreviewModalValue(section.before))}</textarea>
              </div>
              <div class="ai-preview-modal-field">
                <label>预览</label>
                <textarea readonly>${_.escape(formatPreviewModalValue(section.after))}</textarea>
              </div>
            </div>
          </div>
        `).join(''),
  );
  $('#ai-workspace-preview-modal', parentDoc()).css('display', 'block');
}

function renderPreview(previewResult) {
  const summary = previewResult?.summary || { total: 0, succeeded: 0, failed: 0, changed: 0, unchanged: 0 };
  $('#ai-workspace-preview-summary', parentDoc()).text(buildPreviewSummaryText(previewResult));

  const $errors = $('#ai-workspace-preview-errors', parentDoc());
  const diagnosticsSummary = buildDiagnosticsErrorSummary(previewResult);
  if (diagnosticsSummary) {
    $errors.addClass('has-errors').text(diagnosticsSummary);
  } else if (Array.isArray(previewResult?.errors) && previewResult.errors.length) {
    $errors
      .addClass('has-errors')
      .text(
        previewResult.errors
          .map(item => {
            const summary = /Got response status 503|response status 503|\b503\b/i.test(item.error || '')
              ? 'OpenAI兼容后端返回 503，优先检查 URL / 模型 / 流式支持 / 上游服务状态'
              : summarizePreviewError(item.error);
            return `${item.title}: ${summary}`;
          })
          .join('\n'),
      );
  } else {
    $errors.removeClass('has-errors').empty();
  }

  const $list = $('#ai-workspace-preview-list', parentDoc());
  $list.empty();

  if (!Array.isArray(previewResult?.items) || !previewResult.items.length) {
    $list.append('<div class="ai-empty">没有可展示的预览结果。</div>');
    $('#ai-workspace-apply', parentDoc()).prop('disabled', true);
    renderDebugInfo(previewResult?.debug || {});
    return;
  }

  previewResult.items.forEach(item => {
    const diffs = item.diffs.length
      ? item.diffs.map(diff => renderPreviewDiff(diff)).join('')
      : '<div class="ai-preview-diff-after">无实际变更。</div>';

    $list.append(`
      <div class="ai-preview-item" data-preview-uid="${item.uid}" title="点击查看完整修改">
        <div class="ai-preview-item-title">${_.escape(item.title)} (UID: ${item.uid})</div>
        ${diffs}
      </div>
    `);
  });

  renderDebugInfo(previewResult?.debug || {});
  $('#ai-workspace-apply', parentDoc()).prop('disabled', summary.changed === 0);
}

async function legacyLoadEntries(lorebookName) {
  state.entries = [];
  state.selectedEntryUids = new Set();
  state.readonlyEntryUids = new Set();
  state.loadedLorebookName = lorebookName || '';
  clearPreview();

  if (!lorebookName) {
       renderEntryList();
      persist();
    setStatus('请先选择目标世界书。');
    return;
  }

  setStatus(`正在加载世界书“${lorebookName}”的条目...`);
  const entries = await collectAiTargetEntries(lorebookName, []);
  state.entries = entries.map(entry => ({ uid: Number(entry.uid), name: entry.name || '', content: entry.content || '' }));
  renderEntryList();
  setStatus(`已加载 ${state.entries.length} 条可处理条目。`);
}

function validateCustomApiConfig(apiConfig, { requireModel = true } = {}) {
  const source = apiConfig.source || 'openai';

  if (!apiConfig.key) {
    return '覆盖当前预设 API 配置时必须填写 API Key。';
  }
  if (requireModel && !apiConfig.model) {
    return '覆盖当前预设 API 配置时必须填写 Model。';
  }
  if (isCustomSource(source) && !apiConfig.apiurl) {
    return 'OpenAI兼容渠道必须填写 API URL。';
  }

  return '';
}

async function legacyHandlePreview() {
  persist();
  const lorebookName = currentLorebook();
  const instruction = instructionValue();
  const entryUids = Array.from(state.selectedEntryUids);
  const saved = settings();
  const runId = ++state.previewRunId;

  if (!lorebookName) return setStatus('请先选择目标世界书。');
  if (!entryUids.length) return setStatus('请先选择至少一个条目。');
  if (!instruction) return setStatus('请输入 AI 指令。');
  if (saved.apiMode === 'custom') {
    const validationMessage = validateCustomApiConfig(saved.customApi, { requireModel: true });
    if (validationMessage) {
      return setStatus(validationMessage);
    }
  }

  state.stopRequested = false;
  $('#ai-workspace-apply', parentDoc()).prop('disabled', true);
  setGeneratingState(true);
  clearPreview('正在生成预览...');

  try {
    const previewResult = await generateAiPreview({
      lorebookName,
      entryUids,
      instruction,
      fieldOptions: saved.editableFields,
      promptSettings: saved.promptSettings,
      customApi: saved.apiMode === 'custom' ? saved.customApi : null,
      shouldStream: saved.stream === true,
      onGenerationStart: generationId => {
        if (runId === state.previewRunId) {
          state.activeGenerationId = generationId;
        }
      },
      shouldStop: () => state.stopRequested === true,
      onProgress: progress => {
        if (runId !== state.previewRunId) return;
        const title = progress?.title ? `${progress.title}，` : '';
        setStatus(`${title}成功 ${progress.succeeded} 条，失败 ${progress.failed} 条`);
      },
    });

    if (runId !== state.previewRunId) {
      return;
    }

    state.previewResult = previewResult;
    renderPreview(previewResult);
    setStatus(getPreviewStatusText(previewResult));
  } catch (error) {
    if (runId !== state.previewRunId) {
      return;
    }

    const message = error?.message || '生成预览失败。';
    clearPreview(message);
    renderDebugInfo({ errorDetails: error?.stack || message });
    setStatus(message);
  } finally {
    if (runId === state.previewRunId) {
      state.stopRequested = false;
      setGeneratingState(false);
    }
  }
}

function handleStop() {
  if (!state.isGenerating) {
    setStatus('当前没有进行中的生成。');
    return;
  }
  state.stopRequested = true;

  if (!state.activeGenerationId) {
    setStatus('已请求停止生成，等待当前步骤结束。');
    return;
  }

  const stopped = cancelLlmGeneration(state.activeGenerationId);
  setStatus(stopped ? '已请求停止生成，等待当前步骤结束。' : '已标记停止，但当前环境可能不会立即中断。');
}

async function handleApply() {
  if (!state.previewResult) {
    return setStatus('当前没有可应用的预览。');
  }

  $('#ai-workspace-apply', parentDoc()).prop('disabled', true);
  setStatus('正在应用 AI 预览...');

  try {
    const result = await applyAiPreview({ lorebookName: currentLorebook(), previewItems: state.previewResult.items });
    if (result.changed) {
      window.toastr?.success(`AI 修改已应用：${result.appliedCount} 条`);
    } else {
      window.toastr?.warning('没有可应用的 AI 变更');
    }

    await loadEntries(currentLorebook());
    clearPreview('本次预览已应用。');
    setStatus('AI 修改已应用完成。');
  } catch (error) {
    setStatus(error?.message || '应用 AI 预览失败。');
    $('#ai-workspace-apply', parentDoc()).prop('disabled', false);
  }
}

async function handleLoadModels() {
  if (getApiMode() !== 'custom') {
    setModelStatus('“使用当前预设”模式下不单独读取覆盖模型列表。');
    setStatus('“使用当前预设”模式下不单独读取覆盖模型列表。');
    return;
  }

  const customApiConfig = customApi();
  const validationMessage = validateCustomApiConfig(customApiConfig, { requireModel: false });
  if (validationMessage) {
    setModelStatus(validationMessage);
    setStatus(validationMessage);
    return;
  }

  const source = customApiConfig.source || 'openai';
  const modelListConfig = {
    apiurl: isCustomSource(source) ? customApiConfig.apiurl : '',
    key: customApiConfig.key,
    source: isCustomSource(source) ? 'openai' : source,
  };

  console.groupCollapsed('[Lorebook AI] handleLoadModels');
  console.info('[Lorebook AI] environment', {
    typeofGetModelList: typeof getModelList,
    typeofGlobalThisGetModelList: typeof globalThis?.getModelList,
    typeofWindowGetModelList: typeof window?.getModelList,
    typeofParentGetModelList: typeof window?.parent?.getModelList,
    typeofTavernHelper: typeof TavernHelper,
    typeofSillyTavern: typeof SillyTavern,
    hasSillyTavernHeaders: typeof getSillyTavernApi()?.getRequestHeaders,
  });
  console.info('[Lorebook AI] request config', {
    apiMode: getApiMode(),
    source,
    apiurl: modelListConfig.apiurl,
    hasKey: Boolean(modelListConfig.key),
  });

  $('#ai-workspace-load-models', parentDoc()).prop('disabled', true);
  setModelStatus('正在读取模型列表...');
  setStatus('正在读取模型列表...');

  try {
    let models = [];
    if (typeof getModelList === 'function') {
      console.info('[Lorebook AI] loading model list via TavernHelper.getModelList');
      const rawResult = await getModelList(modelListConfig);
      console.info('[Lorebook AI] getModelList raw result', rawResult);
      models = parseModelListPayload(rawResult);
    } else {
      console.warn('[Lorebook AI] getModelList unavailable, fallback to status endpoint');
      models = await loadModelListViaStatusApiWithFallback(customApiConfig);
    }

    state.modelOptions = models;
    console.info('[Lorebook AI] parsed model list', {
      length: state.modelOptions.length,
      preview: state.modelOptions.slice(0, 10),
    });

    if (!state.modelOptions.length) {
      throw new Error('未能解析模型列表或列表为空');
    }

    renderModelOptions();
    setModelStatus('已读取 ' + state.modelOptions.length + ' 个模型');
    setStatus('已读取 ' + state.modelOptions.length + ' 个模型');
    window.toastr?.success('已读取 ' + state.modelOptions.length + ' 个模型');
  } catch (error) {
    console.error('[Lorebook AI] load model list failed', error);
    const message = error?.message || '读取模型列表失败';
    setModelStatus(message);
    setStatus(message);
    window.toastr?.error(message);
  } finally {
    console.groupEnd();
    $('#ai-workspace-load-models', parentDoc()).prop('disabled', false);
  }
}

function restoreUiState() {
  renderEntryList();
  renderPlanningResult(state.planningResult);
  if (state.previewResult) {
    renderPreview(state.previewResult);
  } else {
    renderDebugInfo();
  }
  setStatus(state.statusText);
  setModelStatus(state.modelStatusText);
  setGeneratingState(state.isGenerating);
}

function legacyBindEvents() {
  $(parentDoc())
    .off('.aiWorkspace')
    .on('click.aiWorkspace', `#${ROOT_ID} .ai-drawer-summary`, function (event) {
      event.preventDefault();
      event.stopPropagation();
      const $drawer = $(this).closest('.ai-drawer');
      setDrawerExpanded($drawer, $drawer.attr('data-expanded') !== 'true');
    })
    .on('keydown.aiWorkspace', `#${ROOT_ID} .ai-drawer-summary`, function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      const $drawer = $(this).closest('.ai-drawer');
      setDrawerExpanded($drawer, $drawer.attr('data-expanded') !== 'true');
    })
    .on('focus.aiWorkspace input.aiWorkspace', '#ai-workspace-lorebook-search', () => {
      debouncedRenderLorebookSearchResults();
    })
    .on('blur.aiWorkspace', '#ai-workspace-lorebook-search', () => {
      setTimeout(() => hideLorebookSearchResults(), 200);
    })
    .on('mousedown.aiWorkspace', '#ai-workspace-lorebook-search-results .add-worldbook-result-item', event => {
      event.preventDefault();
    })
    .on('click.aiWorkspace', '#ai-workspace-lorebook-search-results .add-worldbook-result-item', async function () {
      const lorebookName = ($(this).attr('data-lorebook-name') || '').trim();
      syncCurrentLorebookDisplay(lorebookName);
      $('#ai-workspace-lorebook-search', parentDoc()).val('');
      hideLorebookSearchResults();
      persist();
      await loadEntriesCompat(lorebookName);
    })
    .on('click.aiWorkspace', '#ai-workspace-refresh-entries', async () => loadEntriesCompat(currentLorebook()))
    .on('input.aiWorkspace', '#ai-workspace-search', renderEntryList)
    .on('click.aiWorkspace', '#ai-workspace-select-visible', () => {
      filteredEntries().forEach(entry => state.selectedEntryUids.add(Number(entry.uid)));
      clearPreview('选择已变化，请重新生成预览。');
      renderEntryList();
      persist();
    })
    .on('click.aiWorkspace', '#ai-workspace-clear-selection', () => {
      state.selectedEntryUids.clear();
      clearPreview('选择已变化，请重新生成预览。');
      renderEntryList();
    })
    .on('change.aiWorkspace', '.ai-entry-checkbox', function () {
      const uid = Number($(this).attr('data-entry-uid'));
      if ($(this).prop('checked')) {
        state.selectedEntryUids.add(uid);
      } else {
        state.selectedEntryUids.delete(uid);
      }
      clearPreview('选择已变化，请重新生成预览。');
      renderSelectionSummary(filteredEntries());
      persist();
      persist();
    })
    .on(
      'change.aiWorkspace input.aiWorkspace',
      '#ai-workspace-apiurl, #ai-workspace-apikey, #ai-workspace-model, #ai-workspace-stream, #ai-workspace-field-title, #ai-workspace-field-content, #ai-workspace-field-prompt, #ai-workspace-instruction, #ai-workspace-jailbreak-prompt-template, #ai-workspace-builtin-prompt-template',
      () => {
        persist();
        clearPreview('配置已变化，请重新生成预览。');
      },
    )
    .on('change.aiWorkspace', '#ai-workspace-source-select', () => {
      toggleCustomApi();
      persist();
      clearPreview('配置已变化，请重新生成预览。');
    })
    .on('change.aiWorkspace', 'input[name="ai-workspace-api-mode"]', () => {
      toggleCustomApi();
      persist();
      clearPreview('API 选择已变化，请重新生成预览。');
    })
    .on('click.aiWorkspace', '#ai-workspace-load-models', event => {
      event.preventDefault();
      event.stopPropagation();
      void handleLoadModels();
    })
    .on('click.aiWorkspace', '#ai-workspace-plan', async () => handlePlan())
    .on('click.aiWorkspace', '#ai-workspace-preview', async () => handlePreview())
    .on('click.aiWorkspace', '#ai-workspace-stop', () => handleStop())
    .on('click.aiWorkspace', '#ai-workspace-apply', async () => handleApply())
    .on('click.aiWorkspace', '#ai-workspace-preview-list .ai-preview-item', function () {
      const uid = Number($(this).attr('data-preview-uid'));
      openPreviewModal(uid);
    })
    .on('click.aiWorkspace', '#ai-workspace-preview-modal-close-button, #ai-workspace-preview-modal .ai-preview-modal-close', () => {
      closePreviewModal();
    })
    .on('keydown.aiWorkspace', '#ai-workspace-preview-modal .ai-preview-modal-close', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      closePreviewModal();
    })
    .on('click.aiWorkspace', '#ai-workspace-preview-modal', function (event) {
      if (event.target === this) {
        closePreviewModal();
      }
    })
    .on('click.aiWorkspace', event => {
      if (!$(event.target).closest('.ai-worldbook-adder').length) {
        hideLorebookSearchResults();
      }
    });
}

function renderSelectionSummary(filteredEntries) {
  $('#ai-workspace-selection-summary', parentDoc()).text(
    `可修改 ${state.selectedEntryUids.size} 条，只读 ${state.readonlyEntryUids.size} 条，可见 ${filteredEntries.length} 条，总计 ${state.entries.length} 条`,
  );
}

function getEntryMode(uid) {
  if (state.selectedEntryUids.has(uid)) return 'editable';
  if (state.readonlyEntryUids.has(uid)) return 'readonly';
  return 'none';
}

function setEntryMode(uid, mode) {
  state.selectedEntryUids.delete(uid);
  state.readonlyEntryUids.delete(uid);
  if (mode === 'editable') {
    state.selectedEntryUids.add(uid);
  } else if (mode === 'readonly') {
    state.readonlyEntryUids.add(uid);
  }
}

function renderEntryList() {
  const $list = $('#ai-workspace-entry-list', parentDoc());
  const entries = filteredEntries();
  $list.empty();

  if (!entries.length) {
    $list.append('<div class="ai-empty">没有匹配的条目。</div>');
    renderSelectionSummary(entries);
    return;
  }

  entries.forEach(entry => {
    const uid = Number(entry.uid);
    const mode = getEntryMode(uid);
    const snippet = (entry.content || '').replace(/\s+/g, ' ').trim();
    $list.append(`
      <div class="ai-entry-item">
        <select class="ai-entry-mode" data-entry-uid="${uid}">
          <option value="none" ${mode === 'none' ? 'selected' : ''}>不参与</option>
          <option value="editable" ${mode === 'editable' ? 'selected' : ''}>本批可修改</option>
          <option value="readonly" ${mode === 'readonly' ? 'selected' : ''}>只读参考</option>
        </select>
        <div class="ai-entry-main">
          <div class="ai-entry-item-title">${_.escape(entry.name || `UID ${entry.uid}`)}</div>
          <div class="ai-entry-item-meta">UID: ${uid}</div>
          <div class="ai-entry-item-snippet">${_.escape(snippet.slice(0, 180) || '无内容摘要')}</div>
        </div>
      </div>
    `);
  });

  renderSelectionSummary(entries);
}

function markVisibleEntries(mode) {
  filteredEntries().forEach(entry => setEntryMode(Number(entry.uid), mode));
  clearPreview('选择已变化，请重新生成预览。');
  renderEntryList();
}

async function loadEntries(lorebookName) {
  state.entries = [];
  state.selectedEntryUids = new Set();
  state.readonlyEntryUids = new Set();
  state.planningResult = null;
  state.loadedLorebookName = lorebookName || '';
  clearPreview();
  renderPlanningResult(null);

  if (!lorebookName) {
    renderEntryList();
    setStatus('请先选择目标世界书。');
    return;
  }

  setStatus(`正在加载世界书“${lorebookName}”的条目...`);
  const entries = await collectAiTargetEntries(lorebookName, []);
  state.entries = entries.map(entry => ({ uid: Number(entry.uid), name: entry.name || '', content: entry.content || '' }));
  renderEntryList();
  setStatus(`已加载 ${state.entries.length} 条可处理条目。`);
}

function markVisibleEntriesCompat(mode) {
  filteredEntries().forEach(entry => setEntryMode(Number(entry.uid), mode));
  clearPreview('选择已变化，请重新生成预览。');
  renderEntryList();
  persist();
}

async function loadEntriesCompat(lorebookName, options = {}) {
  const { preserveSelection = false, preserveOutputs = false } = options;

  state.entries = [];
  if (!preserveSelection) {
    state.selectedEntryUids = new Set();
    state.readonlyEntryUids = new Set();
  }
  if (!preserveOutputs) {
    state.planningResult = null;
    state.previewResult = null;
    clearPreview();
    renderPlanningResult(null);
  }
  state.loadedLorebookName = lorebookName || '';

  if (!lorebookName) {
    renderEntryList();
    setStatus('请先选择目标世界书。');
    persist();
    return;
  }

  setStatus(`正在加载世界书“${lorebookName}”的条目...`);
  const entries = await collectAiTargetEntries(lorebookName, []);
  state.entries = entries.map(entry => ({ uid: Number(entry.uid), name: entry.name || '', content: entry.content || '' }));

  const validUidSet = new Set(state.entries.map(entry => Number(entry.uid)));
  state.selectedEntryUids = new Set(Array.from(state.selectedEntryUids).filter(uid => validUidSet.has(Number(uid))));
  state.readonlyEntryUids = new Set(Array.from(state.readonlyEntryUids).filter(uid => validUidSet.has(Number(uid))));

  renderEntryList();
  if (preserveOutputs) {
    renderPlanningResult(state.planningResult);
    if (state.previewResult) {
      renderPreview(state.previewResult);
    } else {
      renderDebugInfo();
    }
  }
  setStatus(`已加载 ${state.entries.length} 条可处理条目。`);
  persist();
}

async function handlePlan() {
  persist();
  const lorebookName = currentLorebook();
  const instruction = instructionValue();
  const saved = settings();
  const runId = ++state.previewRunId;

  if (!lorebookName) return setStatus('请先选择目标世界书。');
  if (!instruction) return setStatus('请输入 AI 指令。');
  if (hasManualSelection()) {
    return setStatus('已有手动选择。若要自动生成改造方案，请先清空选择。');
  }
  if (saved.apiMode === 'custom') {
    const validationMessage = validateCustomApiConfig(saved.customApi, { requireModel: true });
    if (validationMessage) {
      return setStatus(validationMessage);
    }
  }

  state.stopRequested = false;
  setGeneratingState(true);
  renderPlanningResult(null);
  setStatus('正在生成改造方案...');

  try {
    const planningResult = await generateAiPlan({
      lorebookName,
      instruction,
      promptSettings: saved.promptSettings,
      customApi: saved.apiMode === 'custom' ? saved.customApi : null,
      shouldStream: saved.stream === true,
      onGenerationStart: generationId => {
        if (runId === state.previewRunId) {
          state.activeGenerationId = generationId;
        }
      },
    });

    if (runId !== state.previewRunId) {
      return;
    }

    renderPlanningResult(planningResult);
    state.selectedEntryUids = new Set(planningResult.editable_uids || []);
    state.readonlyEntryUids = new Set(planningResult.readonly_uids || []);
    renderEntryList();
    setStatus('改造方案生成完成，已自动填入条目分组。');
  } catch (error) {
    if (runId !== state.previewRunId) {
      return;
    }
    renderPlanningResult(null);
    setStatus(error?.message || '生成改造方案失败。');
  } finally {
    if (runId === state.previewRunId) {
      state.stopRequested = false;
      setGeneratingState(false);
    }
  }
}

async function handlePreview() {
  persist();
  const lorebookName = currentLorebook();
  const instruction = instructionValue();
  const entryUids = Array.from(state.selectedEntryUids);
  const readonlyEntryUids = Array.from(state.readonlyEntryUids);
  const saved = settings();
  const runId = ++state.previewRunId;

  if (!lorebookName) return setStatus('请先选择目标世界书。');
  if (!entryUids.length) return setStatus('请至少选择一个“本批可修改”条目。');
  if (!instruction) return setStatus('请输入 AI 指令。');
  if (saved.apiMode === 'custom') {
    const validationMessage = validateCustomApiConfig(saved.customApi, { requireModel: true });
    if (validationMessage) {
      return setStatus(validationMessage);
    }
  }

  state.stopRequested = false;
  $('#ai-workspace-apply', parentDoc()).prop('disabled', true);
  setGeneratingState(true);
  clearPreview('正在生成预览...');

  try {
    const previewResult = await generateAiPreview({
      lorebookName,
      entryUids,
      readonlyEntryUids,
      planningResult: state.planningResult,
      instruction,
      fieldOptions: saved.editableFields,
      promptSettings: saved.promptSettings,
      customApi: saved.apiMode === 'custom' ? saved.customApi : null,
      shouldStream: saved.stream === true,
      onGenerationStart: generationId => {
        if (runId === state.previewRunId) {
          state.activeGenerationId = generationId;
        }
      },
      shouldStop: () => state.stopRequested === true,
      onProgress: progress => {
        if (runId !== state.previewRunId) return;
        const title = progress?.title ? `${progress.title}：` : '';
        setStatus(`${title}成功 ${progress.succeeded} 条，失败 ${progress.failed} 条`);
      },
    });

    if (runId !== state.previewRunId) {
      return;
    }

    state.previewResult = previewResult;
    renderPreview(previewResult);
    setStatus(getPreviewStatusText(previewResult));
  } catch (error) {
    if (runId !== state.previewRunId) {
      return;
    }

    const message = error?.message || '生成预览失败。';
    clearPreview(message);
    renderDebugInfo({ errorDetails: error?.stack || message });
    setStatus(message);
  } finally {
    if (runId === state.previewRunId) {
      state.stopRequested = false;
      setGeneratingState(false);
    }
  }
}

function bindEvents() {
  $(parentDoc())
    .off('.aiWorkspace')
    .on('click.aiWorkspace', `#${ROOT_ID} .ai-drawer-summary`, function (event) {
      event.preventDefault();
      event.stopPropagation();
      const $drawer = $(this).closest('.ai-drawer');
      setDrawerExpanded($drawer, $drawer.attr('data-expanded') !== 'true');
    })
    .on('keydown.aiWorkspace', `#${ROOT_ID} .ai-drawer-summary`, function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      const $drawer = $(this).closest('.ai-drawer');
      setDrawerExpanded($drawer, $drawer.attr('data-expanded') !== 'true');
    })
    .on('focus.aiWorkspace input.aiWorkspace', '#ai-workspace-lorebook-search', () => {
      debouncedRenderLorebookSearchResults();
    })
    .on('blur.aiWorkspace', '#ai-workspace-lorebook-search', () => {
      setTimeout(() => hideLorebookSearchResults(), 200);
    })
    .on('mousedown.aiWorkspace', '#ai-workspace-lorebook-search-results .add-worldbook-result-item', event => {
      event.preventDefault();
    })
    .on('click.aiWorkspace', '#ai-workspace-lorebook-search-results .add-worldbook-result-item', async function () {
      const lorebookName = ($(this).attr('data-lorebook-name') || '').trim();
      syncCurrentLorebookDisplay(lorebookName);
      $('#ai-workspace-lorebook-search', parentDoc()).val('');
      hideLorebookSearchResults();
      persist();
      await loadEntriesCompat(lorebookName);
    })
    .on('click.aiWorkspace', '#ai-workspace-refresh-entries', async () => loadEntriesCompat(currentLorebook()))
    .on('input.aiWorkspace', '#ai-workspace-search', renderEntryList)
    .on('click.aiWorkspace', '#ai-workspace-select-visible', () => markVisibleEntriesCompat('editable'))
    .on('click.aiWorkspace', '#ai-workspace-mark-visible-readonly', () => markVisibleEntriesCompat('readonly'))
    .on('click.aiWorkspace', '#ai-workspace-clear-selection', () => {
      state.selectedEntryUids.clear();
      state.readonlyEntryUids.clear();
      clearPreview('选择已变化，请重新生成预览。');
      renderEntryList();
      persist();
    })
    .on('change.aiWorkspace', '.ai-entry-mode', function () {
      const uid = Number($(this).attr('data-entry-uid'));
      setEntryMode(uid, ($(this).val() || 'none').trim());
      clearPreview('选择已变化，请重新生成预览。');
      renderSelectionSummary(filteredEntries());
      persist();
    })
    .on(
      'change.aiWorkspace input.aiWorkspace',
      '#ai-workspace-apiurl, #ai-workspace-apikey, #ai-workspace-model, #ai-workspace-stream, #ai-workspace-field-title, #ai-workspace-field-content, #ai-workspace-field-prompt, #ai-workspace-instruction, #ai-workspace-jailbreak-prompt-template, #ai-workspace-builtin-prompt-template',
      () => {
        persist();
        clearPreview('配置已变化，请重新生成预览。');
      },
    )
    .on('change.aiWorkspace', '#ai-workspace-source-select', () => {
      toggleCustomApi();
      persist();
      clearPreview('配置已变化，请重新生成预览。');
    })
    .on('change.aiWorkspace', 'input[name="ai-workspace-api-mode"]', () => {
      toggleCustomApi();
      persist();
      clearPreview('API 选择已变化，请重新生成预览。');
    })
    .on('click.aiWorkspace', '#ai-workspace-load-models', event => {
      event.preventDefault();
      event.stopPropagation();
      void handleLoadModels();
    })
    .on('click.aiWorkspace', '#ai-workspace-plan', async () => handlePlan())
    .on('click.aiWorkspace', '#ai-workspace-preview', async () => handlePreview())
    .on('click.aiWorkspace', '#ai-workspace-stop', () => handleStop())
    .on('click.aiWorkspace', '#ai-workspace-apply', async () => handleApply())
    .on('click.aiWorkspace', event => {
      if (!$(event.target).closest('.ai-worldbook-adder').length) {
        hideLorebookSearchResults();
      }
    });
}

export function initAiWorkspace() {
  if (isDesktopAiWorkspace()) {
    initDesktopAiWorkspace();
    return;
  }

  ensureStyles();
  ensureMarkup();
  syncDrawerBodies();
  setGeneratingState(false);
  if (state.initialized) return;
  bindEvents();
  state.initialized = true;
}

export function resetAiWorkspace() {
  if (isDesktopAiWorkspace()) {
    resetDesktopAiWorkspace();
    return;
  }

  state.entries = [];
  state.worldbookNames = [];
  state.selectedEntryUids = new Set();
  state.readonlyEntryUids = new Set();
  state.planningResult = null;
  state.previewResult = null;
  state.modelOptions = [];
  state.statusText = '';
  state.modelStatusText = '';
  state.loadedLorebookName = '';
  state.isGenerating = false;
  state.activeGenerationId = '';
  state.stopRequested = false;
  state.previewRunId += 1;
  state.formHydrated = false;

  if (!root().length) {
    return;
  }

  $('#ai-workspace-instruction', parentDoc()).val('');
  $('#ai-workspace-search', parentDoc()).val('');
  $('#ai-workspace-lorebook-search', parentDoc()).val('');
  syncCurrentLorebookDisplay('');
  hideLorebookSearchResults();
  clearPreview();
  renderPlanningResult(null);
  renderEntryList();
  renderDebugInfo();
  setStatus('');
  setModelStatus('');
  setGeneratingState(false);
}

export const refreshAiWorkspace = errorCatched(async () => {
  if (isDesktopAiWorkspace()) {
    return refreshDesktopAiWorkspace();
  }

  ensureMarkup();
  syncDrawerBodies();
  const saved = settings();
  hydrateWorkspaceState(saved, saved.lorebookName || currentLorebook());

  if (!state.formHydrated) {
    syncForm();
    state.formHydrated = true;
  } else {
    toggleCustomApi();
  }

  const previousLorebook = currentLorebook();
  const lorebookName = await populateLorebooks();
  syncCurrentLorebookDisplay(lorebookName);

  const shouldReloadEntries = !state.entries.length || state.loadedLorebookName !== lorebookName || previousLorebook !== lorebookName;
  if (shouldReloadEntries) {
    await loadEntriesCompat(lorebookName, { preserveSelection: true, preserveOutputs: true });
    return;
  }

  restoreUiState();
}, 'refreshAiWorkspace');
