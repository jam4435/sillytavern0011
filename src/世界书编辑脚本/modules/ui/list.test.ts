import _ from 'lodash';
import { beforeAll, describe, expect, it, vi } from 'vitest';

let mergePinnedGlobalLorebooks: typeof import('./list.js').mergePinnedGlobalLorebooks;

beforeAll(async () => {
  vi.stubGlobal('_', _);
  ({ mergePinnedGlobalLorebooks } = await import('./list.js'));
});

describe('全局世界书常驻同步', () => {
  it('空常驻时使用当前已启用全局世界书', () => {
    expect(mergePinnedGlobalLorebooks([], ['世界书 A', '世界书 B'])).toEqual(['世界书 A', '世界书 B']);
  });

  it('保留已有常驻并追加新启用世界书', () => {
    expect(mergePinnedGlobalLorebooks(['常驻 A'], ['启用 B'])).toEqual(['常驻 A', '启用 B']);
  });

  it('去重并过滤空名称和非法名称', () => {
    expect(
      mergePinnedGlobalLorebooks([' 世界书 A ', '世界书 A', '', null, '世界书 B'] as any, [
        '世界书 B',
        '世界书 C',
        '世界书 C',
        {},
        ' ',
      ] as any),
    ).toEqual(['世界书 A', '世界书 B', '世界书 C']);
  });

  it('已常驻但未启用的世界书仍会保留', () => {
    expect(mergePinnedGlobalLorebooks(['未启用常驻'], [])).toEqual(['未启用常驻']);
  });
});
