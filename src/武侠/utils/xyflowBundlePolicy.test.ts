import { describe, expect, it } from 'vitest';
import { shouldBundleXyflowDependency } from './xyflowBundlePolicy.mjs';

describe('shouldBundleXyflowDependency', () => {
  it.each([
    '@xyflow/react',
    '@xyflow/system',
    'classcat',
    'zustand',
    'zustand/traditional',
    'zustand/shallow',
    'use-sync-external-store',
    'use-sync-external-store/shim/with-selector.js',
    'd3-drag',
    'd3-selection',
    'd3-zoom',
  ])('keeps %s in the local React Flow bundle', request => {
    expect(shouldBundleXyflowDependency(request)).toBe(true);
  });

  it.each(['lodash', 'toastr', 'yaml', 'zod'])('does not change the external policy for %s', request => {
    expect(shouldBundleXyflowDependency(request)).toBe(false);
  });
});
