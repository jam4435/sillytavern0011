import { appendToThemePortal } from './themeSurface.js';

const AI_ACTION_MODAL_ID = 'lorebook-ai-action-modal';

function getModal(parentDoc = window.parent.document) {
  return $(`#${AI_ACTION_MODAL_ID}`, parentDoc);
}

function buildDiffHtml(diff) {
  return `
    <div class="ai-preview-diff">
      <div class="ai-preview-diff-label">${_.escape(diff.label)}</div>
      <div class="ai-preview-diff-before">当前: ${_.escape(JSON.stringify(diff.before))}</div>
      <div class="ai-preview-diff-after">预览: ${_.escape(JSON.stringify(diff.after))}</div>
    </div>
  `;
}

export function initAiActionDialog() {
  const parentDoc = window.parent.document;

  if ($('#enhanced-ai-action-dialog-styles', parentDoc).length === 0) {
    const styles = `
      <style id="enhanced-ai-action-dialog-styles">
        #${AI_ACTION_MODAL_ID} {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 10008;
          background-color: rgba(0, 0, 0, 0.72);
          overflow-y: auto;
          box-sizing: border-box;
        }
        #${AI_ACTION_MODAL_ID} .ai-action-dialog {
          width: min(920px, calc(100vw - 32px));
          margin: 40px auto;
          background: var(--panel-bg-color, #242424);
          color: var(--panel-text-color, #eee);
          border: 1px solid var(--panel-border-color, #4c4c4c);
          border-radius: 12px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
          overflow: hidden;
        }
        #${AI_ACTION_MODAL_ID} .ai-action-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          background: var(--panel-accent-color, #2f5d73);
          color: var(--panel-accent-text-color, #fff);
        }
        #${AI_ACTION_MODAL_ID} .ai-action-header h4 {
          margin: 0;
          font-size: 16px;
        }
        #${AI_ACTION_MODAL_ID} .close-button {
          background: transparent;
          border: 0;
          color: var(--panel-accent-text-color, #fff);
          font-size: 24px;
          cursor: pointer;
        }
        #${AI_ACTION_MODAL_ID} .ai-action-body {
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        #${AI_ACTION_MODAL_ID} .ai-action-targets,
        #${AI_ACTION_MODAL_ID} .ai-action-status,
        #${AI_ACTION_MODAL_ID} .ai-action-errors,
        #${AI_ACTION_MODAL_ID} .ai-action-preview {
          background: var(--panel-surface-muted-color, #2e2e2e);
          border: 1px solid var(--panel-border-color, #424242);
          border-radius: 8px;
          padding: 12px 14px;
        }
        #${AI_ACTION_MODAL_ID} .ai-action-status {
          color: var(--panel-muted-text-color, #d8e8f0);
          min-height: 20px;
        }
        #${AI_ACTION_MODAL_ID} .ai-action-errors {
          display: none;
          color: var(--panel-danger-color, #ffb4b4);
        }
        #${AI_ACTION_MODAL_ID} .ai-action-errors.has-errors {
          display: block;
        }
        #${AI_ACTION_MODAL_ID} .ai-action-instruction textarea {
          width: 100%;
          min-height: 120px;
          resize: vertical;
          box-sizing: border-box;
          background: var(--panel-input-bg-color, #1f1f1f);
          color: var(--panel-text-color, #f1f1f1);
          border: 1px solid var(--panel-border-color, #484848);
          border-radius: 8px;
          padding: 12px;
          line-height: 1.55;
        }
        #${AI_ACTION_MODAL_ID} .ai-action-preview {
          display: none;
        }
        #${AI_ACTION_MODAL_ID} .ai-action-preview.has-preview {
          display: block;
        }
        #${AI_ACTION_MODAL_ID} .ai-preview-item + .ai-preview-item {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--panel-border-color, #3f3f3f);
        }
        #${AI_ACTION_MODAL_ID} .ai-preview-item-title {
          font-weight: 600;
          margin-bottom: 8px;
        }
        #${AI_ACTION_MODAL_ID} .ai-preview-diff + .ai-preview-diff {
          margin-top: 8px;
        }
        #${AI_ACTION_MODAL_ID} .ai-preview-diff-label {
          color: var(--panel-accent-color, #a8d6ea);
          margin-bottom: 2px;
        }
        #${AI_ACTION_MODAL_ID} .ai-preview-diff-before,
        #${AI_ACTION_MODAL_ID} .ai-preview-diff-after {
          font-size: 13px;
          line-height: 1.45;
        }
        #${AI_ACTION_MODAL_ID} .ai-preview-diff-before {
          color: var(--panel-muted-text-color, #bfbfbf);
        }
        #${AI_ACTION_MODAL_ID} .ai-preview-diff-after {
          color: var(--panel-warning-color, #f7e39b);
        }
        #${AI_ACTION_MODAL_ID} .ai-action-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 16px 18px;
          border-top: 1px solid var(--panel-border-color, #3f3f3f);
          background: var(--panel-surface-raised-color, #262626);
        }
        #${AI_ACTION_MODAL_ID} .ai-action-footer button {
          padding: 9px 14px;
          border-radius: 8px;
          border: 0;
          cursor: pointer;
        }
        #${AI_ACTION_MODAL_ID} .ai-action-cancel {
          background: var(--panel-surface-muted-color, #555);
          color: var(--panel-text-color, #fff);
        }
        #${AI_ACTION_MODAL_ID} .ai-action-primary {
          background: var(--panel-success-color, #3f7a56);
          color: var(--panel-accent-text-color, #fff);
        }
        #${AI_ACTION_MODAL_ID} .ai-action-primary[disabled] {
          opacity: 0.6;
          cursor: not-allowed;
        }
      </style>
    `;

    $('head', parentDoc).append(styles);
  }

  if (getModal(parentDoc).length > 0) {
    return;
  }

  const modalHtml = `
    <div id="${AI_ACTION_MODAL_ID}" class="lorebook-themed-modal">
      <div class="ai-action-dialog lorebook-themed-modal-content">
        <div class="ai-action-header lorebook-themed-modal-header">
          <h4>AI 条目改写</h4>
          <button class="close-button" type="button">&times;</button>
        </div>
        <div class="ai-action-body lorebook-themed-modal-body">
          <div class="ai-action-targets"></div>
          <div class="ai-action-instruction">
            <textarea placeholder="输入你的改写要求，例如：压缩内容长度、补充触发关键字、改成更正式的条目风格。"></textarea>
          </div>
          <div class="ai-action-status"></div>
          <div class="ai-action-errors"></div>
          <div class="ai-action-preview">
            <div class="ai-action-preview-summary"></div>
            <div class="ai-action-preview-list"></div>
          </div>
        </div>
        <div class="ai-action-footer lorebook-themed-modal-footer">
          <button class="ai-action-cancel lorebook-themed-modal-button secondary" type="button">取消</button>
          <button class="ai-action-primary lorebook-themed-modal-button primary" type="button" data-action="ai-preview-apply" data-phase="preview">生成预览</button>
        </div>
      </div>
    </div>
  `;

  appendToThemePortal(modalHtml, parentDoc);

  let $modal = getModal(parentDoc);
  if (!$modal.length) {
    initAiActionDialog();
    $modal = getModal(parentDoc);
  }
  const closeModal = () => $modal.hide();

  $modal.on('click', '.close-button, .ai-action-cancel', closeModal);
  $modal.on('click', event => {
    if (event.target.id === AI_ACTION_MODAL_ID) {
      closeModal();
    }
  });
}

