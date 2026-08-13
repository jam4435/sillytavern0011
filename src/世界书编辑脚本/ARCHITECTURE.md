# 世界书编辑脚本 - 模块化架构文档

## 1. 简介

本文档说明 `src/世界书编辑脚本/` 当前代码的模块划分和主要数据流。

说明：

- 以仓库当前代码为准，不保留容易过期的行数统计
- `信息.txt`、`修改计划.txt`、导出 JSON、临时文件等不属于架构主体，不在本文档展开
- AI 工作台、PC 主从布局、主题与浏览器设置备份是相对独立的子系统；AI 工作台只保留一套容器响应式实现

## 2. 核心设计理念

- **分层模块化**：`commands/` 负责操作编排，`features/` 负责业务能力，`ui/` 负责界面，`api.js` 负责酒馆接口封装
- **主面板双布局、AI 单实现**：主面板移动端固定为抽屉式，PC 保存抽屉式或主从布局偏好；AI 工作台不按设备维护两套实现，而是按自身容器宽度响应式切换
- **状态分层**：主列表共享状态集中在 `state.js`；修改工作流的运行结果只在会话内存在；生成工作流则以独立 IndexedDB 项目保存蓝图、条目、对话、任务和修订
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
    │   ├── aiBatchPlanner.js
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
        ├── aiEntryVirtualList.js
        ├── aiWorkspace.js
        ├── aiWorkspaceDesktop.js
        ├── aiWorkflowState.js
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
| `aiActions.js`             | 轻量 AI 改写与统一写回能力：收集条目、生成单条/已选条目预览，并按 UID 返回应用成功、冲突、缺失及原因；AI 关键词能力仅覆盖主关键词     |
| `aiActionsBatch.js`        | AI 工作区主引擎：规划、直接/计划预览、提示词组装、上下文注入、批次执行、JSON 修复解析、诊断，以及统一预览结果归并；不向 AI 暴露次级关键词 |
| `aiBatchPlanner.js`        | AI 纯逻辑排批：直接模式固定每五个修改条目一批；规划模式按输出估算、复杂度、依赖图和软关联生成稳定批次                         |
| `batchActions.js`          | 批量字段更新、复制到其他世界书、删除、调序、全选；复制支持覆盖、重命名、保留原名策略                                                |
| `browserSettingsBackup.js` | 浏览器设置备份：按白名单导出/导入 localStorage，并在导出时脱敏自定义 API Key 和上传背景图 data URL                                  |
| `bulkImport.js`            | YAML 批量导入条目及导入弹窗                                                                                                         |
| `worldbookYaml.js`         | 共享 YAML codec：多文档解析、协议校验、内部条目转换和无 UID 连续序列化                                                              |
| `worldbookGenerationSchema.js` | 生成项目、蓝图、提案、任务和审计的数据契约与规范化                                                                               |
| `generationProjectStore.js` | IndexedDB 生成项目与修订持久层；提供多项目、归档、复制、导入导出、100 次修订裁剪和内存降级                                        |
| `worldbookGenerationProject.js` | 提案接受/拒绝、受影响分支失效以及项目撤销/重做                                                                                |
| `worldbookGenerationContext.js` | 按消息作用域组装资料、祖先、XML 同组、相关条目、摘要和最近对话                                                                 |
| `worldbookGenerationOrchestrator.js` | 蓝图、分组正文、对话提案、多轮审计修复、调用上限、停止和失败恢复的 AI 调度                                                 |
| `worldbookGenerationAudit.js` | 对蓝图和最终条目执行架构、激活、顺序、位置、XML、格式和内容审计                                                                |
| `worldbookGenerationApply.js` | 追加/最小更新原子写回、新书创建事务、绑定动作、基线冲突检查和严格创建回滚                                                      |
| `entryTogglePresets.js`    | 按世界书名称保存条目组预设，记录条目 UID、启用状态和策略类型；受控改名时迁移预设命名空间                                            |
| `folderMeta.js`            | 用隐藏元条目保存文件夹元数据，提供文件夹 CRUD、条目归属修改和渲染过滤                                                               |
| `history.js`               | 最近一次高风险操作的事务快照、回滚预览、执行回滚                                                                                    |
| `llmClient.js`             | LLM 请求封装，兼容酒馆当前预设与自定义 OpenAI 兼容接口，支持流式、超时和停止生成                                                    |
| `optimizer.js`             | 格式清理、关键词修复、深度整理、八股词清理、全局搜索替换、世界书对比预览与差异写回                                                  |
| `optimizerCompare.js`      | 世界书全本比对纯 helper：构建差异结果、保留筛选原始索引、生成新增/删除/正文/关键词/条目设置/整条覆盖写回计划                           |
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
| `aiWorkspace.js`           | AI 工作区稳定外观层，只导出 `initAiWorkspace`、`refreshAiWorkspace`、`resetAiWorkspace` 并委托给唯一实现 |
| `aiEntryVirtualList.js`    | AI 条目列表的内部虚拟化适配器：向 Clusterize 传宿主 document 的 DOM 节点，并在依赖缺失或构造失败时降级为普通列表 |
| `aiWorkspaceDesktop.js`    | 单一容器响应式 AI 修改工作台（文件名为历史兼容），包含四阶段工作流、条目加载状态、API 抽屉及手机式助手 dialog |
| `aiGenerationWorkspace.js` | 生成项目工作区：资料、蓝图、条目、审计视图，持续对话轨道，提案检查点、YAML 交付和新书绑定操作                        |
| `aiWorkflowState.js`       | AI 工作流纯逻辑层：阶段守卫、派生按钮能力、输入失效矩阵、生成生命周期及条目三态选择                   |
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

