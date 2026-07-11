# 世界书编辑脚本 - 模块化架构文档

## 1. 简介

本文档说明 `src/世界书编辑脚本/` 当前代码的模块划分和主要数据流。

说明：

- 以仓库当前代码为准，不保留容易过期的行数统计
- `信息.txt`、`修改计划.txt`、导出 JSON、临时文件等不属于架构主体，不在本文档展开
- `AI 修改`、PC 主从布局、主题与浏览器设置备份现在都是相对独立的子系统

## 2. 核心设计理念

- **分层模块化**：`commands/` 负责操作编排，`features/` 负责业务能力，`ui/` 负责界面，`api.js` 负责酒馆接口封装
- **双布局并存**：移动端的有效布局固定为抽屉式，PC 使用独立保存的抽屉式或主从布局偏好；跨设备模式时同步面板属性并重渲染当前页
- **状态分层**：主列表共享状态集中在 `state.js`；AI 工作区有模块内状态；跨会话偏好写入 `settings.js` 或主题存储
- **命令驱动 + 局部直绑并存**：主面板遵循 `events.js -> commands/*.js`
  的命令分发；AI 工作区、编辑器、优化器、悬浮球等复杂交互在对应 UI 模块或 `events.js` 内部直绑
- **事务化写回**：世界书更新通过 `api.js` 统一提交，高风险操作用 `history.js` 记录提交前快照
- **预览优先**：AI 应用、全局搜索替换、世界书对比、回滚等操作尽量先生成预览，再执行写回

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
    │   ├── entryTogglePresets.js
    │   ├── folderMeta.js
    │   ├── history.js
    │   ├── llmClient.js
    │   ├── optimizer.js
    │   ├── optimizerCompare.js
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

| 模块          | 职责                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `index.js`    | 入口文件，初始化面板、主题、编辑器、优化器、导入器、详情布局和酒馆事件集成                                                        |
| `config.js`   | DOM ID、CSS 类名、标签页、存储键名等常量；仍有少量历史遗留的可变运行态槽位                                                        |
| `settings.js` | `localStorage` 读写：搜索栏、全屏、PC 布局、分栏宽度、悬浮球位置、复制冲突策略、置顶条目、AI 工作区设置                           |
| `state.js`    | 主列表运行时状态：条目缓存、筛选、搜索结果、选择、展开、详情区、文件夹会话、对比会话、最近事务、布局和异步锁                      |
| `utils.js`    | 通用工具：localStorage 包装、UID 规范化、错误包装、移动端判断、文件选择/下载、旧格式转换；localStorage 不可用时只做会话级内存兜底 |
| `api.js`      | 酒馆接口封装：世界书读取、创建、删除、重命名、重绑、条目增删改、字段保存，并统一接入事务历史                                      |
| `events.js`   | 主面板事件中心：构造命令上下文、分发 `data-action`，并维护搜索、编辑器、优化器、悬浮球拖拽等直绑事件                              |

### 4.2 命令模块

| 模块                            | 职责                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `commands/index.js`             | 命令注册中心，提供 `registerCommand`、`registerCommands`、`dispatchCommand`                                   |
| `commands/selectorCommands.js`  | 全局世界书启用/禁用、固定/取消固定、预设保存/应用/删除                                                        |
| `commands/worldbookCommands.js` | 世界书导入、导出、创建、删除、重命名、替换角色世界书、设为角色/聊天世界书、优化器对比目标选择                 |
| `commands/titleBarCommands.js`  | 标题栏入口：筛选、优化器、批量导入、复制/删除/调序、批量字段切换、AI 选择模式、打开 AI 工作区、回滚、新增条目 |
| `commands/entryCommands.js`     | 条目级命令：展开、行内字段编辑、启用/常驻切换、内容/对比编辑器、AI 快速改写、选择、置顶                       |
| `commands/folderCommands.js`    | 文件夹创建、重命名、删除、分配/移出条目、导入/导出文件夹条目                                                  |

### 4.3 功能模块

