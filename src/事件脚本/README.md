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

| 函数                                  | 说明                     |
| ------------------------------------- | ------------------------ |
| `loadEventDefinitionsFromWorldbook()` | 从角色世界书加载事件定义 |

事件条目命名规则：

- 精确前缀：`事件条目-xxx`、`成长条目-xxx`
- 正则匹配：`xxx事件条目-xxx`、`xxx登场事件-xxx`

### era-event-checker.js - 事件检查

| 函数                                                | 说明                                       |
| --------------------------------------------------- | ------------------------------------------ |
| `isTimeForEvent(currentTime, eventData, eventName)` | 检查事件是否到达触发时间（含弹性时间逻辑） |
| `isTimeAfterEventEnd(currentTime, endTime)`         | 检查是否已过事件结束时间                   |

**弹性时间机制**：短期事件（持续时间 ≤ 30天）会提前10天开放触发。

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
未发生事件 ──触发条件满足──> 进行中事件 ──结束时间到达──> 已完成事件
     │                           │
     │                           └── 玩家到达地点 ──> 参与事件
     │
     └── 登场事件 ──直接完成──> 已完成事件
```

## 事件定义格式

事件定义存储在世界书条目中，内容为 JSON 格式：

```json
{
  "触发条件": {
    "类型": "时间",
    "年": 1,
    "月": 3,
    "日": 15,
    "时": 8
  },
  "事件结束时间": {
    "年": 1,
    "月": 3,
    "日": 20,
    "时": 18
  },
  "事件地点": "国家/地区/地点",
  "事件详情": "酒馆举办庆典活动",
  "事件引子": {
    "城镇": "听说酒馆最近很热闹"
  },
  "insert": {
    "角色名": { "属性": "值" }
  },
  "update": {
    "角色名": { "属性": "新值" }
  },
  "delete": {
    "角色名": { "属性": {} }
  },
  "P-insert": { },
  "P-update": { },
  "P-delete": { },
  "后续事件": {
    "事件名": "事件条目-后续事件名",
    "描述": "后续事件的线索描述"
  }
}
```

**差分操作说明**：

- `insert`: 新增角色或属性
- `update`: 更新现有属性
- `delete`: 删除属性
- `P-insert/P-update/P-delete`: 玩家参与时使用的差分（优先级高于普通差分）

## 数据结构

事件系统使用的变量路径：

```
stat_data
├── 世界信息
│   └── 时间: { 年, 月, 日, 时 }
├── 事件系统
│   ├── 未发生事件: { 事件名: 触发条件 }
│   ├── 进行中事件: { 事件名: 结束时间 }
│   └── 已完成事件: { 事件名: 0|1 }  // 0=未参与, 1=已参与
├── 参与事件: { 简化事件名: 描述 }
├── 附近传闻: { 简化事件名: 引子文本 }
├── 后续事件线索: { key: 描述 }
├── 后续事件线索计数: { key: 剩余回合数 }
├── 角色数据: { 角色名: { 属性 } }
└── user数据
    └── 所在位置: "地点路径"
```

## 事件监听

系统监听以下事件：

- `tavern_events.CHAT_CHANGED`: 聊天切换时重新初始化
- `tavern_events.MESSAGE_SENT`: 消息发送时触发事件检查
- `era:writeDone`: ERA 变量更新完成时触发检查
- `GameInitialized`: 前端初始化完成信号

## 性能优化

V5.2 版本的优化：

1. **模块化架构** - 按功能拆分为独立模块
2. **批量操作** - 批量初始化/触发/结束事件
3. **智能初始化** - 检测已过期事件直接批量结算
4. **性能提升** - 50个事件初始化从8秒降至0.3秒