export function openAiActionDialog(dialogContext) {
  const parentDoc = window.parent.document;
  const $modal = getModal(parentDoc);
  if (!$modal.length) {
    throw new Error('AI 弹窗尚未初始化');
  }

  const targetCount = dialogContext?.entryUids?.length || 0;
  const modeLabel = targetCount > 1 ? `批量改写 ${targetCount} 个条目` : '改写当前条目';

  $modal.data('ai-context', _.cloneDeep({ ...dialogContext, previewResult: null }));
  $modal.find('.ai-action-targets').text(`目标世界书：${dialogContext.lorebookName} | 模式：${modeLabel}`);
  $modal.find('.ai-action-instruction textarea').val(dialogContext.instruction || '');
  $modal.find('.ai-action-status').text('输入指令后点击“生成预览”。');
  $modal.find('.ai-action-errors').removeClass('has-errors').empty();
  $modal.find('.ai-action-preview').removeClass('has-preview');
  $modal.find('.ai-action-preview-summary').empty();
  $modal.find('.ai-action-preview-list').empty();
  $modal.find('.ai-action-primary').text('生成预览').attr('data-phase', 'preview').prop('disabled', false);
  $modal.show();
}

export function closeAiActionDialog() {
  getModal().hide();
}

export function getAiActionDialogState() {
  const state = getModal().data('ai-context');
  return state ? _.cloneDeep(state) : null;
}

export function updateAiActionDialogState(nextState) {
  const $modal = getModal();
  $modal.data('ai-context', _.cloneDeep(nextState));
}

export function getAiInstruction() {
  return (getModal().find('.ai-action-instruction textarea').val() || '').trim();
}

export function setAiActionBusy(isBusy, buttonText = '') {
  const $modal = getModal();
  const $primary = $modal.find('.ai-action-primary');
  const $textarea = $modal.find('.ai-action-instruction textarea');

  $primary.prop('disabled', isBusy);
  $textarea.prop('disabled', isBusy);

  if (buttonText) {
    $primary.text(buttonText);
  }
}

export function setAiActionStatus(message) {
  getModal()
    .find('.ai-action-status')
    .text(message || '');
}

export function renderAiActionPreview(previewResult) {
  const $modal = getModal();
  const $preview = $modal.find('.ai-action-preview');
  const $summary = $modal.find('.ai-action-preview-summary');
  const $list = $modal.find('.ai-action-preview-list');
  const $errors = $modal.find('.ai-action-errors');
  const errors = Array.isArray(previewResult?.errors) ? previewResult.errors : [];

  const summary = previewResult?.summary || {
    total: 0,
    succeeded: 0,
    failed: 0,
    changed: 0,
    unchanged: 0,
  };

  $summary.html(
    `总计 ${summary.total} 条，成功生成 ${summary.succeeded} 条，失败 ${summary.failed} 条，` +
      `有变更 ${summary.changed} 条，无变更 ${summary.unchanged} 条。`,
  );

  $list.empty();
  (previewResult?.items || []).forEach(item => {
    const diffHtml =
      item.diffs.length > 0
        ? item.diffs.map(diff => buildDiffHtml(diff)).join('')
        : '<div class="ai-preview-diff-after">AI 结果与当前内容一致，没有可应用变更。</div>';

    $list.append(`
      <div class="ai-preview-item">
        <div class="ai-preview-item-title">${_.escape(item.title)} (UID: ${item.uid})</div>
        ${diffHtml}
      </div>
    `);
  });

  if (errors.length > 0) {
    $errors
      .addClass('has-errors')
      .html(errors.map(error => `<div>${_.escape(error.title)}: ${_.escape(error.error)}</div>`).join(''));
  } else {
    $errors.removeClass('has-errors').empty();
  }

  $preview.addClass('has-preview');
  $modal.find('.ai-action-primary').text('应用预览').attr('data-phase', 'apply').prop('disabled', false);
}
