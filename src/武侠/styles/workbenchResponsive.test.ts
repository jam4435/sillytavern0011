import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { compileString, Logger } from 'sass';
import { beforeAll, describe, expect, it } from 'vitest';

// 编译仓库实际样式，避免测试里的 CSS 与正式弹窗产生第二套断点。
const styleDirectory = resolve(process.cwd(), 'src/武侠/styles');
const readStyle = (filename: string) => readFileSync(resolve(styleDirectory, filename), 'utf8');
let compiledCss = '';

beforeAll(() => {
  compiledCss = compileString(
    `$breakpoint-md: 640px;\n${[
      '_modal.scss',
      '_panels.scss',
      '_themes.scss',
    ].map(readStyle).join('\n')}`,
    { logger: Logger.silent },
  ).css;
}, 30_000);

describe('行囊 / 功法工作台的窄容器与水墨主题回归', () => {
  it('真实 SCSS 编译结果保留容器查询和移动端回退', () => {
    expect(compiledCss).toMatch(/container:\s*workbench-content\s*\/\s*inline-size\s*;/);
    expect(compiledCss).toContain('@container workbench-content (max-width: 760px)');
    expect(compiledCss).toContain('@media (max-width: 640px)');
    expect(compiledCss).toMatch(/\.modal-box\.modal-inventory \.modal-content/);
    expect(compiledCss).toMatch(/\.modal-box\.modal-martial_arts \.modal-content/);
  });

  it('水墨主题的阅读区使用不透明宣纸底，而不影响其它弹窗的透明度设置', () => {
    const content = readStyle('_themes.scss');
    expect(content).toContain('.modal-box.modal-inventory,');
    expect(content).toContain('.modal-box.modal-martial_arts {');
    expect(content).toContain('background: #f1ebdf;');
    expect(content).toContain('.workbench-mobile-back {');
    expect(content).toContain('color: #1a1410;');
  });

  // 设置 WUXIA_CHROMIUM_PATH=/path/to/chromium 可启用真实浏览器回归。
  // 不强制在纯 Node / 无浏览器的单元测试环境下载 Chromium。
  it.skipIf(!process.env.WUXIA_CHROMIUM_PATH)('宽 viewport 内的窄弹窗仍切单栏，宽弹窗仍是双栏', async () => {
    const browser = await chromium.launch({
      executablePath: process.env.WUXIA_CHROMIUM_PATH,
      headless: true,
      args: ['--no-sandbox'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const render = async (width: number) => {
        await page.setContent(`
          <style>${compiledCss}</style>
          <div data-ui-theme="ink-wash">
            <div class="modal-box modal-inventory" style="width:${width}px;max-width:none;height:700px">
              <div class="modal-header">行囊包裹</div>
              <div class="modal-content">
                <div class="inventory-workbench">
                  <section class="workbench-list-pane"><div class="workbench-list">秘籍列表</div></section>
                  <section class="workbench-detail-pane">
                    <button class="workbench-mobile-back">返回行囊</button>
                    <div class="workbench-detail-card">
                      <header class="workbench-detail-hero">
                        <div class="workbench-detail-icon"></div>
                        <div class="workbench-detail-title-group">
                          <h3 class="workbench-detail-title">北冥神功与凌波微步帛卷</h3>
                        </div>
                      </header>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>`);
      };

      await render(620);
      expect(await page.locator('.inventory-workbench').evaluate(el => getComputedStyle(el).display)).toBe('block');
      expect(await page.locator('.workbench-detail-pane').evaluate(el => getComputedStyle(el).position)).toBe('absolute');
      expect(await page.locator('.modal-content').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(241, 235, 223)');
      expect(await page.locator('.workbench-mobile-back').evaluate(el => getComputedStyle(el).color)).toBe('rgb(26, 20, 16)');
      expect(await page.locator('.workbench-detail-title').evaluate(el => getComputedStyle(el).overflowWrap)).toBe('anywhere');

      await render(1080);
      expect(await page.locator('.inventory-workbench').evaluate(el => getComputedStyle(el).display)).toBe('grid');
      const detailWidth = await page.locator('.workbench-detail-pane').evaluate(el => el.getBoundingClientRect().width);
      expect(detailWidth).toBeGreaterThan(350);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
