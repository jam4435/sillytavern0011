export const THEME_PORTAL_ID = 'lorebook-theme-portal';

function getParentDocument() {
  return window.parent.document;
}

function configureThemePortal(portal) {
  portal.classList.add('lorebook-theme-scope');
  portal.dataset.lorebookThemeSurface = 'portal';
  Object.assign(portal.style, {
    display: 'block',
    position: 'fixed',
    inset: '0',
    zIndex: '10000',
    pointerEvents: 'none',
  });
  return portal;
}

/**
 * Return the shared mount point for UI that must live outside the lorebook panel.
 * Theme variables are applied to this element, so every child overlay inherits the
 * same contract as the main panel.
 */
export function ensureThemePortal(parentDoc = getParentDocument()) {
  let portal = parentDoc.getElementById(THEME_PORTAL_ID);
  if (portal) {
    return configureThemePortal(portal);
  }

  portal = parentDoc.createElement('div');
  portal.id = THEME_PORTAL_ID;
  configureThemePortal(portal);
  (parentDoc.body || parentDoc.documentElement).appendChild(portal);
  return portal;
}

/**
 * Append jQuery collections, DOM nodes, or HTML strings to the shared theme portal.
 */
export function appendToThemePortal(content, parentDoc = getParentDocument()) {
  const portal = ensureThemePortal(parentDoc);

  if (typeof content === 'string') {
    portal.insertAdjacentHTML('beforeend', content);
    return portal;
  }

  if (content?.jquery && typeof content.each === 'function') {
    content.each((_, node) => portal.appendChild(node));
    return portal;
  }

  if (content && typeof content === 'object' && Number.isInteger(content.nodeType)) {
    portal.appendChild(content);
    return portal;
  }

  throw new TypeError('appendToThemePortal 仅支持 HTML 字符串、DOM 节点或 jQuery 集合');
}

/**
 * Build the complete public CSS-variable contract shared by the panel and portal.
 */
export function buildThemeSurfaceVariables({
  semanticTokens = {},
  panelBgColor,
  textColor,
  accentColor,
  entryBgColor,
  inputBgColor,
  inputFocusBgColor,
  dropdownActiveBgColor,
  entryHoverBgColor,
  selectedBgColor,
  backgroundImage,
  backgroundImageOpacity,
  iconBgColor,
  iconHoverBgColor,
  panelAccentTextColor,
  lorebookNameWhiteSpace,
  lorebookNameTextOverflow,
  lorebookNameOverflowWrap,
  lorebookNameWordBreak,
  lorebookTitleAlignItems,
}) {
  return {
    ...semanticTokens,
    '--panel-bg-color': panelBgColor,
    '--panel-text-color': textColor,
    '--panel-accent-color': accentColor,
    '--panel-entry-bg-color': entryBgColor,
    '--panel-input-bg-color': inputBgColor,
    '--panel-field-bg-color': inputBgColor,
    '--panel-input-focus-bg-color': inputFocusBgColor,
    '--panel-field-focus-bg-color': inputFocusBgColor,
    '--panel-dropdown-bg-color': inputBgColor,
    '--panel-dropdown-hover-bg-color': accentColor,
    '--panel-dropdown-active-bg-color': dropdownActiveBgColor,
    '--panel-entry-hover-bg-color': entryHoverBgColor,
    '--panel-selected-bg-color': selectedBgColor,
    '--panel-md-entry-bg-color': entryBgColor,
    '--panel-md-entry-current-bg-color': selectedBgColor,
    '--search-input-bg-color': inputBgColor,
    '--yaml-input-bg-color': inputBgColor,
    '--panel-background-image': backgroundImage,
    '--panel-background-image-opacity': backgroundImageOpacity,
    '--panel-surface-opacity': '1',
    '--panel-icon-bg-color': iconBgColor,
    '--panel-icon-hover-bg-color': iconHoverBgColor,
    '--modal-bg-color': panelBgColor,
    '--modal-text-color': textColor,
    '--modal-accent-color': accentColor,
    '--lorebook-name-white-space': lorebookNameWhiteSpace,
    '--lorebook-name-text-overflow': lorebookNameTextOverflow,
    '--lorebook-name-overflow-wrap': lorebookNameOverflowWrap,
    '--lorebook-name-word-break': lorebookNameWordBreak,
    '--lorebook-title-align-items': lorebookTitleAlignItems,
    '--panel-accent-text-color': panelAccentTextColor,
  };
}

function applyVariables(element, variables, colorScheme) {
  if (!element) {
    return;
  }

  Object.entries(variables).forEach(([name, value]) => {
    if (value !== undefined && value !== null) {
      element.style.setProperty(name, String(value));
    }
  });
  element.style.colorScheme = colorScheme;
}

export function syncThemeSurfaces(parentDoc, panel, variables, colorScheme) {
  const portal = ensureThemePortal(parentDoc);
  const panelElement = panel?.jquery ? panel[0] : panel;
  applyVariables(panelElement, variables, colorScheme);
  applyVariables(portal, variables, colorScheme);
  return portal;
}
