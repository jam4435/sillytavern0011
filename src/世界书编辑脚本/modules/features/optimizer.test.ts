import $ from 'jquery';
import _ from 'lodash';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildGlobalSearchRegex,
  decodeExtendedSearchText,
  replaceGlobalSearchMatches,
  resolveSearchReplaceInput,
  SEARCH_REPLACE_MODES,
} from './optimizerSearchReplace.js';

Object.assign(globalThis, { $, _ });

const compareFilterSelector = '#lorebook-compare-preview-modal .compare-filter-button';
let initOptimizer: typeof import('./optimizer.js').initOptimizer;
let previewGlobalSearchAndReplace: typeof import('./optimizer.js').previewGlobalSearchAndReplace;

beforeAll(async () => {
  ({ initOptimizer, previewGlobalSearchAndReplace } = await import('./optimizer.js'));
});

afterEach(() => {
  $(document).off('click', compareFilterSelector);
  $(document).off('.optimizerSearchMode');
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('全局搜索替换扩展模式', () => {
  it('单次解析常用转义并保留未知转义', () => {
    expect(decodeExtendedSearchText(String.raw`\n\r\t\0\x41\\`)).toBe('\n\r\t\0A\\');
    expect(decodeExtendedSearchText(String.raw`\\n`)).toBe(String.raw`\n`);
    expect(decodeExtendedSearchText(String.raw`\q`)).toBe(String.raw`\q`);
  });

  it.each([String.raw`\x`, String.raw`\x1`, String.raw`\xG1`])('拒绝非法十六进制转义：%s', input => {
    expect(() => decodeExtendedSearchText(input)).toThrow(/\\x/);
  });

  it('扩展模式按字面匹配并按字面插入替换文本', () => {
    const operation = resolveSearchReplaceInput({
      searchTerm: String.raw`.\n`,
      replaceTerm: String.raw`$&\t`,
      useExtended: true,
    });
    const regex = buildGlobalSearchRegex(operation.searchTerm, operation.mode);

    expect(replaceGlobalSearchMatches('.\n结束', regex, operation.replaceTerm, operation.mode)).toBe('$&\t结束');
  });

  it('正则模式保留捕获组替换语义', () => {
    const regex = buildGlobalSearchRegex('(武)(侠)', SEARCH_REPLACE_MODES.REGEX);
    expect(replaceGlobalSearchMatches('武侠', regex, '$2$1', SEARCH_REPLACE_MODES.REGEX)).toBe('侠武');
  });

  it('正则行锚点只替换匹配行，不吞掉整段正文', () => {
    const content = ['开头内容', '你是=================等哈就是不放假', '结尾内容'].join('\n');
    const regex = buildGlobalSearchRegex('^.*={17,}.*$', SEARCH_REPLACE_MODES.REGEX);

    expect(replaceGlobalSearchMatches(content, regex, '---', SEARCH_REPLACE_MODES.REGEX)).toBe(
      ['开头内容', '---', '结尾内容'].join('\n'),
    );
  });

  it('扩展查找与正则选项双向互斥', () => {
    initOptimizer();
    const $extended = $('#global-search-use-extended');
    const $regex = $('#global-search-use-regex');

    expect($extended[0]).not.toBeChecked();
    expect($regex[0]).not.toBeChecked();

    $regex.prop('checked', true);
    $extended.prop('checked', true).trigger('change');
    expect($extended[0]).toBeChecked();
    expect($regex[0]).not.toBeChecked();

    $extended.prop('checked', true);
    $regex.prop('checked', true).trigger('change');
    expect($regex[0]).toBeChecked();
    expect($extended[0]).not.toBeChecked();
  });

  it('非法扩展转义会在预览前提示并阻止打开预览弹窗', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    initOptimizer();
    $('#global-search-input').val(String.raw`\xG1`);
    $('#global-search-use-extended').prop('checked', true);

    await previewGlobalSearchAndReplace('测试世界书', false);

    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/\\x/));
    expect($('#search-preview-modal')[0]).not.toBeVisible();
  });
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
