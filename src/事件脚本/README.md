# ERA 事件系统 V5.2

模块化重构版的事件处理系统，用于管理游戏中的时间驱动事件。

## 模块结构

```
src/事件脚本/
├── index.ts              # 入口文件
├── era-main.js           # 主脚本，事件循环与监听
├── era-utils.js          # 工具函数模块
├── era-event-loader.js   # 事件加载模块
├── era-event-checker.js  # 事件检查模块
├── era-turn-queue.js     # 回合串行队列与线索计数规划
├── era-notifications.js  # 前端通知适配与 toastr 回退桥
└── era-event-operations.js # 事件操作模块
```

## 模块说明

### era-utils.js - 工具函数

提供基础工具函数：

| 函数                                                   | 说明                                    |
| ------------------------------------------------------ | --------------------------------------- |
| `log`, `logError`, `logSuccess`, `logWarning`          | 日志工具                                |
| `compareTime(currentTime, targetTime, comparisonType)` | 时间比较，支持 `>=`、`>` 和 `diff` 模式 |
| `calculateDateOffset(dateObject, days)`                | 日期偏移计算                            |
| `calculateTimeOffset(dateObject, duration)`            | 时间偏移计算（支持小时级精度）          |
| `getEndTime(eventData)`                                | 获取事件结束时间                        |
| `formatDate(timeObj)`                                  | 格式化时间对象为字符串                  |
| `isDebutEvent(eventName)`                              | 判断是否为登场事件                      |
| `getEventShortName(eventName)`                         | 提取事件核心名称                        |

**配置项 (CONFIG)**:

- `DEBUG_MODE`: 调试模式开关
- `EVENT_KEY_PREFIXES`: 事件条目前缀 `['事件条目-', '成长条目-']`
- `EVENT_KEY_PATTERNS`: 事件匹配正则
- `DEBUT_EVENT_PATTERN`: 登场事件匹配正则 `/登场事件-/`
- `ELASTIC_TRIGGER_DAYS`: 弹性触发天数 (10天)
- `SHORT_EVENT_THRESHOLD_DAYS`: 短期事件阈值 (30天)
- `DEFAULT_FOLLOWUP_LIFETIME`: 后续事件线索存活回合数 (3)

### era-event-loader.js - 事件加载

| 函数                                  | 说明 |
| ------------------------------------- | ---- |
| `loadEventManifest()`                 | 加载生成式事件目录与索引 |
| `loadEventDefinitions(runtimeKeys)`   | 按运行时键按需加载事件分片 |
| `loadEventCheckpointAtOrBefore(time)` | 加载目标时间之前最近的开局检查点 |
| `loadEventDefinitionsFromWorldbook()` | 显式调试回退：从角色世界书加载事件定义 |

生产环境事件数据由 `scripts/generate-wuxia-event-assets.mjs` 从 `世界书/**/*.yaml` 生成到
`src/事件脚本/generated/event-data/`，构建时会自动执行 `pnpm generate:events`。事件定义不再在
开局时扫描并解析整本角色世界书，而是先读 manifest，再按当前事件窗口、进行中事件和待结算事件
加载对应分片；`ERA_EVENT_DATA_PROVIDER=worldbook`（或 localStorage 同名开关）仅用于调试回退。

事件条目命名规则：

- 精确前缀：`事件条目-xxx`、`成长条目-xxx`
- 正则匹配：`xxx事件条目-xxx`、`xxx登场事件-xxx`

### era-event-checker.js - 事件检查

| 函数                                                | 说明                                       |
| --------------------------------------------------- | ------------------------------------------ |
| `isTimeForEvent(currentTime, eventData, eventName)` | 检查事件是否到达原定触发时间                 |
| `isEventDiscoverable(currentTime, eventData)`       | 检查事件是否进入提前十天的可发现窗口         |
| `isTimeAfterEventEnd(currentTime, endTime)`         | 检查是否到达或超过实际结束时间               |

**弹性时间机制**：短期事件（持续时间 ≤ 30天）提前10天只开放传闻。玩家精确到达完整事件地点、且全部有效前置事件已经完成时，事件才会提前启动；否则仍按原定时间启动。提前启动会保留原事件的小时级持续时长。

### era-event-operations.js - 事件操作

| 函数                                                     | 说明                   |
| -------------------------------------------------------- | ---------------------- |
| `initializeEventList(eventDefinitions)`                  | 智能批量初始化事件列表 |
| `batchStartEvents(eventNames, eventDefinitions)`         | 批量开始事件           |
| `batchCompleteDebutEvents(eventNames, eventDefinitions)` | 批量完成登场事件       |
| `playerJoinsEvent(eventName, eventData)`                 | 玩家参与事件           |
| `batchEndEvents(eventNames, eventDefinitions)`           | 批量结束事件并应用差分 |

