import { describe, expect, it } from 'vitest';

import {
  getEventAssetGenerationPlan,
  resolveEventGenerationMode,
} from '../scripts/lib/event-asset-build.mjs';

describe('resolveEventGenerationMode', () => {
  it('默认生成前端和运行时两类资产，保持旧命令兼容', () => {
    expect(resolveEventGenerationMode([])).toEqual({
      generateFrontend: true,
      generateRuntime: true,
    });
  });

  it('支持只生成武侠前端 JSON', () => {
    expect(resolveEventGenerationMode(['--frontend-only'])).toEqual({
      generateFrontend: true,
      generateRuntime: false,
    });
  });

  it('支持只生成 ERA 运行时分片和检查点', () => {
    expect(resolveEventGenerationMode(['--runtime-only'])).toEqual({
      generateFrontend: false,
      generateRuntime: true,
    });
  });

  it('拒绝同时指定互斥的生成模式', () => {
    expect(() => resolveEventGenerationMode(['--frontend-only', '--runtime-only'])).toThrow(
      '--frontend-only 与 --runtime-only 不能同时使用',
    );
  });
});

describe('getEventAssetGenerationPlan', () => {
  it('武侠单独构建时只生成过期的前端数据', () => {
    expect(
      getEventAssetGenerationPlan({
        needsWuxiaFrontendAssets: true,
        frontendNeedsGeneration: true,
        runtimeNeedsGeneration: true,
      }),
    ).toEqual({ mode: 'frontend', generateFrontend: true, generateRuntime: false });
  });

  it('事件脚本单独构建时只生成过期的运行时数据', () => {
    expect(
      getEventAssetGenerationPlan({
        needsEventRuntimeAssets: true,
        frontendNeedsGeneration: true,
        runtimeNeedsGeneration: true,
      }),
    ).toEqual({ mode: 'runtime', generateFrontend: false, generateRuntime: true });
  });

  it('两个模块都需要更新时使用一次完整生成', () => {
    expect(
      getEventAssetGenerationPlan({
        needsWuxiaFrontendAssets: true,
        needsEventRuntimeAssets: true,
        frontendNeedsGeneration: true,
        runtimeNeedsGeneration: true,
      }),
    ).toEqual({ mode: 'all', generateFrontend: true, generateRuntime: true });
  });

  it('两个模块同时构建但只有一类资产过期时仍使用定向生成', () => {
    expect(
      getEventAssetGenerationPlan({
        needsWuxiaFrontendAssets: true,
        needsEventRuntimeAssets: true,
        frontendNeedsGeneration: false,
        runtimeNeedsGeneration: true,
      }),
    ).toEqual({ mode: 'runtime', generateFrontend: false, generateRuntime: true });
  });

  it('相关资产均未过期时跳过生成', () => {
    expect(
      getEventAssetGenerationPlan({
        needsWuxiaFrontendAssets: true,
        needsEventRuntimeAssets: true,
        frontendNeedsGeneration: false,
        runtimeNeedsGeneration: false,
      }),
    ).toEqual({ mode: 'none', generateFrontend: false, generateRuntime: false });
  });
});
