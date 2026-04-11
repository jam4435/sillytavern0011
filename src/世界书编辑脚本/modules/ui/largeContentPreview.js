export const LARGE_CONTENT_PREVIEW_THRESHOLD = 30000;
export const LARGE_CONTENT_PREVIEW_SNIPPET_LENGTH = 200;

function normalizeLargeContentValue(value) {
  return typeof value === 'string' ? value : `${value ?? ''}`;
}

export function shouldPreviewLargeContent(value) {
  return normalizeLargeContentValue(value).length >= LARGE_CONTENT_PREVIEW_THRESHOLD;
}

export function buildLargeContentPreviewText(value) {
  const normalized = normalizeLargeContentValue(value);
  if (normalized.length <= LARGE_CONTENT_PREVIEW_SNIPPET_LENGTH) {
    return normalized.replace(/\r\n/g, '\n').trim();
  }

  const snippet = normalized.slice(0, LARGE_CONTENT_PREVIEW_SNIPPET_LENGTH).replace(/\r\n/g, '\n').trim();
  return `${snippet}\n\n……（内容过长，已折叠预览）`;
}

export function buildLargeContentPreviewCardHtml(
  value,
  { hint = '', actionsHtml = '' } = {},
) {
  const actions = [];
  if (hint) {
    actions.push(`<div class="large-content-preview-hint">${_.escape(hint)}</div>`);
  }
  if (actionsHtml) {
    actions.push(actionsHtml);
  }

  return `
    <div class="large-content-preview-card">
      <div class="large-content-preview-text">${_.escape(buildLargeContentPreviewText(value))}</div>
      ${
        actions.length
          ? `
        <div class="large-content-preview-actions">
          ${actions.join('')}
        </div>
      `
          : ''
      }
    </div>
  `;
}
