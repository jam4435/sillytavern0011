# 世界书编辑脚本 - 模块化架构文档

## 1. 简介

本文档说明"世界书编辑脚本"的模块化代码组织方式和核心设计理念。

## 2. 核心设计理念

- **模块化**: 代码拆分为高内聚、低耦合的 ES6 模块
- **单一职责**: 每个模块只负责一项明确功能
- **状态与视图分离**: 状态集中在 `state.js`，视图在 `ui/` 目录
- **事件委托**: 在父容器上设置统一监听器，通过 `data-action` 属性区分操作

## 3. 文件结构

```
src/世界书编辑脚本/
├── index.js                 # 入口文件 (189行)
└── modules/
    ├── api.js               # API 交互封装 (343行)
    ├── config.js            # 静态常量配置 (72行)
    ├── events.js            # 事件分发器 (~760行)
    ├── settings.js          # 用户设置读写 (99行)
    ├── state.js             # 全局共享状态 (300行)
    ├── utils.js             # 通用工具函数 (288行)
    │
    ├── commands/            # 命令模块 (命令模式)
    │   ├── index.js              # 命令注册中心 (~80行)
    │   ├── selectorCommands.js   # 全局世界书选择器命令 (~200行)
    │   ├── worldbookCommands.js  # 世界书管理命令 (~270行)
    │   ├── titleBarCommands.js   # 标题栏操作命令 (~210行)
    │   └── entryCommands.js      # 条目操作命令 (~230行)
    │
    ├── features/            # 功能模块
    │   ├── activationTracker.js  # 激活条目追踪 (79行)
    │   ├── batchActions.js       # 批量操作 (490行)
    │   ├── bulkImport.js         # YAML批量导入 (476行)
    │   ├── optimizer.js          # 优化工具集 (673行)
    │   └── sorting.js            # 排序功能 (289行)
    │
    └── ui/                  # UI 模块
        ├── contentEditor.js # 内容编辑器 (298行)
        ├── editor.js        # 条目编辑器 (309行)
        ├── entry.js         # 条目HTML生成 (211行)
        ├── expandManager.js # 展开状态管理
        ├── list.js          # 列表渲染 (1141行)
        ├── panel.js         # 主面板 (2119行)
        └── theme.js         # 主题设置 (291行)
```

**总计**: 23个JS模块，约10500行代码

## 4. 模块说明

### 4.1 核心模块

| 模块 | 职责 |
|------|------|
| `index.js` | 入口文件，初始化所有模块，设置酒馆事件集成 |
| `config.js` | 定义 DOM ID、CSS 类名、localStorage 键名等常量 |
| `settings.js` | 封装 localStorage 读写，管理用户设置持久化 |
| `state.js` | 唯一的运行时数据中心，存储条目数据、选中/展开状态、筛选条件等 |
| `utils.js` | 通用工具函数：UID处理、错误包装、文件操作等 |
| `api.js` | 封装酒馆API调用：条目CRUD、世界书管理、全局世界书操作 |
| `events.js` | 事件分发器，绑定事件监听并分发到命令模块 |

### 4.2 UI 模块

| 模块 | 职责 |
|------|------|
| `panel.js` | 创建主面板HTML骨架和CSS样式 |
| `list.js` | 条目列表渲染，集成 Clusterize.js 虚拟滚动 |
| `entry.js` | 生成单个条目的HTML字符串 |
| `editor.js` | 条目编辑模态框 |
| `contentEditor.js` | 独立的全屏内容编辑器 |
| `theme.js` | 主题设置和原生UI覆盖 |

### 4.3 功能模块

| 模块 | 职责 |
|------|------|
| `activationTracker.js` | 追踪AI生成时激活的条目，提供高亮显示 |
| `batchActions.js` | 批量删除、复制、全选、调整位置等操作 |
| `bulkImport.js` | YAML格式批量导入条目 |
| `optimizer.js` | 格式清理、关键字修复、顺序重排、深度合并、全局搜索替换 |
| `sorting.js` | 数据排序和UI拖拽排序 |

