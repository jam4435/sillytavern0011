# 开局前端

`src/JM/开局前端/` 是这个界面的源码目录，最终单文件产物由仓库构建流程输出到 `dist/JM/开局前端/index.html`。

## 结构说明

- `index.html`：静态结构骨架。入口页 `screen-mode` 负责承载共享的“开局设置”面板。
- `index.scss`：界面样式。入口设置区与模式卡共用这一份样式，不要把设置样式散到其他文件。
- `index.ts`：前端入口，只负责加载样式并启动 `app.ts`。
- `app.ts`：事件绑定入口，负责设置开关、模式切换、步骤按钮和输入框监听。
- `state.ts`：选择状态、设置默认值、设置缓存和步骤重置逻辑。
- `render.ts`：页面渲染与设置控件同步。
- `flow.ts`：步骤流转、随机选择和最终提交入口调度。
- `tavern-settings.ts`：把“开局设置”同步到局部正则、局部脚本和当前角色世界书，并同步高难身份路线的 chat 变量与关联世界书条目。
- `hard-routes.ts`：高难身份路线的 key、显示名、难度、性别兼容性和默认值。
- `popup.ts`：设置同步结果弹窗。
- `submit.ts`：最终文案拼接与注入世界。
- `data.ts` / `data-access.ts`：职业、特征、改造等数据及其读取逻辑。
- `dom.ts` / `types.ts`：DOM 辅助与共享类型。

## 修改边界

- 开局设置属于入口层共享配置。不要再把设置面板放回“自定义开局”的步骤页；自定义开局和快捷开局都应复用同一份设置状态。
- 改入口结构或设置面板位置：优先改 `index.html` 和 `index.scss`。
- 改设置状态、默认值或缓存：优先改 `state.ts`。
- 改设置控件显示、禁用态或摘要展示：优先改 `render.ts`。
- 改设置同步目标、路线变量或世界书条目同步规则：优先改 `tavern-settings.ts`，弹窗表现看 `popup.ts`。
- 改高难身份路线选项或变量 key：优先改 `hard-routes.ts`，世界书 EJS 与提交校验必须同步确认。
- 改步骤流程：优先改 `flow.ts`。
- 改最终发送给酒馆的描述：优先改 `submit.ts`。
- 改选项内容：优先改 `data.ts`。

## 构建与验证

1. 开发时使用 `pnpm watch`
2. 正式打包使用 `pnpm build`
3. 回归测试使用 `pnpm test`

## 注意

- 不要直接修改 `dist/**` 下的产物。
- 设置控件 id 视为契约，保持 `setting-enable-variables`、`setting-use-text-status-bar`、`setting-generate-options`
  不变。
- `GenerationSettings` 结构、缓存 key、即时同步和同步结果弹窗是既有行为，改界面时不要顺手改掉。
- 高难身份路线使用独立缓存 key `jm-opening-frontend-hard-identity-route-v1`，不属于
  `GenerationSettings`，切换路线不应触发 `applyGenerationSettings`。
- 切换高难身份路线和点击“注入世界”都会写入 chat 变量 `hardIdentityRoute`；默认值为 `none`，用于清空旧聊天残留路线。
- `hardIdentityRoute` 为任一路线时会打开当前角色世界书条目 `cot` 和 `高难身份路线`；切回 `none` 时会关闭这两个条目。
