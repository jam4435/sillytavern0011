const EXACT_LOCAL_DEPENDENCIES = new Set(['classcat', 'zustand', 'use-sync-external-store']);
const LOCAL_DEPENDENCY_PREFIXES = ['@xyflow/', 'd3-', 'zustand/', 'use-sync-external-store/'];

/**
 * React Flow and Zustand must be bundled with the application's React instance.
 * Loading Zustand from the ESM CDN gives it a second React runtime and causes
 * "Cannot read properties of null (reading 'useRef')" when the tree is mounted.
 *
 * @param {string} request
 * @returns {boolean}
 */
export function shouldBundleXyflowDependency(request) {
  return EXACT_LOCAL_DEPENDENCIES.has(request) || LOCAL_DEPENDENCY_PREFIXES.some(prefix => request.startsWith(prefix));
}
