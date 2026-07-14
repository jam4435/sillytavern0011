import { describe, expect, it, vi } from 'vitest';
import { createAiEntryVirtualList, destroyAiEntryVirtualList } from './aiEntryVirtualList.js';

function createHostElements() {
  const hostDocument = document.implementation.createHTMLDocument('host');
  const scrollElement = hostDocument.createElement('div');
  const contentElement = hostDocument.createElement('div');
  scrollElement.append(contentElement);
  hostDocument.body.append(scrollElement);
  return { hostDocument, scrollElement, contentElement };
}

describe('AI 条目虚拟列表适配器', () => {
  it('把宿主 document 的 DOM 节点直接传给 Clusterize', () => {
    const { hostDocument, scrollElement, contentElement } = createHostElements();
    const rows = ['<div>条目 A</div>', '<div>条目 B</div>'];
    const instance = { destroy: vi.fn() };
    const Clusterize = vi.fn(function Clusterize() {
      return instance;
    });

    const result = createAiEntryVirtualList({
      Clusterize,
      scrollElement,
      contentElement,
      rows,
      options: {
        scrollId: 'iframe-scroll',
        contentId: 'iframe-content',
        no_data_text: '没有条目',
      },
    });

    const options = Clusterize.mock.calls[0][0];
    expect(scrollElement.ownerDocument).toBe(hostDocument);
    expect(options).toMatchObject({
      rows,
      scrollElem: scrollElement,
      contentElem: contentElement,
      no_data_text: '没有条目',
    });
    expect(options).not.toHaveProperty('scrollId');
    expect(options).not.toHaveProperty('contentId');
    expect(result).toEqual({ instance, degraded: false, error: null });
  });

  it('依赖缺失时直接渲染所有 rows', () => {
    const { scrollElement, contentElement } = createHostElements();
    const rows = ['<div data-uid="1">条目 1</div>', '<div data-uid="2">条目 2</div>'];

    const result = createAiEntryVirtualList({
      Clusterize: undefined,
      scrollElement,
      contentElement,
      rows,
    });

    expect(contentElement.innerHTML).toBe(rows.join(''));
    expect(result.instance).toBeNull();
    expect(result.degraded).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('构造失败时覆盖中间态并返回原始错误', () => {
    const { scrollElement, contentElement } = createHostElements();
    const rows = ['<div data-uid="3">条目 3</div>'];
    const constructionError = new Error('无法初始化');
    const Clusterize = vi.fn(function Clusterize() {
      contentElement.innerHTML = '<div>未完成的虚拟列表</div>';
      throw constructionError;
    });

    const result = createAiEntryVirtualList({
      Clusterize,
      scrollElement,
      contentElement,
      rows,
    });

    expect(contentElement.innerHTML).toBe(rows.join(''));
    expect(result).toEqual({ instance: null, degraded: true, error: constructionError });
  });

  it('销毁时统一透传清理参数', () => {
    const destroy = vi.fn();
    destroyAiEntryVirtualList({ destroy });
    destroyAiEntryVirtualList({ destroy }, false);
    destroyAiEntryVirtualList(null);

    expect(destroy).toHaveBeenNthCalledWith(1, true);
    expect(destroy).toHaveBeenNthCalledWith(2, false);
  });
});
