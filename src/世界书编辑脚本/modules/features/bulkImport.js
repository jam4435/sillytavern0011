import { createLorebookEntries, getWorldbookSafe } from '../api.js';
import { errorCatched } from '../utils.js';
import { appendToThemePortal } from '../ui/themeSurface.js';
import { parseWorldbookYaml, yamlDocumentToWorldbookEntry } from './worldbookYaml.js';

const IMPORT_MODAL_ID = 'lorebook-import-modal';

export function buildBulkImportEntries(yamlText, existingEntries = []) {
  const documents = parseWorldbookYaml(yamlText);
  const maxUid = Math.max(
    0,
    ...existingEntries.map(entry => (typeof entry.uid === 'number' ? entry.uid : Number.parseInt(entry.uid, 10) || 0)),
  );
  return documents.map((document, index) => yamlDocumentToWorldbookEntry(document, { uid: maxUid + index + 1 }));
}

export async function importWorldbookYaml(lorebookName, yamlText) {
  const existingEntriesResult = await getWorldbookSafe(lorebookName);
  if (!existingEntriesResult.success) {
    throw existingEntriesResult.error || new Error(`无法读取世界书“${lorebookName}”。`);
  }
  const entriesToCreate = buildBulkImportEntries(yamlText, existingEntriesResult.data);
  const result = await createLorebookEntries(lorebookName, entriesToCreate, {
    trackHistory: true,
    transactionType: 'bulk-import',
    transactionMeta: {
      importedCount: entriesToCreate.length,
    },
  });
  if (!result.success) {
    throw result.error || new Error('导入失败');
  }
  return {
    success: true,
    entryUids: entriesToCreate.map(entry => entry.uid),
    entries: entriesToCreate,
  };
}

export const handleBulkImport = errorCatched(async (lorebookName, isGlobal) => {
  const parentDoc = window.parent.document;
  const $modal = $(`#${IMPORT_MODAL_ID}`, parentDoc);
  const $confirmBtn = $modal.find(`#${IMPORT_MODAL_ID}-confirm`);
  const $errorDisplay = $modal.find(`#${IMPORT_MODAL_ID}-error`);
  const yamlText = $modal.find(`#${IMPORT_MODAL_ID}-textarea`).val();

  if (!yamlText.trim()) {
    $errorDisplay.text('错误：输入内容不能为空。').show();
    return false;
  }

  $confirmBtn.text('处理中...').prop('disabled', true);
  $errorDisplay.hide();

  try {
    const result = await importWorldbookYaml(lorebookName, yamlText);
    alert(`成功导入 ${result.entryUids.length} 个条目到 "${lorebookName}"！`);
    $modal.hide();
    return result;
  } catch (error) {
    console.error('角色世界书: 批量导入失败', error);
    $errorDisplay.text(`导入失败: ${error.message}`).show();
    return {
      success: false,
      entryUids: [],
      error,
    };
  } finally {
    $confirmBtn.text('确认导入').prop('disabled', false);
  }
}, 'handleBulkImport');

