/**
 * 水墨主题（ink）精灵图集合
 *
 * 通过 webpack 的 `?url` 资源查询加载本地图片 → `type: 'asset/inline'` → base64 data URI
 * 内联进 bundle（沿用 MapCanvas.tsx 的 `地图.jpg?url` 先例）。
 * 这是因为该前端的 css-loader 设为 `url: false` 且 CSS 经 HTMLInlineCSSWebpackPlugin
 * 内联进单一 index.html，普通相对 url() 无法解析到磁盘图片；base64 是唯一自包含路径。
 *
 * 仅在 theme === 'ink' 时由 SocialPanel 注入为 CSS 变量（--sprite-*），SCSS 的
 * [data-theme="ink"] .social-panel override block 引用这些变量做材质覆盖。
 * 宣纸主题不引入本模块，保持纯 CSS、零额外体积。
 *
 * 精灵图来源：src/武侠/wuxia-sprites/（设计规范 v2.0 配套素材库）。
 */
import bgInkLandscape from '../../wuxia-sprites/水墨背景.jpg?url';
import panelBarLg from '../../wuxia-sprites/panel/panel-bar-lg.png?url';
import panelBarSm from '../../wuxia-sprites/panel/panel-bar-sm.png?url';
import panelRectMd from '../../wuxia-sprites/panel/panel-rect-md.png?url';
import panelRectLg from '../../wuxia-sprites/panel/panel-rect-lg.png?url';
import brushBarLg from '../../wuxia-sprites/brush/brush-bar-lg.png?url';
import brushBarMd from '../../wuxia-sprites/brush/brush-bar-md.png?url';
import circleFrameInk from '../../wuxia-sprites/circle/circle-frame-ink.png?url';
import btnCapsuleDarkMd from '../../wuxia-sprites/button/btn-capsule-dark-md.png?url';
import btnCapsuleOutlineMd from '../../wuxia-sprites/button/btn-capsule-outline-md.png?url';
import btnTagDark from '../../wuxia-sprites/button/btn-tag-dark.png?url';
import btnTagOutline from '../../wuxia-sprites/button/btn-tag-outline.png?url';

/**
 * 水墨主题精灵图 CSS 变量映射。
 * key = CSS 变量名（不带 -- 前缀），value = base64 data URI。
 * 由 SocialPanel 在 ink 主题下经 style 注入到 .social-panel 根元素。
 */
export const SOCIAL_INK_SPRITES: Record<string, string> = {
  'sprite-bg': bgInkLandscape,
  'sprite-panel-bar-lg': panelBarLg,
  'sprite-panel-bar-sm': panelBarSm,
  'sprite-panel-rect-md': panelRectMd,
  'sprite-panel-rect-lg': panelRectLg,
  'sprite-brush-lg': brushBarLg,
  'sprite-brush-md': brushBarMd,
  'sprite-circle-ink': circleFrameInk,
  'sprite-btn-dark-md': btnCapsuleDarkMd,
  'sprite-btn-outline-md': btnCapsuleOutlineMd,
  'sprite-btn-tag-dark': btnTagDark,
  'sprite-btn-tag-outline': btnTagOutline,
};

/**
 * 把精灵图映射转为可注入到元素 style 的 CSS 变量对象。
 * 仅 theme === 'ink' 时调用。
 */
export function buildInkSpriteStyle(): Record<string, string> {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(SOCIAL_INK_SPRITES)) {
    style[`--${key}`] = value;
  }
  return style;
}
