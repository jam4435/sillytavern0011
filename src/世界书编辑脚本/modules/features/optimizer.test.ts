import $ from 'jquery';
import _ from 'lodash';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

Object.assign(globalThis, { $, _ });

const compareFilterSelector = '#lorebook-compare-preview-modal .compare-filter-button';
let initOptimizer: typeof import('./optimizer.js').initOptimizer;

beforeAll(async () => {
  ({ initOptimizer } = await import('./optimizer.js'));
});

afterEach(() => {
  $(document).off('click', compareFilterSelector);
  document.body.innerHTML = '';
});

describe('世界书全本比对筛选', () => {
  it('父页面残留旧弹窗时仍会重新绑定“仅修改”筛选', () => {
    document.body.innerHTML = `
      <div id="lorebook-optimize-modal"></div>
      <div id="lorebook-compare-preview-modal">
        <div id="lorebook-compare-preview-summary"></div>
        <button type="button" class="compare-filter-button active" data-compare-filter="all">全部</button>
        <button type="button" class="compare-filter-button" data-compare-filter="modified">仅修改</button>
        <div id="lorebook-compare-preview-list"></div>
      </div>
    `;

    const $modal = $('#lorebook-compare-preview-modal');
    $modal.data('compare-filter', 'all');
    $modal.data('compare-result', {
      baseName: '当前',
      targetName: '对比',
      summary: { added: 1, removed: 0, modified: 1 },
      items: [
        {
          type: 'modified',
          title: '修改条目',
          baseUid: 1,
          targetUid: 10,
          diffs: [],
        },
        {
          type: 'added',
          title: '新增条目',
          uid: 11,
          entry: {
            uid: 11,
            name: '新增条目',
            content: '新增正文',
            enabled: true,
            probability: 100,
            strategy: { type: 'selective', keys: [] },
            position: { type: 'after_character_definition', depth: 4, order: 0 },
          },
        },
      ],
    });

    initOptimizer();
    $('.compare-filter-button[data-compare-filter="modified"]').trigger('click');

    expect($modal.data('compare-filter')).toBe('modified');
    expect($('.compare-filter-button[data-compare-filter="modified"]')[0]).toHaveClass('active');
    expect($('#lorebook-compare-preview-list')[0]).toHaveTextContent('修改条目');
    expect($('#lorebook-compare-preview-list')[0]).not.toHaveTextContent('新增条目');
  });
});