// 【重构】批量导入模块
export function initBulkImport() {
  const parentDoc = window.parent.document;

  if ($('#enhanced-lorebook-import-styles', parentDoc).length === 0) {
    const importStyles = `
            <style id="enhanced-lorebook-import-styles">
                #${IMPORT_MODAL_ID} {
                    display: none;
                    position: fixed;
                    z-index: 10001;
                    left: 0;
                    top: 0;
                    width: 100vw;
                    height: 100vh;
                    overflow-y: auto;
                    background-color: rgba(0,0,0,0.75);
                    backdrop-filter: blur(4px);
                    box-sizing: border-box;
                }
                #${IMPORT_MODAL_ID}-content {
                    background: var(--panel-bg-color);
                    color: var(--panel-text-color);
                    padding: 0;
                    border: 1px solid var(--panel-border-color);
                    width: 95%;
                    max-width: 700px;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                    max-height: calc(100vh - 100px);
                    display: flex;
                    flex-direction: column;
                    margin: 50px auto;
                    box-sizing: border-box;
                }
                #${IMPORT_MODAL_ID}-header {
                    padding: 15px 20px;
                    background: var(--panel-accent-color);
                    color: var(--panel-accent-text-color);
                    border-top-left-radius: 12px;
                    border-top-right-radius: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                }
                #${IMPORT_MODAL_ID}-header h4 {
                    margin: 0;
                    font-size: 1.1em;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: inherit;
                }
                #${IMPORT_MODAL_ID}-header h4::before {
                    content: "📝";
                    font-size: 1.2em;
                }
                #${IMPORT_MODAL_ID} .close-button {
                    color: inherit;
                    font-size: 24px;
                    font-weight: bold;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: all 0.2s ease;
                    background-color: rgba(255,255,255,0.1);
                }
                #${IMPORT_MODAL_ID} .close-button:hover {
                    background-color: rgba(255,255,255,0.2);
                    transform: rotate(90deg);
                }
                #${IMPORT_MODAL_ID}-body {
                    padding: 20px;
                    flex-grow: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    overflow-y: auto;
                }
                #${IMPORT_MODAL_ID}-body > p {
                    margin: 0;
                    font-size: 0.95em;
                    color: var(--panel-muted-text-color);
                    opacity: 0.8;
                    padding: 10px;
                    background-color: var(--panel-entry-bg-color);
                    border-left: 3px solid var(--panel-accent-color);
                    border-radius: 4px;
                    line-height: 1.5;
                }
                #${IMPORT_MODAL_ID}-textarea {
                    width: 100%;
                    min-height: 300px;
                    flex-grow: 1;
                    background-color: var(--yaml-input-bg-color);
                    color: var(--panel-text-color);
                    border: 2px solid var(--panel-border-color);
                    border-radius: 8px;
                    resize: vertical;
                    box-sizing: border-box;
                    padding: 12px;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    font-size: 0.9em;
                    line-height: 1.6;
                    transition: all 0.2s ease;
                }
                #${IMPORT_MODAL_ID}-textarea:focus {
                    outline: none;
                    border-color: var(--panel-accent-color);
                    background-color: var(--panel-input-focus-bg-color);
                    box-shadow: var(--panel-focus-ring);
                }
                #${IMPORT_MODAL_ID}-textarea::placeholder {
                    color: var(--panel-muted-text-color);
                    opacity: 0.4;
                }
                #${IMPORT_MODAL_ID}-footer {
                    padding: 15px 20px;
                    text-align: right;
                    border-top: 1px solid var(--panel-border-color);
                    background-color: var(--panel-entry-bg-color);
                    border-bottom-left-radius: 12px;
                    border-bottom-right-radius: 12px;
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }
                #${IMPORT_MODAL_ID}-footer button {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.95em;
                    font-weight: 500;
                    transition: all 0.2s ease;
                }
                #${IMPORT_MODAL_ID}-cancel {
                    background-color: var(--panel-entry-bg-color);
                    color: var(--panel-text-color);
                }
                #${IMPORT_MODAL_ID}-cancel:hover {
                    filter: brightness(1.2);
                    transform: translateY(-1px);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                }
                #${IMPORT_MODAL_ID}-confirm {
                    background: var(--panel-accent-color);
                    color: var(--panel-accent-text-color);
                }
                #${IMPORT_MODAL_ID}-confirm:hover:not(:disabled) {
                    filter: brightness(1.15);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px color-mix(in srgb, var(--panel-accent-color, #5a3a8e) 40%, transparent);
                }
                #${IMPORT_MODAL_ID}-confirm:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                #${IMPORT_MODAL_ID}-error {
                    color: var(--panel-danger-color);
                    font-size: 0.9em;
                    padding: 10px 12px;
                    background-color: var(--panel-danger-bg-color);
                    border: 1px solid var(--panel-danger-color);
                    border-radius: 6px;
                    display: none;
                    margin-top: 8px;
                }
                #${IMPORT_MODAL_ID}-error::before {
                    content: "⚠️ ";
                }
                /* 示例代码块样式 */
                .yaml-example-container {
                    margin-bottom: 12px;
                }
                .yaml-example-toggle {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    background-color: var(--panel-entry-bg-color);
                    border: 1px solid var(--panel-border-color);
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    color: var(--panel-muted-text-color);
                    font-size: 0.9em;
                }
                .yaml-example-toggle:hover {
                    background-color: var(--panel-surface-raised-color);
                    border-color: var(--panel-accent-color);
                }
                .yaml-example-toggle .toggle-icon {
                    transition: transform 0.2s ease;
                    font-size: 0.8em;
                }
                .yaml-example-toggle.expanded .toggle-icon {
                    transform: rotate(180deg);
                }
                .yaml-example-code {
                    display: none;
                    margin-top: 8px;
                    position: relative;
                }
                .yaml-example-code.show {
                    display: block;
                }
                .yaml-example-code pre {
                    margin: 0;
                    padding: 12px;
                    background-color: var(--yaml-input-bg-color);
                    color: var(--panel-text-color);
                    border: 2px solid var(--panel-border-color);
                    border-radius: 6px;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    font-size: 0.85em;
                    line-height: 1.6;
                    overflow-x: auto;
                    white-space: pre;
                }
                .yaml-copy-btn {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    padding: 6px 12px;
                    background: var(--panel-accent-color);
                    color: var(--panel-accent-text-color);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.8em;
                    transition: all 0.2s ease;
                    opacity: 0.9;
                }
                .yaml-copy-btn:hover {
                    opacity: 1;
                    filter: brightness(1.15);
                }
                .yaml-copy-btn.copied {
                    background: var(--panel-success-color);
                }
            </style>
        `;
    $('head', parentDoc).append(importStyles);
  }

  if ($(`#${IMPORT_MODAL_ID}`, parentDoc).length === 0) {
    const modalHtml = `
            <div id="${IMPORT_MODAL_ID}" class="lorebook-themed-modal" style="display: none;">
                <div id="${IMPORT_MODAL_ID}-content" class="lorebook-themed-modal-content">
                    <div id="${IMPORT_MODAL_ID}-header" class="lorebook-themed-modal-header">
                        <h4>批量导入条目</h4>
                        <span class="close-button">&times;</span>
                    </div>
                    <div id="${IMPORT_MODAL_ID}-body" class="lorebook-themed-modal-body">
                        <p>将YAML格式的条目文本粘贴到下方 (支持多个条目，用 --- 分隔):</p>
                        <div class="yaml-example-container">
                            <div class="yaml-example-toggle">
                                <span>📖 查看YAML示例格式</span>
                                <span class="toggle-icon">▼</span>
                            </div>
                            <div class="yaml-example-code">
                                <button class="yaml-copy-btn" title="复制示例代码">📋 复制</button>
                                <pre>---
trigger:
  Title: '示例条目'
  type: 'Normal'
  Comma_separated_list: '关键词1, 关键词2'
  position: 'After Character Definition'
  depth: 0
  order: 100
content: '这是条目的内容。'
enabled: true
probability: 100
---
trigger:
  Title: '第二个条目'
  type: 'Constant'
  position: 'Before Character Definition'
content: '这是第二个条目的内容。'</pre>
                            </div>
                        </div>
                        <textarea id="${IMPORT_MODAL_ID}-textarea" placeholder="在此粘贴YAML格式的条目..."></textarea>
                        <div id="${IMPORT_MODAL_ID}-error"></div>
                    </div>
                    <div id="${IMPORT_MODAL_ID}-footer" class="lorebook-themed-modal-footer">
                        <button id="${IMPORT_MODAL_ID}-cancel" class="lorebook-copy-cancel-btn lorebook-themed-modal-button secondary">取消</button>
                        <button id="${IMPORT_MODAL_ID}-confirm" class="lorebook-copy-confirm-btn lorebook-themed-modal-button primary">确认导入</button>
                    </div>
                </div>
            </div>
        `;
    appendToThemePortal(modalHtml, parentDoc);
  }

  const $modal = $(`#${IMPORT_MODAL_ID}`, parentDoc);
  $(parentDoc).on('click', `#${IMPORT_MODAL_ID} .close-button, #${IMPORT_MODAL_ID}-cancel`, () => {
    $modal.hide();
  });
  $modal.on('click', e => {
    if (e.target.id === IMPORT_MODAL_ID) $modal.hide();
  });

  // 示例代码折叠/展开功能
  $(parentDoc).on('click', '.yaml-example-toggle', function () {
    const $toggle = $(this);
    const $code = $toggle.siblings('.yaml-example-code');
    $toggle.toggleClass('expanded');
    $code.toggleClass('show');
  });

  // 复制示例代码功能
  $(parentDoc).on('click', '.yaml-copy-btn', function (e) {
    e.stopPropagation();
    const $btn = $(this);
    const codeText = $btn.siblings('pre').text();

    // 使用现代剪贴板API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(codeText)
        .then(() => {
          $btn.text('✅ 已复制').addClass('copied');
          setTimeout(() => {
            $btn.text('📋 复制').removeClass('copied');
          }, 2000);
        })
        .catch(err => {
          console.error('复制失败:', err);
          fallbackCopy(codeText, $btn);
        });
    } else {
      // 降级方案
      fallbackCopy(codeText, $btn);
    }
  });

  // 降级复制方案
  function fallbackCopy(text, $btn) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      $btn.text('✅ 已复制').addClass('copied');
      setTimeout(() => {
        $btn.text('📋 复制').removeClass('copied');
      }, 2000);
    } catch (err) {
      console.error('降级复制失败:', err);
      alert('复制失败，请手动复制');
    }
    document.body.removeChild(textarea);
  }
}