| 模块                       | 职责                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `activationTracker.js`     | 追踪 `WORLD_INFO_ACTIVATED` 激活过的条目并提供高亮筛选                                                                              |
| `aiActions.js`             | 轻量 AI 改写能力：收集条目、生成单条/已选条目预览、应用预览                                                                         |
| `aiActionsBatch.js`        | AI 工作区主引擎：规划、直接/计划预览、提示词组装、聊天上下文/参考资料/只读条目注入、token 分批、JSON 修复解析、兼容性诊断、应用预览 |
| `batchActions.js`          | 批量字段更新、复制到其他世界书、删除、调序、全选；复制支持覆盖、重命名、保留原名策略                                                |
| `browserSettingsBackup.js` | 浏览器设置备份：按白名单导出/导入 localStorage，并在导出时脱敏自定义 API Key 和上传背景图 data URL                                  |
| `bulkImport.js`            | YAML 批量导入条目及导入弹窗                                                                                                         |
| `entryTogglePresets.js`    | 按世界书名称保存条目组预设，记录条目 UID、启用状态和策略类型；受控改名时迁移预设命名空间                                            |
| `folderMeta.js`            | 用隐藏元条目保存文件夹元数据，提供文件夹 CRUD、条目归属修改和渲染过滤                                                               |
| `history.js`               | 最近一次高风险操作的事务快照、回滚预览、执行回滚                                                                                    |
| `llmClient.js`             | LLM 请求封装，兼容酒馆当前预设与自定义 OpenAI 兼容接口，支持流式、超时和停止生成                                                    |
| `optimizer.js`             | 格式清理、关键词修复、深度整理、八股词清理、全局搜索替换、世界书对比预览与差异写回                                                  |
| `optimizerCompare.js`      | 世界书全本比对纯 helper：构建差异结果、保留筛选原始索引、生成新增/删除/正文/关键词/条目设置写回计划                                  |
| `sorting.js`               | 排序偏好、拖拽排序、UI 排序持久化、同步顺序到世界书                                                                                 |

### 4.4 UI 模块

| 模块                       | 职责                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `panel.js`                 | 主面板骨架、标签页、全局样式、打开/关闭/最小化、悬浮球、AI 页签入口                                   |
| `list.js`                  | 世界书列表、标题栏、全局选择器、预设、虚拟滚动、主从布局列表、文件夹分组、计数/token 展示、回滚按钮   |
| `detail.js`                | PC 主从布局右侧详情区、分栏宽度、详情选择恢复、字段延迟保存、布局模式同步                             |
| `entry.js`                 | 条目 HTML 生成，覆盖抽屉、移动端、主从列表行的展示                                                    |
| `editor.js`                | 传统条目编辑弹窗                                                                                      |
| `contentEditor.js`         | 大文本内容编辑器、正文对比编辑器、对比结果跳转编辑                                                    |
| `largeContentPreview.js`   | 长内容折叠预览卡片                                                                                    |
| `floatingBatchDropdown.js` | 标题栏批量菜单的浮动定位                                                                              |
| `aiActionDialog.js`        | 轻量 AI 改写弹窗，适合单条或已选条目的快速预览/应用                                                   |
| `aiWorkspace.js`           | 抽屉/移动端 AI 工作区实现，并在 PC 主从布局下委托给 `aiWorkspaceDesktop.js`                           |
| `aiWorkspaceDesktop.js`    | PC 主从布局 AI 工作区，提供 API 设置、直接修改、计划修改等导航和分步流程；`世界书生成` 目前是占位入口 |
| `masterEntryTokens.js`     | 主从布局条目 token 徽标计算与刷新                                                                     |
| `expandManager.js`         | 抽屉/移动端条目展开折叠状态同步                                                                       |
| `theme.js`                 | 版本化主题存储、布局主题切换、CSS 变量应用、主题弹窗、浏览器设置导入导出入口                          |

## 5. 核心架构

### 5.1 初始化链路

```text
index.js
→ loadSortPreference()
→ initPanel() / initTheme() / initDetailView()
→ createEditorPanel() / initOptimizer() / initBulkImport() / initContentEditor()
→ bindEventListeners() / bindSearchEvents()
→ 监听 APP_READY、CHAT_CHANGED、WORLD_INFO_ACTIVATED、GENERATION_FINISHED
```

`initPanel()` 会初始化 AI 工作区；`initAiWorkspace()` 根据当前布局决定使用抽屉版还是 PC 主从版。

### 5.2 主面板命令链

主列表、标题栏、批量菜单等大部分操作遵循统一命令分发：

```text
用户触发 data-action
→ events.js 识别选择器 / 标题栏 / 文件夹 / 条目 / 弹窗上下文
→ commands/*.js 执行命令
→ features/*.js / api.js 执行业务
→ state.js / ui/*.js 刷新界面
```

复杂弹窗和持续交互不完全走命令链，例如 AI 工作区内部表单、优化器弹窗部分按钮、条目编辑器提交、悬浮球拖拽。

### 5.3 主列表渲染链

```text
打开角色/全局页签
→ ui/list.js 读取世界书与固定/预设设置
→ folderMeta.js 过滤隐藏元条目并恢复文件夹会话
→ sorting.js 应用排序
→ 抽屉/移动端：entry.js + Clusterize + expandManager.js
→ PC 主从：list.js 渲染 master 列表，detail.js 渲染右侧详情
```

