# 世界书编辑脚本 - 模块化架构文档

## 1. 简介

本文档说明 `src/世界书编辑脚本/` 当前代码的模块划分和主要数据流。

说明：

- 以仓库当前代码为准，不再保留容易过期的行数统计
- `信息.txt`、导出 JSON、临时文件等不属于架构主体，不在本文档展开
- `AI 修改` 现在已经是独立子系统，不再只是零散按钮逻辑

## 2. 核心设计理念

- **分层模块化**：`commands/` 负责操作编排，`features/` 负责业务能力，`ui/` 负责界面，`api.js` 负责酒馆接口封装
- **职责单一**：尽量把“渲染”“状态”“AI 请求”“世界书写回”“回滚历史”拆到不同模块
- **状态分层**：主列表共享状态集中在 `state.js`；AI 工作区有自己的模块内运行时状态；跨会话偏好写入 `settings.js`
- **命令驱动 + 局部直绑并存**：主面板遵循 `events.js -> commands/*.js` 的命令分发；AI 工作区内部事件由 `ui/aiWorkspace.js` 直接绑定
- **原子写回**：条目更新先在内存中形成最终结果，再通过统一 API 一次性提交
- **高风险操作可回滚**：AI 应用、批量删除等操作会记录快照，支持预览并回滚

## 3. 文件结构

```text
src/世界书编辑脚本/
├── ARCHITECTURE.md
├── index.js
└── modules/
    ├── api.js
    ├── config.js
    ├── events.js
    ├── settings.js
    ├── state.js
    ├── utils.js
    │
    ├── commands/
    │   ├── entryCommands.js
    │   ├── folderCommands.js
    │   ├── index.js
    │   ├── selectorCommands.js
    │   ├── titleBarCommands.js
    │   └── worldbookCommands.js
    │
    ├── features/
    │   ├── activationTracker.js
    │   ├── aiActions.js
    │   ├── aiActionsBatch.js
    │   ├── batchActions.js
    │   ├── browserSettingsBackup.js
    │   ├── bulkImport.js
    │   ├── folderMeta.js
    │   ├── history.js
    │   ├── llmClient.js
    │   ├── optimizer.js
    │   └── sorting.js
    │
    └── ui/
        ├── aiActionDialog.js
        ├── aiWorkspace.js
        ├── aiWorkspaceDesktop.js
        ├── contentEditor.js
        ├── detail.js
        ├── editor.js
        ├── entry.js
        ├── expandManager.js
        ├── floatingBatchDropdown.js
        ├── largeContentPreview.js
        ├── list.js
        ├── masterEntryTokens.js
        ├── panel.js
        └── theme.js
```

## 4. 模块说明

### 4.1 核心模块

| 模块 | 职责 |
|------|------|
| `index.js` | 入口文件，初始化面板、命令、对话框和酒馆事件集成 |
| `config.js` | DOM ID、CSS 类名、存储键名、标签页常量等配置 |
| `settings.js` | `localStorage` 读写，管理固定条目、界面偏好、AI 工作区设置与提示词模板 |
| `state.js` | 主列表共享运行时状态：条目数据、筛选条件、选择状态、部分事务引用等 |
| `utils.js` | 通用工具函数：UID 处理、错误包装、文件辅助等 |
| `api.js` | 酒馆接口封装：世界书读取、条目增删改、事务接入、统一结果结构 |
| `events.js` | 主面板事件分发器，把 `data-action` 事件路由到命令模块 |

### 4.2 命令模块

| 模块 | 职责 |
|------|------|
| `commands/index.js` | 命令注册中心，提供 `registerCommand` 和 `dispatchCommand` |
| `commands/selectorCommands.js` | 世界书选择器、固定/取消固定、预设切换等命令 |
| `commands/worldbookCommands.js` | 世界书导入、导出、创建、删除、重命名、重绑等命令 |
| `commands/titleBarCommands.js` | 标题栏入口：筛选、优化器、批量操作、AI 模式设置、打开 AI 工作区、回滚等 |
| `commands/entryCommands.js` | 条目级命令：展开、编辑、内容预览、AI 单条改写弹窗、应用 AI 预览等 |
| `commands/folderCommands.js` | 文件夹视图相关命令与交互 |

### 4.3 功能模块

| 模块 | 职责 |
|------|------|
| `activationTracker.js` | 追踪 AI 生成时激活过的条目并提供高亮 |
| `aiActions.js` | AI 改写基础能力：收集条目、解析单条/基础预览、应用预览并写回世界书 |
| `aiActionsBatch.js` | 当前 AI 工作区主实现：规划、分批预览、提示词组装、JSON 修复解析、批次上下文承接 |
| `batchActions.js` | 批量删除、复制、全选、位置调整、字段批量切换等 |
| `browserSettingsBackup.js` | 浏览器设置备份：按白名单导出/导入插件 localStorage 设置，并在导出时脱敏 AI 自定义 API Key |
| `bulkImport.js` | YAML 批量导入条目 |
| `folderMeta.js` | 文件夹元数据处理 |
| `history.js` | 事务快照、回滚预览、执行回滚 |
| `llmClient.js` | AI 请求封装，兼容当前预设与自定义 OpenAI 兼容接口，支持停止生成 |
| `optimizer.js` | 文本清理、关键词修复、结构整理、搜索替换等优化工具 |
| `sorting.js` | 排序、拖拽同步、UI 排序持久化 |

### 4.4 UI 模块

