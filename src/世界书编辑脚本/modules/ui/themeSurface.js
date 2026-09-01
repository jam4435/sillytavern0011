export const THEME_PORTAL_ID = 'lorebook-theme-portal';

function getParentDocument() {
  return window.parent.document;
}

function configureThemePortal(portal) {
  portal.classList.add('lorebook-theme-scope');
  portal.dataset.lorebookThemeSurface = 'portal';
  Object.assign(portal.style, {
    display: 'none',
    position: '',
    inset: '',
    zIndex: '',
    pointerEvents: '',
  });
  return portal;
}

function copyThemeVariables(source, target) {
  for (const propertyName of source.style) {
    if (propertyName.startsWith('--')) {
      target.style.setProperty(propertyName, source.style.getPropertyValue(propertyName));
    }
  }
  target.style.colorScheme = source.style.colorScheme;
}

function configureThemeOverlay(node, portal) {
  if (node?.nodeType !== 1) {
    return;
  }
  node.classList.add('lorebook-theme-scope');
  node.dataset.lorebookThemeSurface = 'overlay';
  copyThemeVariables(portal, node);
}

function movePortalChildrenToBody(portal, parentDoc) {
  const mountPoint = parentDoc.body || parentDoc.documentElement;
  Array.from(portal.childNodes).forEach(node => {
    configureThemeOverlay(node, portal);
    mountPoint.appendChild(node);
  });
}

/**
 * Return the hidden theme-variable template used by overlays outside the panel.
 * Legacy children are moved to the host body so fixed overlays remain viewport-rooted.
 */
export function ensureThemePortal(parentDoc = getParentDocument()) {
  let portal = parentDoc.getElementById(THEME_PORTAL_ID);
  if (portal) {
    configureThemePortal(portal);
    movePortalChildrenToBody(portal, parentDoc);
    return portal;
  }

  portal = parentDoc.createElement('div');
  portal.id = THEME_PORTAL_ID;
  configureThemePortal(portal);
  (parentDoc.body || parentDoc.documentElement).appendChild(portal);
  return portal;
}

/**
 * Append overlays directly to the host body while applying the shared theme scope.
 * The hidden portal remains only as the current CSS-variable template.
 */
export function appendToThemePortal(content, parentDoc = getParentDocument()) {
  const portal = ensureThemePortal(parentDoc);
  const mountPoint = parentDoc.body || parentDoc.documentElement;

  const appendNode = node => {
    if (node?.nodeType === 11) {
      Array.from(node.childNodes).forEach(child => configureThemeOverlay(child, portal));
    } else {
      configureThemeOverlay(node, portal);
    }
    mountPoint.appendChild(node);
  };

  if (typeof content === 'string') {
    const template = parentDoc.createElement('template');
    template.innerHTML = content;
    appendNode(template.content);
    return portal;
  }

  if (content?.jquery && typeof content.each === 'function') {
    content.each((_, node) => appendNode(node));
    return portal;
  }

  if (content && typeof content === 'object' && Number.isInteger(content.nodeType)) {
    appendNode(content);
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
  parentDoc.querySelectorAll('[data-lorebook-theme-surface="overlay"]').forEach(overlay => {
    applyVariables(overlay, variables, colorScheme);
  });
  return portal;
}
