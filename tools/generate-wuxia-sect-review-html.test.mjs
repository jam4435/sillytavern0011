import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM, VirtualConsole } from 'jsdom';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(import.meta.dirname, '..');
const htmlPath = path.join(projectRoot, 'plans', '武侠角色功法审计', '门派功法谱系审核台.html');

describe('门派功法谱系审核台', () => {
  it('内嵌完整谱系并可完成筛选与本地审批', async () => {
    const html = await readFile(htmlPath, 'utf8');
    expect(html).not.toContain('__LINEAGE_DATA__');

    const errors = [];
    let downloadedBlob;
    let downloadedName;
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => errors.push(error));
    const dom = new JSDOM(html, {
      beforeParse(window) {
        window.URL.createObjectURL = blob => {
          downloadedBlob = blob;
          return 'blob:wuxia-review-test';
        };
        window.URL.revokeObjectURL = () => {};
        window.HTMLAnchorElement.prototype.click = function click() {
          downloadedName = this.download;
        };
      },
      runScripts: 'dangerously',
      url: 'https://wuxia-review.local/门派功法谱系审核台.html',
      virtualConsole,
    });

    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    const { document } = dom.window;
    expect(document.querySelectorAll('[data-sect-id]')).toHaveLength(10);
    expect(document.querySelectorAll('[data-node-id]').length).toBeGreaterThan(0);
    expect(document.getElementById('globalProgressLabel').textContent).toContain('/ 106');

    const firstCard = document.querySelector('[data-node-id]');
    const nodeId = firstCard.dataset.nodeId;
    firstCard.querySelector('[data-review-kind="node"][data-status="通过"]').click();
    const updatedCard = [...document.querySelectorAll('[data-node-id]')].find(card => card.dataset.nodeId === nodeId);
    expect(updatedCard.dataset.status).toBe('通过');
    expect(dom.window.localStorage.getItem('wuxia:sect-lineage-review:v1')).toContain(nodeId);

    document.getElementById('exportMergedButton').click();
    expect(downloadedBlob).toBeTruthy();
    expect(downloadedName).toMatch(/^门派功法谱系-已审核-\d{4}-\d{2}-\d{2}\.json$/);

    const search = document.getElementById('searchInput');
    search.value = '不存在的功法名称';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(document.querySelector('.empty-state')).not.toBeNull();
    expect(errors).toEqual([]);

    dom.window.close();
  });
});