| 模块 | 职责 |
|------|------|
| `panel.js` | 主面板骨架、标签页、整体布局，包含 `AI 修改` 页签入口 |
| `list.js` | 条目列表渲染与虚拟滚动 |
| `detail.js` | 主从布局右侧详情区渲染与选择联动 |
| `entry.js` | 单条目 HTML 生成 |
| `editor.js` | 条目编辑器 |
| `contentEditor.js` | 大文本内容编辑器 |
| `largeContentPreview.js` | 长内容预览弹窗 |
| `floatingBatchDropdown.js` | 浮动批量操作下拉菜单 |
| `aiActionDialog.js` | 轻量 AI 改写弹窗，适合单条或已选条目的快速预览/应用 |
| `aiWorkspace.js` | 标准 AI 工作区，负责条目选择、规划、预览、调试信息、应用 |
| `aiWorkspaceDesktop.js` | 桌面布局下的 AI 工作区适配 |
| `masterEntryTokens.js` | 主从布局下条目 token 辅助展示 |
| `expandManager.js` | 展开/折叠状态维护 |
| `theme.js` | 主题、样式覆盖，以及主题弹窗内的浏览器设置导入导出入口 |

## 5. 核心架构

### 5.1 主面板命令链

主列表、标题栏、批量菜单等大部分操作仍然遵循统一命令分发：

```text
用户点击按钮
→ events.js 捕获 data-action
→ commands/*.js 解析上下文
→ features/*.js / api.js 执行业务
→ state.js / ui/*.js 刷新界面
```

这条链路仍然是整个编辑器的主骨架。

### 5.2 状态分层

当前代码不是“所有状态都只在 `state.js`”这一种结构，而是三层状态并存：

1. `state.js`
   主列表共享状态，如条目选择、筛选、展开、当前数据集。

2. `ui/aiWorkspace.js` 内部 `state`
   AI 工作区运行时状态，如：
   - 当前已加载的世界书条目
   - `selectedEntryUids`
   - `readonlyEntryUids`
   - `planningResult`
   - `previewResult`
   - 当前生成状态、停止标记、调试信息

3. `settings.js`
   持久化设置，如：
   - API 模式：当前预设 / 自定义覆盖
   - 自定义 API 配置
   - 可编辑字段
   - 破限提示词、指导提示词、规划提示词
   - `direct` / `plan` 两套 AI 工作区上下文

浏览器设置导入导出由 `features/browserSettingsBackup.js` 统一维护 localStorage 白名单，`ui/theme.js` 负责主题弹窗入口和导入后的界面刷新。

### 5.3 原子写回与事务历史

世界书变更统一通过 `api.js` 封装的更新函数提交：

```text
生成预览
→ 用户确认应用
→ aiActions.js / aiActionsBatch.js 形成 afterEntry
→ api.js.updateWorldbookEntries() 一次性写回
→ history.js 记录提交前快照
→ 支持回滚预览与真正回滚
```

这套机制适用于 AI 应用，也适用于删除、批量修改等高风险操作。

## 6. 开发指南

### 6.1 修改现有 AI 修改功能时优先看哪些文件

| 目标 | 优先查看 |
|------|----------|
| 改入口按钮或批量菜单 | `ui/panel.js`、`ui/floatingBatchDropdown.js`、`commands/titleBarCommands.js`、`commands/entryCommands.js` |
| 改 AI 工作区界面 | `ui/aiWorkspace.js`、`ui/aiWorkspaceDesktop.js` |
| 改轻量 AI 弹窗 | `ui/aiActionDialog.js` |
| 改默认提示词或 AI 设置持久化 | `settings.js` |
| 改规划 / 批量预览 / JSON 解析 | `features/aiActionsBatch.js` |
| 改写回逻辑 | `features/aiActions.js`、`api.js` |
| 改回滚 | `features/history.js` |
| 改实际 LLM 请求方式 | `features/llmClient.js` |

### 6.2 添加新功能

1. 先判断它属于命令入口、业务能力、界面渲染还是酒馆 API 封装
2. 优先把核心逻辑放进 `features/`
3. 由 `commands/*.js` 或 `ui/aiWorkspace.js` 暴露交互入口
4. 若涉及写回世界书，尽量走 `api.js` 统一封装
5. 若属于高风险批量操作，接入 `history.js`
6. 运行 `pnpm build` 做回归验证

### 6.3 常见排查方向

| 问题 | 排查方向 |
|------|----------|
| AI 工作区切页后状态丢失 | 检查 `settings.js` 持久化结构与 `refreshAiWorkspace()` |
| 生成预览失败 | 检查 `llmClient.js`、`aiActionsBatch.js` 的提示词、JSON 解析与自定义 API 配置 |
| 预览有结果但应用无变化 | 检查 diff 是否为空，以及 `applyAiPreview()` 只写回 changed 条目这一逻辑 |
| 回滚按钮不可用 | 检查本次操作是否开启事务记录，以及 `history.js` 中是否成功提交快照 |
| 主列表按钮无响应 | 检查 `data-action`、`events.js` 和对应 `commands/*.js` 是否已经注册 |

## 7. 技术栈

- **核心库**: jQuery
- **虚拟滚动**: Clusterize.js
- **拖拽排序**: jQuery UI Sortable
- **YAML 解析**: js-yaml
- **AI 调用**: 酒馆生成接口 + 自定义 OpenAI 兼容接口
- **构建工具**: Webpack