### 4.4 命令模块

| 模块 | 职责 |
|------|------|
| `commands/index.js` | 命令注册中心，提供 `registerCommand` 和 `dispatchCommand` |
| `commands/selectorCommands.js` | 全局世界书选择器命令：切换、固定、取消固定、预设管理 |
| `commands/worldbookCommands.js` | 世界书管理命令：导入、导出、创建、删除、重命名、替换显示 |
| `commands/titleBarCommands.js` | 标题栏操作命令：筛选、优化器、批量导入、批量操作、全选 |
| `commands/entryCommands.js` | 条目操作命令：展开、编辑、切换状态、选择等 |

## 5. 核心架构

### 5.1 状态与视图分离

```
数据加载 → state.js 存储 → UI模块读取渲染 → 用户交互 → 修改state → 触发重渲染
```

所有跨模块共享的数据都通过 `state.js` 的导出函数访问，不直接操作 DOM 获取状态。

### 5.2 虚拟滚动

使用 `Clusterize.js` 实现虚拟滚动，只渲染可视区域内的条目。通过预计算行高解决滚动跳跃问题。

### 5.3 命令模式

使用命令模式将事件处理逻辑从 `events.js` 中解耦，提高可维护性和可测试性：

```javascript
// commands/index.js - 命令注册中心
export function registerCommand(action, handler) {
  commandHandlers.set(action, handler);
}

export async function dispatchCommand(action, context) {
  const handler = commandHandlers.get(action);
  if (handler) await handler(context);
}

// commands/entryCommands.js - 注册条目命令
registerCommands({
  'expand': expand,
  'toggle-enabled': toggleEnabled,
  'edit-title': editTitle,
  // ...
});

// events.js - 简化为事件分发器
$panel.on('click.lorebookAction', '[data-action]', async function(e) {
  const action = $(this).data('action');
  const context = { event: e, $target: $(e.target), ... };
  await dispatchCommand(action, context);
});
```

### 5.4 事件委托

在主面板容器上绑定统一的事件监听器，通过 `data-action` 属性分发处理：

```javascript
// 元素定义
<button data-action="delete-entries">删除</button>

// 命令模块中处理
registerCommand('delete-entries', async ({ lorebookName, isGlobal, refreshList }) => {
  if (await deleteSelectedEntries(lorebookName, isGlobal)) {
    refreshList(lorebookName, isGlobal);
  }
});
```

### 5.5 原子化API更新

批量操作在内存中计算最终结果，通过 `updateWorldbookWith` 一次性提交，避免频繁网络请求。

## 6. 开发指南

### 添加新功能

1. 在 `features/` 创建功能模块，导出主函数并用 `errorCatched` 包装
2. 在 `ui/list.js` 添加触发按钮，设置 `data-action` 属性
3. 在对应的 `commands/*.js` 模块中注册命令处理器
4. 运行 `pnpm build` 测试

### 添加新命令

1. 确定命令类别（选择器/世界书管理/标题栏/条目操作）
2. 在对应的 `commands/*.js` 文件中添加处理函数
3. 使用 `registerCommands()` 注册命令
4. 命令会自动被 `events.js` 分发

### 常见问题

| 问题 | 排查方向 |
|------|----------|
| 滚动异常 | 检查 Clusterize 配置和容器CSS高度 |
| 批量操作不生效 | 确保从 `state.js` 获取数据而非DOM |
| 按钮无响应 | 检查 `data-action` 属性和 `events.js` 中的 case |

## 7. 技术栈

- **核心库**: jQuery (酒馆提供)
- **虚拟滚动**: Clusterize.js
- **YAML解析**: js-yaml
- **拖拽排序**: jQuery UI Sortable
- **构建工具**: Webpack
