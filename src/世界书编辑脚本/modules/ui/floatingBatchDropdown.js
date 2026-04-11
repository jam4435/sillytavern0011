import { LOREBOOK_PANEL_ID } from '../config.js';

const FLOATING_BATCH_DROPDOWN_LAYER_CLASS = 'lorebook-floating-dropdown-layer';
const FLOATING_BATCH_DROPDOWN_CLASS = 'floating-batch-dropdown';
const PANEL_EDGE_GAP = 8;
const DROPDOWN_OFFSET = 6;
const MIN_DROPDOWN_HEIGHT = 140;
const MAX_DROPDOWN_HEIGHT = 420;

function getParentDoc(parentDoc = window.parent.document) {
  return parentDoc;
}

function getParentWin(parentDoc = getParentDoc()) {
  return parentDoc.defaultView || window.parent || window;
}

function getPanel(parentDoc = getParentDoc()) {
  return $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
}

function getFloatingLayer(parentDoc = getParentDoc()) {
  const $panel = getPanel(parentDoc);
  if (!$panel.length) {
    return $();
  }

  let $layer = $panel.children(`.${FLOATING_BATCH_DROPDOWN_LAYER_CLASS}`);
  if (!$layer.length) {
    $layer = $('<div></div>').addClass(FLOATING_BATCH_DROPDOWN_LAYER_CLASS);
    $panel.append($layer);
  }

  return $layer;
}

function resetDropdownStyles($dropdown) {
  $dropdown.css({
    display: '',
    visibility: '',
    left: '',
    top: '',
    right: '',
    bottom: '',
    maxHeight: '',
    overflowY: '',
  });
}

function restoreDropdown($dropdown, parentDoc = getParentDoc()) {
  const $owner = $dropdown.data('floating-owner-container');
  $dropdown.removeData('floating-owner-container').removeClass(FLOATING_BATCH_DROPDOWN_CLASS);
  resetDropdownStyles($dropdown);

  if ($owner?.length && $.contains(parentDoc.documentElement, $owner.get(0))) {
    $owner.append($dropdown);
    return;
  }

  $dropdown.remove();
}

function measureDropdown($dropdown) {
  $dropdown.css({
    display: 'block',
    visibility: 'hidden',
    left: '0px',
    top: '0px',
    right: 'auto',
    bottom: 'auto',
  });

  return {
    width: Math.ceil($dropdown.outerWidth()),
    height: Math.ceil($dropdown.outerHeight()),
  };
}

function positionDropdown($dropdown, $button, parentDoc = getParentDoc()) {
  const $panel = getPanel(parentDoc);
  const panelNode = $panel.get(0);
  const buttonNode = $button.get(0);
  if (!panelNode || !buttonNode) {
    return;
  }

  const parentWin = getParentWin(parentDoc);
  const panelRect = panelNode.getBoundingClientRect();
  const buttonRect = buttonNode.getBoundingClientRect();
  const { width, height } = measureDropdown($dropdown);

  const availableBelow = Math.max(0, (parentWin.innerHeight || 0) - buttonRect.bottom - PANEL_EDGE_GAP);
  const availableAbove = Math.max(0, buttonRect.top - PANEL_EDGE_GAP);
  const openUpward = availableBelow < height && availableAbove > availableBelow;
  const maxHeight = Math.max(
    MIN_DROPDOWN_HEIGHT,
    Math.min(MAX_DROPDOWN_HEIGHT, openUpward ? availableAbove - DROPDOWN_OFFSET : availableBelow - DROPDOWN_OFFSET),
  );
  const renderedHeight = Math.min(height, maxHeight);
  const maxLeft = Math.max(PANEL_EDGE_GAP, panelRect.width - width - PANEL_EDGE_GAP);

  let left = buttonRect.right - panelRect.left - width;
  left = Math.min(Math.max(PANEL_EDGE_GAP, left), maxLeft);

  let top = openUpward
    ? buttonRect.top - panelRect.top - renderedHeight - DROPDOWN_OFFSET
    : buttonRect.bottom - panelRect.top + DROPDOWN_OFFSET;
  top = Math.max(PANEL_EDGE_GAP, top);

  $dropdown.css({
    display: 'block',
    visibility: 'visible',
    left: `${left}px`,
    top: `${top}px`,
    right: 'auto',
    bottom: 'auto',
    maxHeight: `${maxHeight}px`,
    overflowY: height > maxHeight ? 'auto' : '',
  });
}

export function closeFloatingBatchToggleDropdowns(parentDoc = getParentDoc()) {
  const $panel = getPanel(parentDoc);
  if (!$panel.length) {
    return;
  }

  $panel.find('.lorebook-batch-toggle-container').removeClass('active');

  const $layer = getFloatingLayer(parentDoc);
  $layer.children('.batch-toggle-dropdown').each(function () {
    restoreDropdown($(this), parentDoc);
  });
}

export function toggleFloatingBatchToggleDropdown($button, parentDoc = getParentDoc()) {
  const $panel = getPanel(parentDoc);
  const $container = $button.closest('.lorebook-batch-toggle-container');
  const $dropdown = $container.children('.batch-toggle-dropdown');
  const wasActive = $container.hasClass('active');

  closeFloatingBatchToggleDropdowns(parentDoc);

  if (wasActive || !$panel.length || !$container.length || !$dropdown.length) {
    return;
  }

  const $layer = getFloatingLayer(parentDoc);
  $container.addClass('active');
  $dropdown.data('floating-owner-container', $container);
  $dropdown.addClass(FLOATING_BATCH_DROPDOWN_CLASS);
  $layer.append($dropdown);
  positionDropdown($dropdown, $button, parentDoc);
}

export function repositionFloatingBatchToggleDropdowns(parentDoc = getParentDoc()) {
  const $layer = getFloatingLayer(parentDoc);
  $layer.children(`.batch-toggle-dropdown.${FLOATING_BATCH_DROPDOWN_CLASS}`).each(function () {
    const $dropdown = $(this);
    const $owner = $dropdown.data('floating-owner-container');
    if (!$owner?.length || !$.contains(parentDoc.documentElement, $owner.get(0)) || !$owner.hasClass('active')) {
      restoreDropdown($dropdown, parentDoc);
      return;
    }

    const $button = $owner.children('.batch-toggle-button').first();
    if (!$button.length) {
      restoreDropdown($dropdown, parentDoc);
      return;
    }

    positionDropdown($dropdown, $button, parentDoc);
  });
}
