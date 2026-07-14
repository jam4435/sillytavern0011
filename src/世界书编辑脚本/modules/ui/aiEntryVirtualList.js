function renderRowsWithoutVirtualization(contentElement, rows) {
  contentElement.innerHTML = rows.join('');
}

function createUnavailableError() {
  return new Error('Clusterize constructor is unavailable.');
}

/**
 * Creates the AI workspace entry list without relying on element lookups in the
 * script iframe's document.
 *
 * @param {object} params
 * @param {Function | null | undefined} params.Clusterize Clusterize constructor.
 * @param {Element} params.scrollElement Scroll container from the host document.
 * @param {Element} params.contentElement Content container from the host document.
 * @param {string[]} params.rows Rendered entry rows.
 * @param {object} [params.options] Additional Clusterize options.
 * @returns {{ instance: object | null, degraded: boolean, error: unknown | null }}
 */
export function createAiEntryVirtualList({ Clusterize, scrollElement, contentElement, rows, options = {} }) {
  if (typeof Clusterize !== 'function') {
    renderRowsWithoutVirtualization(contentElement, rows);
    return {
      instance: null,
      degraded: true,
      error: createUnavailableError(),
    };
  }

  const clusterizeOptions = {
    ...options,
    rows,
    scrollElem: scrollElement,
    contentElem: contentElement,
  };
  delete clusterizeOptions.scrollId;
  delete clusterizeOptions.contentId;

  try {
    return {
      instance: new Clusterize(clusterizeOptions),
      degraded: false,
      error: null,
    };
  } catch (error) {
    renderRowsWithoutVirtualization(contentElement, rows);
    return {
      instance: null,
      degraded: true,
      error,
    };
  }
}

/**
 * Destroys a Clusterize instance created for the AI entry list.
 *
 * @param {object | null | undefined} instance
 * @param {boolean} [clean=true]
 */
export function destroyAiEntryVirtualList(instance, clean = true) {
  if (typeof instance?.destroy === 'function') {
    instance.destroy(clean);
  }
}
