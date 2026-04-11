export const LARGE_CONTENT_PREVIEW_THRESHOLD = 30000;
export const LARGE_CONTENT_PREVIEW_SNIPPET_LENGTH = 200;
export const LARGE_CONTENT_TEXTAREA_SELECTOR = 'textarea[data-large-content-managed="true"]';

function normalizeLargeContentValue(value) {
  return typeof value === 'string' ? value : `${value ?? ''}`;
}

export function shouldPreviewLargeContent(value) {
  return normalizeLargeContentValue(value).length >= LARGE_CONTENT_PREVIEW_THRESHOLD;
}

export function buildLargeContentPreviewText(value) {
  const normalized = normalizeLargeContentValue(value).replace(/\r\n/g, '\n').trim();
  if (normalized.length <= LARGE_CONTENT_PREVIEW_SNIPPET_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, LARGE_CONTENT_PREVIEW_SNIPPET_LENGTH)}\n\n……（内容过长，已折叠预览）`;
}

export function clearDeferredLargeContentState($textarea) {
  if (!$textarea?.length) {
    return;
  }

  $textarea
    .removeData('largeContentDeferredValue')
    .removeAttr('data-large-content-deferred')
    .removeAttr('data-large-content-hydrated');
}

export function getManagedTextareaValue($textarea) {
  if (!$textarea?.length) {
    return '';
  }

  const deferredValue = $textarea.data('largeContentDeferredValue');
  if (typeof deferredValue === 'string') {
    return deferredValue;
  }

  return normalizeLargeContentValue($textarea.val());
}

export function syncManagedLargeContentPreview($textarea, expanded = false) {
  if (!$textarea?.length) {
    return;
  }

  const value = getManagedTextareaValue($textarea);
  const isLarge = shouldPreviewLargeContent(value);
  const $existingPreview = $textarea.siblings('.large-content-preview-card');

  if (!isLarge) {
    $textarea.removeAttr('data-large-content-preview').removeAttr('data-large-content-expanded').show();
    $existingPreview.remove();
    return;
  }

  if (expanded) {
    hydrateManagedTextarea($textarea);
    $textarea.attr('data-large-content-expanded', 'true').show();
    $existingPreview.remove();
    return;
  }

  const previewHtml = `
    <div class="large-content-preview-card">
      <div class="large-content-preview-text">${$('<div></div>').text(buildLargeContentPreviewText(value)).html()}</div>
      <div class="large-content-preview-actions">
        <button type="button" class="large-content-preview-open">展开正文</button>
      </div>
    </div>
  `;

  $existingPreview.remove();
  dehydrateManagedTextarea($textarea);
  $textarea.attr('data-large-content-preview', 'true').removeAttr('data-large-content-expanded').hide();
  $textarea.after(previewHtml);
}

export function setManagedTextareaContent($textarea, value, { deferLarge = true } = {}) {
  if (!$textarea?.length) {
    return '';
  }

  const normalized = normalizeLargeContentValue(value);
  $textarea.removeAttr('data-large-content-expanded').removeAttr('data-large-content-preview');

  if (deferLarge && shouldPreviewLargeContent(normalized)) {
    $textarea.data('largeContentDeferredValue', normalized);
    $textarea.attr('data-large-content-deferred', 'true').removeAttr('data-large-content-hydrated');
    $textarea.val('');
    return normalized;
  }

  clearDeferredLargeContentState($textarea);
  $textarea.val(normalized);
  return normalized;
}

export function syncManagedTextareaContent($textarea, value, options = {}) {
  const normalized = setManagedTextareaContent($textarea, value, options);
  if ($textarea?.length) {
    syncManagedLargeContentPreview($textarea, false);
  }
  return normalized;
}

export function hydrateManagedTextarea($textarea) {
  if (!$textarea?.length) {
    return '';
  }

  const normalized = getManagedTextareaValue($textarea);
  if (shouldPreviewLargeContent(normalized)) {
    $textarea.data('largeContentDeferredValue', normalized);
    $textarea.attr('data-large-content-deferred', 'true').attr('data-large-content-hydrated', 'true');
  } else {
    clearDeferredLargeContentState($textarea);
  }

  $textarea.val(normalized);
  return normalized;
}

export function dehydrateManagedTextarea($textarea) {
  if (!$textarea?.length) {
    return '';
  }

  const normalized = getManagedTextareaValue($textarea);
  if (!shouldPreviewLargeContent(normalized)) {
    clearDeferredLargeContentState($textarea);
    $textarea.val(normalized);
    return normalized;
  }

  $textarea.data('largeContentDeferredValue', normalized);
  $textarea.attr('data-large-content-deferred', 'true').removeAttr('data-large-content-hydrated');
  $textarea.val('');
  return normalized;
}