### era-main.js - 主脚本

负责：

1. 模块导入与初始化
2. 主检查函数 `checkEvents()` - 批量检查并处理事件状态变更
3. 玩家位置触发检查 - 层级式地点匹配
4. 后续事件线索计数器处理
5. 事件监听器注册

## 事件生命周期

```
未发生事件 ──自身触发条件成立────────> 进行中事件 ──当前时间 >= 实际结束时间──> 已完成事件
     │                                      │
     ├──提前10天──> 附近传闻                 └── 玩家到达完整地点 ──> 参与事件
     ├──单一时间锚点且其余条件成立，精确到场──> 提前启动
     ├──绝对窗口结束且条件仍不成立──> 已失效事件
     └──登场事件到原定时间──> 已完成事件
```

## 事件定义格式

事件定义存储在世界书条目中，内容为 JSON 格式：

```json
{
  "触发条件": {
    "全部": [
      { "事件完成": "事件A" },
      { "变量": "事件分支结果.事件A.变心", "等于": 1 },
      { "时间": { "年": 1, "月": 3, "日": 15, "时": 8 } }
    ]
  },
  "事件持续时间": { "日": 1, "时": 2 },
  "事件地点": "国家/地区/地点",
  "事件详情": "酒馆举办庆典活动",
  "事件引子": "听说酒馆最近很热闹",
  "insert": {
    "角色名": { "属性": "值" }
  },
  "update": {
    "角色名": { "属性": "新值" }
  },
  "delete": {
    "角色名": { "属性": {} }
  },
  "分支标记": { "变心": 0 },
  "后续事件": { "事件B": "线索B", "事件C": "线索C" }
}
```

**差分操作说明**：

- `insert`: 新增角色或属性
- `update`: 更新现有属性
- `delete`: 删除属性
- 普通事件必须提供非空 `事件概要`，它表示事件按原定发展完成后的持久结果
- `参与事件.<事件名>.结局`: 玩家参与时以 `事件概要` 初始化；只有最终结果实质改变时才改写
- `参与事件.<事件名>.insert/update/delete`: 玩家参与时由普通 `insert/update/delete` 复制生成的当前结局快照；事件结算时以这三块为准
- 旧时间触发 `{ "类型":"时间", ... }` 继续支持；新条件支持 `时间`、`事件完成`、变量比较、嵌套 `全部/任一`
- 条件事件使用绝对 `事件结束时间` 或相对 `事件持续时间` 二选一；条件事件不进入确定性 checkpoint
- `后续事件`只生成目标事件线索，不构成前置门控。多个目标条件同时成立时自然并行，互斥由目标事件自己的条件表达
- `参与事件.<事件名>.分支标记`只允许在已有 0/1 间修改；结算时快照归档到只读、可回退的 `事件分支结果`
- 普通事件的 `事件引子` 必须是非空字符串；`附近传闻` 的出现范围固定由 `事件地点` 前两级派生，例如 `大宋/临安府/牛家村` 会在 `大宋/临安府` 及其下级地点显示，玩家到达完整 `事件地点` 后改为加入事件，不再显示传闻

## 数据结构

事件系统使用的变量路径：

```
stat_data
├── 世界信息
│   └── 时间: { 年, 月, 日, 时 }
├── 事件系统
│   ├── 未发生事件: { 事件名: 触发条件 }
│   ├── 进行中事件: { 事件名: 实际结束时间 }
│   ├── 已完成事件: { 事件名: 0|1 }  // 0=未参与, 1=已参与
│   └── 已失效事件: { 事件名: 绝对结束时间 }
├── 参与事件:
│   └── 简化事件名:
│       ├── 描述: "事件参与描述"
│       ├── 结局: "当前预期最终结果（以事件概要初始化）"
│       ├── insert: { 角色名: { ... } }
│       ├── update: { 角色名: { ... } }
│       ├── delete: { 角色名: { ... } }
│       └── 分支标记: { 标记名: 0|1 }
├── 世界事件: { 完整事件名: { 时间, 地点, 概要 } }
├── 事件分支结果: { 完整事件名: { 标记名: 0|1 } }
├── 前端变量:
│   ├── 事件结局状态: { 完整事件名: "原定"|"偏离"|"未知" }
│   ├── 事件结算进度: { 完整事件名: { 分支标记: { 标记名: 0|1 } } } // ERA预备快照，成功后删除
│   ├── 事件调度状态: { schemaVersion: 1, manifestHash: "...", lastCheckedTime: { 年, 月, 日, 时 } }
│   └── 事件运行时键版本: 2
├── 附近传闻: { 简化事件名: 引子文本 }
├── 后续事件线索: { 目标事件名: 描述 }
├── 后续事件线索计数: { 目标事件名: 剩余回合数 }
├── 角色数据: { 角色名: { 属性 } }
└── user数据
    └── 所在位置: "地点路径"
```

