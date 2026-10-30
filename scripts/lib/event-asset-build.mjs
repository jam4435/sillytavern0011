/**
 * Shared event-asset generation modes used by the generator and build:only.
 *
 * Frontend JSON indexes and ERA runtime shards/checkpoints have different
 * consumers, so targeted builds should only refresh the asset family they use.
 */
export function resolveEventGenerationMode(args = []) {
  const frontendOnly = args.includes('--frontend-only');
  const runtimeOnly = args.includes('--runtime-only');

  if (frontendOnly && runtimeOnly) {
    throw new Error('--frontend-only 与 --runtime-only 不能同时使用');
  }

  return {
    generateFrontend: !runtimeOnly,
    generateRuntime: !frontendOnly,
  };
}

/**
 * Decide which asset family should be generated for the selected build targets.
 * If both selected consumers need stale assets, one full generation pass is
 * cheaper than collecting and validating the event YAML twice.
 */
export function getEventAssetGenerationPlan({
  needsWuxiaFrontendAssets = false,
  needsEventRuntimeAssets = false,
  frontendNeedsGeneration = false,
  runtimeNeedsGeneration = false,
} = {}) {
  const generateFrontend = needsWuxiaFrontendAssets && frontendNeedsGeneration;
  const generateRuntime = needsEventRuntimeAssets && runtimeNeedsGeneration;

  let mode = 'none';
  if (generateFrontend && generateRuntime) mode = 'all';
  else if (generateFrontend) mode = 'frontend';
  else if (generateRuntime) mode = 'runtime';

  return { mode, generateFrontend, generateRuntime };
}
