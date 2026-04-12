# 开局前端

`src/JM/开局前端/` 是这个界面的源码目录，最终单文件产物会由仓库构建流程输出到 `dist/JM/开局前端/index.html`。

## 目录说明

- `index.html`：只放静态结构
- `index.scss`：样式
- `index.ts`：前端入口，负责加载样式并启动 `app.ts`
- `data.ts`：职业、特征、改造等大块数据
- `app.ts`：入口，只负责绑定事件
- `state.ts`：选择状态与重置逻辑
- `render.ts`：页面渲染
- `flow.ts`：步骤流转与随机选择
- `submit.ts`：最终文案拼接与注入世界
- `data-access.ts`：从 `data.ts` 读取当前步骤所需配置
- `dom.ts`：DOM 取值辅助
- `types.ts`：共享类型
- `README.md`：当前目录的维护说明

## 修改建议

- 改选项内容：优先改 `data.ts`
- 改界面结构：优先改 `index.html`
- 改样式：优先改 `index.scss`
- 改步骤流程：优先改 `flow.ts`
- 改最终发送给酒馆的描述：优先改 `submit.ts`

## 构建方式

1. 开发时使用 `pnpm watch`
2. 正式打包使用 `pnpm build`
3. 最终使用 `dist/JM/开局前端/index.html`

## 注意

- 不要直接修改 `dist/**` 下的产物
- 如果后续还要继续拆，可以把 `render.ts` 再细分成 `summary.ts`、`features.ts`、`modifications.ts`