`initPanel()` 会初始化 AI 工作区。无论主面板当前是抽屉还是 PC 主从布局，`initAiWorkspace()` 都进入同一实现；工作台使用容器宽度在宽屏主从、紧凑单栏和窄屏全屏抽屉之间切换，切换时不重建任务状态。

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

移动端条目行的上下箭头通过 `entryCommands.js → sorting.js::planEntryMove()` 工作。只支持自定义、优先级和逆优先级：自定义调整完整 UID 排序；优先级模式把条目移动到当前同区可见相邻项的实际位置槽，并更新 `position`/`order`，保证重排后显示顺序与世界书实际注入顺序一致。置顶项、置顶边界、文件夹边界和不支持的排序方式会禁用按钮。一次有效移动只进行一次 `api.js.updateWorldbookEntries()` 写回；普通虚拟列表仅一次 `Clusterize.update()`，文件夹列表只交换受影响的 DOM 行，不重新读取世界书或重建面板。

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
→ ui/aiWorkspace.js 进入 ui/aiWorkspaceDesktop.js 的唯一响应式工作台
→ settings.js 读取 schemaVersion: 3 的 activeMode、修改策略、活动生成项目 ID 和共享模型设置
→ aiWorkflowState.js 派生当前阶段、可进入阶段和主动作能力
→ 条目范围以“修改 / 只读 / 排除”三态选择；搜索覆盖标题、UID、正文
→ API 设置通过工具抽屉编辑；AI 助手使用独立原生 dialog 手机窗，并可按需附带当前选中的修改/只读条目
→ aiActionsBatch.js 生成结构化规划或预览
→ llmClient.js 调用酒馆预设或自定义 OpenAI 兼容接口
→ 修改预览请求正式开始时立即进入修改审阅页，并在原位展示加载进度、停止、失败诊断和重试入口
→ 工作台展示结构化计划、字段差异、诊断和可编辑结果
→ aiActions.js / api.js 按 UID 部分写回并记录事务
→ 成功进入完成态；部分冲突只移除成功项，保留冲突项供重试
```

工作流固定为 `准备 → 修改审阅 → 完成`；选择 `先规划` 策略时插入 `计划审阅`。直接策略至少需要一条可修改条目，规划策略允许零手动选择并分析整本世界书。输入校验通过且修改预览请求正式开始后，阶段立即切换到 `修改审阅`；生成失败或停止仍停留在审阅页，由用户选择重试或返回。阶段跳转由状态层守卫，不能进入尚未满足条件的未来阶段。

AI 条目虚拟列表必须把父页面创建的 `scrollElem` / `contentElem` 节点直接交给 Clusterize，不能依赖脚本 iframe 内的 ID 查询。世界书读取使用递增加载 runId，只有当前目标可更新条目和计数；界面分别呈现加载中、真实空世界书和加载失败。Clusterize 缺失或初始化异常时保留全部普通条目行，并显示虚拟滚动降级提示。隐藏文件夹元条目仍在业务收集层过滤。

AI 助手与 API 设置抽屉不共享外壳样式。助手是原生 `<dialog>`：宽度不小于 720px 时为右侧 404px 悬浮手机窗，441–719px 居中显示并保留边距，最多 440px 时才自然全屏。内部使用状态区、聊天/资料 tabs、消息 `role="log"`、固定输入栏和备忘录式资料页；打开、Esc/背景关闭、焦点恢复、tab 键盘切换及 reduced-motion 都由同一实现处理。参考资料仍绑定同一个 `referenceMaterial`，不改变请求注入语义。助手输入栏可分别勾选“修改条目”和“只读条目”，发送时从当前模式采集最新选择快照并显式注入提示词；排除条目不会发送。助手上下文与修改请求都只携带主关键词，不读取或生成 `keys_secondary`。

计划审阅以目标、保留项、改写规则、一致性要求、条目分组和 `entry_tasks` 执行图为结构化真值，并与高级区原始 JSON 双向同步；每个修改任务包含目标、复杂度、预估输出 tokens、硬依赖和软关联。JSON 非法、UID 重复、未知、分组重叠、任务覆盖不完整或依赖无效时禁止继续。聊天上下文默认保存结构化消息，用户手工编辑后明确切换为手工文本模式，刷新上下文才恢复结构化模式。

预览统一返回 `outcome: complete | partial | cancelled | failed`，部分成功和停止结果不会丢弃已完成条目。直接模式每五个修改条目一批，修改条目超过八个时在生成前推荐转入规划模式；只读条目和输入 token 不参与拆批。规划模式由计划中的逐条任务、输出估算、复杂度、硬依赖和软关联派生批次，跨批依赖失败时跳过下游任务。输入 token 阈值只产生非阻断警告，输出预留 token 仍限制实际响应并作为规划排批容量。多批次保持顺序执行，单条重新生成与整次任务共享 generationId、runId 和停止生命周期。应用结果返回 `appliedUids` 与逐 UID 的 `skipped: { uid, reason }[]`；写回仍执行字段白名单、完整 `beforeEntry` 冲突检测、隐藏元条目过滤和事务快照。

修改审阅阶段的单条操作：排除是 `accepted: false` 软标记，可随时恢复，被排除项灰显且不计入应用；应用只写回未排除且有变更的条目，若有被排除的有效修改会先确认丢弃。玩家手工编辑预览字段时先整体解析校验再一次性写入（解析失败不产生半写状态），首次编辑会备份 AI 原始 `afterEntry` 并打 `userEdited` 标记，支持“恢复 AI 原始建议”；对已手改条目执行单条重新生成前需确认覆盖。AI 审阅可编辑字段中的“关键词”仅对应 `strategy.keys`，完整条目快照仍用于冲突检测，`strategy.keys_secondary` 在生成、审阅和写回时保持原值。`applyAiPreview` 额外支持 `accepted` 软排除过滤和可选 `uids` 子集参数。

带 UID 的生成失败条目会以占位行出现在预览列表中，支持单条重试；重试成功后并入预览条目并从 `errors` 中移除。左列表的正文差异统一使用 `aiActionsBatch.js` 导出的 `buildContentDiffSnippets` 行级片段（含上下文与重同步），渲染层对超长片段做字符截断，完整内容仍在右侧详情的编辑区查看。

### 5.6 世界书生成链路

`世界书生成` 是和 `直接修改 / 先规划` 同级的工作模式，但不写入修改策略字段。它委托给
`aiGenerationWorkspace.js`，按 `准备 → 结构审阅 → 条目审阅 → 完成` 推进：

```text
资料、项目规则与目标
→ worldbookGenerationOrchestrator.js 生成带 baseRevision 的蓝图提案
→ 确定性审计与最多两轮硬错误修复
→ 用户接受完整结构蓝图
→ 按领域、父子依赖和 XML 组串行生成批次；每批完成即保存
→ 全局确定性审计 + 一轮语义审计
→ 用户接受最终条目提案，可按完整主题/XML 组取舍并重新审计
→ 导出 YAML / 原子追加已有世界书 / 创建新世界书
```

每项目同一时刻只保存一个未决修改提案；普通问答可以继续，但有未决提案时新的修改请求不会覆盖它。对话消息携带意图、作用域和有效期。上下文只组装相关资料、必要祖先、同一 XML 组、相关已有条目、长期规则、滚动摘要和最近 8 条消息；完整对话仍随项目持久化。冲突资料形成阻断卡，不按时间自动覆盖。

调用计划默认串行，单操作上限 20 次；超过上限需要用户确认。停止会保留成功批次，失败任务可独立重试，依赖失败的下游任务标记为跳过。所有 AI 结构或正文变动先进入提案；接受提案后才增加项目修订。人工编辑已接受条目同样记录为可撤销修订。

共享 `worldbookYaml.js` 负责多文档 YAML 往返和协议校验。旧 YAML 的 `uid` 只兼容读取，内部忽略且永不序列化；Normal 条目必须有主关键词。XML 开始/结束边界继承直属分点的稳定关键词作为可移植保底。批量导入与生成交付使用同一 codec。

追加已有世界书会在最终写入前重读完整目标，隐藏元条目不发给 AI 但参与 UID 分配；既有最小更新必须通过 UID 和生成时指纹检查。新增与必要结构更新一次原子提交并共用事务回滚。新建世界书记忆创建快照，只有内容完全未变且没有角色、聊天或全局绑定时才允许整本删除；绑定动作独立于创建事务。

### 5.7 状态分层

当前代码有五类状态边界：

1. `state.js`
   主列表运行时状态：世界书条目缓存、筛选、搜索结果、选择、展开、详情区、文件夹、对比、最近事务、布局和替换锁。

2. `ui/aiWorkspaceDesktop.js` / `ui/aiWorkflowState.js`
   AI 修改会话状态：当前阶段、规划、预览、调试、进度、当前详情、generationId/runId 和停止标记。这些状态不跨页面刷新恢复；策略切换或输入变更会按失效矩阵清除不再可信的派生结果。

3. `generationProjectStore.js`
   生成项目完整状态存入 IndexedDB `lorebook-ai-generation-projects` 的 `projects` 与 `revisions`；刷新后运行任务恢复为 `interrupted`。写入失败时保留内存副本，并在工作区提示导出项目 JSON。

4. `settings.js` / `theme.js`
   跨会话浏览器设置：主题、搜索栏、全屏、PC 布局、分栏宽度、悬浮球位置、复制冲突策略、置顶条目、AI
   API 设置和 `schemaVersion: 3` 的修改 `draft`、`activeMode`、`modifyStrategy`、`activeGenerationProjectId`。v2 自动迁移且不改变既有 direct/plan 草稿；localStorage 不保存生成项目正文。

5. 世界书隐藏元条目 `folderMeta.js` 用 `__WI_META_FOLDERS__` 条目保存文件夹结构；渲染和 AI 收集时会过滤这些元条目。

### 5.8 写回与回滚

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

接入事务的操作包括 AI 应用、批量更新、复制覆盖、批量删除、批量导入、文件夹元数据修改，以及世界书全本比对的批量新增/删除差异条目、覆盖正文、覆盖关键词、覆盖条目设置、覆盖整条等。

全本比对弹窗的写回方向以结果摘要中的 `当前世界书 ← 对比世界书` 为准；“交换方向”会强制重新读取两本世界书并反转 base/target，使新增、删除、覆盖的作用对象一起反转。

全本比对的修改列表以界面可比较字段为准，包括正文、关键词和条目设置；未展开字段的差异不会单独生成修改条目。对已经存在可见差异的条目，“覆盖整条”仍会同步目标条目的完整数据并保留当前 UID。

世界书改名通过携带完整条目创建新名称后删除旧名称，以保留 UID。改名成功后，`entryTogglePresets.js`
将旧世界书名称下的预设整体迁移到新名称；若新名称存在残留预设，以被改名世界书的预设为准。

## 6. 开发指南

### 6.1 修改功能时优先看哪些文件

| 目标                                   | 优先查看                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| 改入口按钮、主面板、最小化或悬浮球     | `ui/panel.js`、`events.js`、`settings.js`                                                 |
| 改 PC 主从布局                         | `ui/detail.js`、`ui/list.js`、`ui/entry.js`、`ui/theme.js`、`settings.js`                 |
| 改列表、筛选、选择、虚拟滚动           | `ui/list.js`、`ui/entry.js`、`events.js`、`state.js`                                      |
| 改 AI 工作区界面或阶段守卫             | `ui/aiWorkspace.js`、`ui/aiWorkspaceDesktop.js`、`ui/aiGenerationWorkspace.js`、`ui/aiWorkflowState.js` |
| 改 AI 规划 / 批量预览 / JSON 解析      | `features/aiActionsBatch.js`                                                              |
| 改世界书生成项目或调度                  | `features/worldbookGeneration*.js`、`features/generationProjectStore.js`                  |
| 改 YAML 协议或批量导入                  | `features/worldbookYaml.js`、`features/bulkImport.js`                                     |
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
| AI 工作区切页后状态丢失  | 修改模式检查 `settings.js`；生成模式检查活动项目 ID、IndexedDB 存储状态和 `refreshAiGenerationWorkspace()` |
| 生成预览失败             | 检查 `llmClient.js`、`aiActionsBatch.js` 的提示词、分批、JSON 解析、诊断信息和自定义 API 配置  |
| 预览有结果但应用无变化   | 检查 diff 是否为空、`applyAiPreview()` 的 changed 条目过滤和 `api.js` 写回结果                 |
| 回滚按钮不可用           | 检查本次操作是否开启 `trackHistory`，以及 `history.js` 是否提交了最近事务                      |
| 文件夹显示异常           | 检查隐藏元条目、`folderMeta.js` 的解析结果和 `state.js` 的文件夹会话                           |
| 浏览器设置导入后未刷新   | 检查 `theme.js` 的导入入口、`browserSettingsBackup.js` 白名单和导入后的 UI 刷新                |

## 7. 技术栈

- **核心库**: jQuery
- **虚拟滚动**: Clusterize.js
- **拖拽排序**: jQuery UI Sortable
- **YAML 解析与校验**: `yaml` + `zod`
- **AI 调用**: 酒馆生成接口 + 自定义 OpenAI 兼容接口
- **构建工具**: Webpack