## 事件监听

系统监听以下事件：

- `tavern_events.CHAT_CHANGED`: 聊天切换时重新初始化
- `tavern_events.MESSAGE_SENT`: 消息发送时触发事件检查
- `wuxia:turn-completed`: 回合成功后与事件检查共用串行队列，只递减回合开始前已有的线索计数
- `era:writeDone`: ERA 变量更新完成时触发检查
- `GameInitialized`: 前端初始化完成信号

## 事件通知适配接口

事件脚本通过动态全局名 `WuxiaEventNotification:<bridgeId>` 发布 v1 通知接口。接口常量和 TypeScript
类型位于 `src/shared/wuxiaEventNotifications.ts`；前端不应猜测当前动态名称，而应监听桥的生命周期事件：

- `wuxia:event-notification:discover`：前端加载或重载后发送，要求当前事件脚本重发就绪公告。
- `wuxia:event-notification:ready`：事件脚本携带 `{ version, bridgeId, globalName, startedAt }` 宣布接口可用。
- `wuxia:event-notification:disposed`：事件脚本实例卸载或被新实例替换时发送同形公告。

前端收到兼容的 `ready` 后，通过 `waitGlobalInitialized(globalName)` 取得
`WuxiaEventNotificationApi`，再注册同步适配器：

```ts
const api = await waitGlobalInitialized<WuxiaEventNotificationApi>(ready.globalName);
if (api.version !== WUXIA_EVENT_NOTIFICATION_API_VERSION) return;

const unregister = api.registerAdapter({
  ownerId: 'my-wuxia-ui',
  mountedAt: Date.now(),
  show(notice) {
    // 先同步放入前端自己的通知队列，再返回 true。
    enqueueNotice(notice);
    return true;
  },
});
```

`EventNotice` 包含 `version、id、source、kind、level、message、eventNames?、durationMs?、createdAt`。
`kind` 可为 `system-ready`、`event-started`、`debut-event-completed`、`player-entered-event`、
`event-completed` 或 `event-data-error`；`level` 可为 `info`、`success`、`warning` 或 `error`。

适配器必须同步返回 `true` 表示通知已经入队。没有适配器、显式版本不兼容、返回非 `true` 或抛错时，
事件脚本会立即以原文案、原级别和原显式时长回退到酒馆 `toastr`，且通知错误不会打断事件事务。
同一桥只保留 `mountedAt` 最新的前端实例；旧实例迟到注册或调用旧的 `unregister` 都不会清除新实例。
前端卸载时应调用 `unregister()`，并在桥 `disposed` 后丢弃对应接口；所有卸载操作均可重复调用。

## 性能优化

V5.2 版本的优化：

1. **模块化架构** - 按功能拆分为独立模块
2. **批量操作** - 批量初始化/触发/结束事件
3. **智能初始化** - 检测已过期事件直接批量结算
4. **性能提升** - 50个事件初始化从8秒降至0.3秒

后续线索、计数、人物差分、世界事件、完成状态和事件分支结果在同一次 ERA 结算事务中提交，初始计数为3；同一目标已有线索时首次写入保留且不续期。

当前版本的开局路径进一步采用：

1. **单快照提交** - 开局事件规划、过期历史归档、角色差分和运行时索引在一次 `updateVariablesWith` 中提交，并在提交后统一回读校验。
2. **生成式资源** - manifest 保存完整条件、持续时间、多后续关系和分片索引；checkpoint 只保存纯时间事件的历史完成键与角色快照。
3. **稀疏未来状态** - 生成式 provider 不再把数百个未来事件写入 `未发生事件`，而由调度索引计算当前候选集；旧存档仍保留原有桶并增量迁移，不覆盖已有角色状态。
4. **写入信号合并** - direct 写入等待对应完成信号并传播失败；事件状态刷新按 refresh hint 选择性执行，避免一次写入触发多轮全量扫描。

生成器默认报告无法解析为事件图边的后续引用（例如“全书完”“待定”或不存在的事件）。这些引用会记录在 manifest 的 `unresolvedReferences` 中；发布前可运行 `pnpm generate:events -- --strict` 将其作为阻断错误检查。