`state.js`
保存当前条目缓存、筛选/搜索、选择、展开、详情选中项和文件夹折叠状态，便于刷新后恢复局部 UI。条目文件夹没有会话记录时默认折叠，用户本次会话中的展开/折叠操作会覆盖这个默认值。

移动端不会改写
`lorebook-pc-layout-mode`：其有效布局始终为抽屉式；返回 PC 后恢复此前保存的抽屉式或主从布局。视口跨设备模式时会先同步
`data-device-mode` / `data-pc-layout-mode`，再重渲染当前标签和对应 AI 工作区。

### 5.4 插入位置模型

世界书条目插入位置统一通过 `modules/position.js` 映射。普通位置直接写入 `position.type`；三种深度位置都写入
`position.type: 'at_depth'`，并用 `position.role` 区分消息身份。

| 界面选项          | 存档字段                                                    |
| ----------------- | ----------------------------------------------------------- |
| 角色定义前        | `position.type = 'before_character_definition'`             |
| 角色定义后        | `position.type = 'after_character_definition'`              |
| 示例消息前（↑EM） | `position.type = 'before_example_messages'`                 |
| 示例消息后（↓EM） | `position.type = 'after_example_messages'`                  |
| 作者注释前        | `position.type = 'before_author_note'`                      |
| 作者注释后        | `position.type = 'after_author_note'`                       |
| @D [系统]在深度   | `position.type = 'at_depth'`, `position.role = 'system'`    |
| @D [用户]在深度   | `position.type = 'at_depth'`, `position.role = 'user'`      |
| @D [AI]在深度     | `position.type = 'at_depth'`, `position.role = 'assistant'` |

`at_depth_as_system`、`at_depth_as_user`、`at_depth_as_assistant` 只作为 UI 下拉框和旧格式导入的内部兼容值，不能原样写入
`position.type`。

### 5.5 AI 工作区链路

```text
AI 页签
→ ui/aiWorkspace*.js 读取 settings.js 中的 API、提示词、direct/plan 状态
→ 选择可编辑条目、只读条目、聊天上下文、参考资料、修改指令
→ aiActionsBatch.js 生成规划或预览
→ llmClient.js 调用酒馆预设或自定义 OpenAI 兼容接口
→ ui/aiWorkspace*.js 展示预览、调试信息、诊断和可编辑结果
→ aiActionsBatch.js / api.js 写回世界书并记录事务
```

`direct` 模式直接从选中条目生成预览；`plan` 模式先产出 `readonly_uids`、`editable_uids` 和整体方案，再用计划驱动预览。

### 5.6 状态分层

当前代码有四类状态边界：

1. `state.js`
   主列表运行时状态：世界书条目缓存、筛选、搜索结果、选择、展开、详情区、文件夹、对比、最近事务、布局和替换锁。

2. `ui/aiWorkspace.js` / `ui/aiWorkspaceDesktop.js`
   AI 工作区运行时状态：当前导航、当前步骤、生成状态、停止标记、模型列表、聊天上下文、参考资料、助手对话，以及 `direct`
   / `plan` 各自的条目选择、规划和预览。

3. `settings.js` / `theme.js`
   跨会话浏览器设置：主题、搜索栏、全屏、PC 布局、分栏宽度、悬浮球位置、复制冲突策略、置顶条目、AI
   API/提示词/工作区状态。AI 设置过大时会降级为轻量保存；localStorage 不可用时的内存兜底刷新后会丢失。

4. 世界书隐藏元条目 `folderMeta.js` 用 `__WI_META_FOLDERS__` 条目保存文件夹结构；渲染和 AI 收集时会过滤这些元条目。

### 5.7 写回与回滚

世界书变更统一通过 `api.js` 的封装提交：

```text
UI 命令或 AI 应用
→ features/*.js 形成最终 entries 或字段变更
→ api.js.updateWorldbookEntries() / createLorebookEntries() / deleteLorebookEntries()
→ 可选 trackHistory 创建事务快照
→ 酒馆助手 API 原子写回
→ history.js 提交最近事务
→ titleBarCommands.js + list.js 提供回滚预览和回滚入口
```

接入事务的操作包括 AI 应用、批量更新、复制覆盖、批量删除、批量导入、文件夹元数据修改，以及世界书全本比对的批量新增/删除差异条目、覆盖正文、覆盖关键词、覆盖条目设置等。

全本比对弹窗的写回方向以结果摘要中的 `当前世界书 ← 对比世界书` 为准；“交换方向”会强制重新读取两本世界书并反转 base/target，使新增、删除、覆盖的作用对象一起反转。

世界书改名通过携带完整条目创建新名称后删除旧名称，以保留 UID。改名成功后，`entryTogglePresets.js`
将旧世界书名称下的预设整体迁移到新名称；若新名称存在残留预设，以被改名世界书的预设为准。

## 6. 开发指南

### 6.1 修改功能时优先看哪些文件

| 目标                                   | 优先查看                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| 改入口按钮、主面板、最小化或悬浮球     | `ui/panel.js`、`events.js`、`settings.js`                                                 |
| 改 PC 主从布局                         | `ui/detail.js`、`ui/list.js`、`ui/entry.js`、`ui/theme.js`、`settings.js`                 |
| 改列表、筛选、选择、虚拟滚动           | `ui/list.js`、`ui/entry.js`、`events.js`、`state.js`                                      |
| 改 AI 工作区界面                       | `ui/aiWorkspace.js`、`ui/aiWorkspaceDesktop.js`                                           |
| 改 AI 规划 / 批量预览 / JSON 解析      | `features/aiActionsBatch.js`                                                              |
| 改轻量 AI 弹窗                         | `ui/aiActionDialog.js`、`features/aiActions.js`、`commands/entryCommands.js`              |
| 改实际 LLM 请求方式                    | `features/llmClient.js`                                                                   |
| 改世界书导入、导出、创建、重命名、重绑 | `commands/worldbookCommands.js`、`api.js`、`features/entryTogglePresets.js`、`ui/list.js` |
| 改批量复制、删除、调序、字段修改       | `features/batchActions.js`、`commands/titleBarCommands.js`、`api.js`                      |
| 改文件夹功能                           | `commands/folderCommands.js`、`features/folderMeta.js`、`ui/list.js`、`state.js`          |
| 改回滚                                 | `features/history.js`、`commands/titleBarCommands.js`、`ui/list.js`、`api.js`             |
| 改主题或浏览器设置备份                 | `ui/theme.js`、`features/browserSettingsBackup.js`、`settings.js`、`config.js`            |
| 改优化器或世界书对比                   | `features/optimizer.js`、`features/optimizerCompare.js`、`events.js`、`ui/contentEditor.js` |

### 6.2 添加新功能

1. 先判断它属于命令入口、业务能力、界面渲染、设置持久化还是酒馆 API 封装
2. 用户触发入口优先注册到 `commands/*.js`，复杂工作区内部交互可在对应 UI 模块内绑定
3. 核心业务逻辑优先放进 `features/`
4. 涉及世界书写回时尽量走 `api.js` 统一封装
5. 高风险批量操作接入 `trackHistory` 和 `history.js`
6. 涉及跨会话偏好时写入 `settings.js`；主题相关写入 `theme.js`
7. 运行 `pnpm build` 做回归验证

### 6.3 常见排查方向

| 问题                     | 排查方向                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| 主列表按钮无响应         | 检查 `data-action`、`events.js` 上下文识别和 `commands/*.js` 注册                              |
| PC/移动端布局不一致      | 检查 `settings.js` 的 PC 布局设置、`detail.js` 的 `data-pc-layout-mode`、`theme.js` 的布局主题 |
| 列表刷新后选择或详情丢失 | 检查 `state.js` 的选择、详情、文件夹会话，以及 `list.js` 的刷新恢复逻辑                        |
| AI 工作区切页后状态丢失  | 检查 `settings.js` 的 `direct` / `plan` 持久化结构和 `refreshAiWorkspace()`                    |
| 生成预览失败             | 检查 `llmClient.js`、`aiActionsBatch.js` 的提示词、分批、JSON 解析、诊断信息和自定义 API 配置  |
| 预览有结果但应用无变化   | 检查 diff 是否为空、`applyAiPreview()` 的 changed 条目过滤和 `api.js` 写回结果                 |
| 回滚按钮不可用           | 检查本次操作是否开启 `trackHistory`，以及 `history.js` 是否提交了最近事务                      |
| 文件夹显示异常           | 检查隐藏元条目、`folderMeta.js` 的解析结果和 `state.js` 的文件夹会话                           |
| 浏览器设置导入后未刷新   | 检查 `theme.js` 的导入入口、`browserSettingsBackup.js` 白名单和导入后的 UI 刷新                |

## 7. 技术栈

- **核心库**: jQuery
- **虚拟滚动**: Clusterize.js
- **拖拽排序**: jQuery UI Sortable
- **YAML 解析**: js-yaml
- **AI 调用**: 酒馆生成接口 + 自定义 OpenAI 兼容接口
- **构建工具**: Webpack
