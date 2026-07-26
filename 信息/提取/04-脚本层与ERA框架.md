# 脚本层通用机制提取（ERA 变量框架 / 隐藏楼层 / 调试）

> 提取自：`角色卡\金庸群侠传\脚本\`（ERA变量框架-1.0.5.js、ERA变量框架-魔改.js、调试.js、隐藏楼层.js）
> 参考源码：`src/ERA变量框架/`（TS 源）、`src/事件脚本/`、`src/武侠/`（前端 React）

---

## 0. 总览

| 文件 | 大小 | 卡内启用状态 | 性质 | 职责一句话 |
| --- | --- | --- | --- | --- |
| `ERA变量框架-1.0.5.js` | 469 KB | **`启用: false`** | webpack 打包产物（21 模块） | 变量框架旧版，留作回退备份 |
| `ERA变量框架-魔改.js` | 475 KB | **`启用: true`** | 同上，仅 `api/command.ts` 一个模块被改写 | 生产用变量框架 |
| `调试.js` | 4.9 KB | **`启用: false`** | 手写 IIFE | 世界书「事件条目-」读取诊断 |
| `隐藏楼层.js` | 19 KB | **`启用: true`** | 手写 IIFE（jQuery ready） | 只保留最后一楼 DOM + 回合锁 ACK |

注册位置：角色卡 `index.yaml` → `酒馆助手.脚本库`。

**关键结论（先说，后面展开）**

1. `隐藏楼层.js` 与另一张卡（nba2k）的同名文件**逐字节相同**；`ERA变量框架-魔改.js` 也与 nba2k 的同名文件**逐字节相同**。也就是说这两个文件在作者自己的两张卡之间已经验证过是「零改动复用」的，可以直接照搬。
2. 两个 bundle 都是**比 `src/` 源码旧的版本**：bundle 内**没有** `era:transactionByObject`、没有 `writeScheduler`、没有 `ERADiagnostics`/`era_diagnostics_v1`、没有隐藏页 `queueMicrotask` 调度。README 里描述的这些能力属于 `src/` 当前 HEAD，**复刻新卡时若照搬 bundle 就没有事务 API**。
3. `魔改` 版 bundle 的 **source map `sourcesContent` 是过期的**（里面还是 1.0.5 的 `debouncedEmitApiWrite` 代码），实际执行的是编译后的 75 ms 批队列实现。审阅时不要拿 sourcemap 当真值，要看编译产物。

---

## 1. ERA 变量框架（魔改版 / 1.0.5）

### 1.1 职责

聊天级（`{ type: 'chat' }`）变量框架。做四件事：

1. 解析 AI 消息正文里的 `<VariableInsert> / <VariableEdit> / <VariableDelete>` 指令，写入 `chat.stat_data`。
2. 给每条消息正文注入 **MK（Message Key）**，把「变量状态」锚定到「具体消息内容」。
3. 每个 MK 保存一份可逆 **EditLog**，支持删楼/swipe/切聊天时「逆序回滚 → 顺序重算」。
4. 对外提供 `era:*` 事件 API（脚本写变量）和 `{{ERA:...}}` 宏（提示词/世界书读变量），并在每次写完广播 `era:writeDone`。

依赖的酒馆助手全局：`getChatMessages / setChatMessages / getVariables / updateVariablesWith / eventOn / eventEmit / tavern_events / getButtonEvent / registerMacroLike / getScriptId / $`，第三方只有 lodash。

### 1.2 数据模型（chat 作用域）

```ts
type EraChatVariables = {
  ERAMetaData?: {
    EditLogs?: Record<string, string | EditLogEntry[] | EditLogEntry>;
    SelectedMks?: Array<string | null | undefined>;
  };
  stat_data?: unknown;
};

type EditLogEntry =
  | { op: 'insert'; path: string; value_new: unknown }
  | { op: 'update'; path: string; value_old: unknown; value_new: unknown }
  | { op: 'delete'; path: string; value_old: unknown };
```

实例（`src/ERA变量框架/README.md`）：

```json
{
  "ERAMetaData": {
    "EditLogs": {
      "era_mk_1759246942209_jipmrj": "[{\"op\":\"update\",\"path\":\"player.hp\",\"value_old\":90,\"value_new\":100}]"
    },
    "SelectedMks": ["era_mk_greeting", "era_mk_1759246942209_jipmrj"]
  },
  "stat_data": { "player": { "hp": 100 } }
}
```

常量定义（`src/ERA变量框架/utils/constants.ts`，bundle 内一致）：

```ts
export const CHAT_SCOPE     = { type: 'chat' as const };
export const META_DATA_PATH = 'ERAMetaData';
export const STAT_DATA_PATH = 'stat_data';
export const LOGS_PATH      = 'EditLogs';
export const SEL_PATH       = 'SelectedMks';
export const ERA_DATA_TAG   = 'era_data';
export const ERA_DATA_REGEX = new RegExp(`<${ERA_DATA_TAG}>({.*?})<\\/${ERA_DATA_TAG}>`);
```

要点：

- `EditLogs` 运行时通常是 **MK → JSON 字符串**（`JSON.stringify(editLog)`），不是类型声明写的数组；`parseEditLog` 兼容数组/单对象/JSON 字符串/无效值（无效一律返回 `[]`）。
- 同一 MK 重新处理时 EditLog 是**覆盖**不是追加；即使无有效指令也会写 `"[]"`。
- `SelectedMks` 是**以 `message_id` 为索引的稀疏数组**，是差分检测/回滚/重算的基准。
- 所有 `$` 前缀字段（`$meta`、`$template`）视为内部字段，`statWithoutMeta` 与普通 `{{ERA:}}` 宏会**递归剥掉全部 `$*` 字段**。

### 1.3 MK（消息密钥）

写入消息正文顶部：

```xml
<era_data>{"era-message-key"="era_mk_时间戳_随机串","era-message-type"="assistant"}</era_data>
```

生成规则：`era_mk_${Date.now()}_${Math.random().toString(36) 6位}`。只从**当前激活 swipe** 读 MK；当前 swipe 没有就发新 MK；角色非 `user` 一律记为 `assistant`。

> 手工删/伪造 `<era_data>` 块会破坏差分与回滚。正则未锚定行首、也不校验重复 MK（已知弱点）。

### 1.4 变量写入命令语法（AI 输出格式）—— 复刻新卡最核心的一块

单条消息的固定处理顺序（**与正文中的排列顺序无关**）：

1. 抽全部 `<VariableInsert>` → 2. 抽全部 `<VariableEdit>` → 3. 抽全部 `<VariableDelete>` → 4. JSONL 解析 → 5. 转义 → 6. 严格按 **Insert → Edit → Delete** 应用 → 7. 覆盖写该 MK 的 EditLog。

块内可以放一个对象，也可以放多个首尾相接的对象（类 JSONL，只提取顶层 `{...}`，不支持顶层数组/标量）：

```xml
<VariableInsert>
{"player":{"hp":100}}
{"world":{"weather":"晴"}}
</VariableInsert>
```

#### `<VariableInsert>` — 非破坏性插入
```xml
<VariableInsert>
{ "player": { "name": "张三", "hp": 100, "inventory": [] } }
</VariableInsert>
```
- 只写不存在的路径，**不覆盖已有值**；基础路径整体不存在时把补丁+模板合成一个原子值，只记 1 条 `insert` 日志；已存在且两侧都是普通对象则递归补空缺；结构不兼容则跳过并 warn；根对象不能被标量替换。

#### `$template` — 插入默认值继承（做「角色卡默认属性」很好用）
优先级低→高：上层继承 → 当前父节点的 `$template` → 父模板中的通用 `$template` 原型 → 当前 key 的特异性模板 → 实际 Insert 补丁。对象深合并；数组整体替换不按索引合并；空补丁 `{}` 完全采用模板。

```json
{
  "characters": {
    "$template": {
      "$template": { "hp": 10, "mana": 100 },
      "某角色": { "hp": 15, "title": "某头衔" }
    }
  }
}
```

#### `<VariableEdit>` — 只改已存在的叶子
```xml
<VariableEdit>
{ "player": { "hp": 120 } }
</VariableEdit>
```
- 普通对象继续递归；**数组和其他非普通对象当叶子整体替换**；路径不存在只跳过该项；新旧值相同也记 `update`。
- **`"+=10"`、`"-=2"` 这类运算表达式源码没有实现**（虽然 `era:updateByPath` 的 JSDoc 例子写了 `value: '+=10'`），会被当普通字符串写进去。这是文档与实现不一致的坑。
- `$meta.updatable: false` 会让整个分支停止递归；同一补丁显式带 `"$meta": { "updatable": true }` 会绕过保护（豁免范围过大，是已知缺陷）。

#### `<VariableDelete>` — 由补丁结构决定删除意图
```xml
<VariableDelete>
{ "player": { "gold": {} } }
</VariableDelete>
```
- 值为空对象 `{}` / 非对象 / `null` → **删当前节点**；值为非空普通对象 → 保留当前节点，**递归删指定子节点**；不存在路径跳过；根对象禁删。
- `$meta.necessary: "self"` 禁止直接删本节点但允许删子节点；`"all"` 两者都禁。

#### 数组兼容陷阱（`sanitizeArrays`）
Insert / Edit 都会经过它：数组的**直接对象元素和子数组会被 `JSON.stringify`**。

```json
{"inventory":[{"name":"药","count":1}]}   →   {"inventory":["{\"name\":\"药\",\"count\":1}"]}
```
> 复刻时：**变量结构里尽量不要用「对象数组」，改用「以名字为 key 的对象」**，否则前端读取要自己再 `JSON.parse`。

#### 数据转义
应用前递归转义键与所有字符串值：`. → __DOT__`、`" → __DQUOTE__`、`' → __SQUOTE__`；广播 `era:writeDone` 和展开宏时反转义。**原始数据里不要出现这三个保留 token**（无版本化编码层，反转义会串味、键名可能碰撞）。

#### JSONL 解析器的注释清理坑
`parseJsonl` 在解析前**全局删除** `//...`、`/*...*/`、`<!--...-->`。所以 `{"url":"https://example.com"}` 会被从 `//` 处截断。世界书里让 AI 写 URL 要小心。

### 1.5 事务机制（现状：bundle 里没有）

- `src/` 当前源码有 `era:transactionByObject`：
  ```js
  eventEmit('era:transactionByObject', {
    transactionId: 'event-settlement-42',
    operations: [
      { type: 'update', payload: { player: { hp: 80 } } },
      { type: 'delete', payload: { quests: { active: { old_event: {} } } } },
      { type: 'insert', payload: { quests: { completed: { old_event: true } } } },
    ],
  });
  ```
  语义：先完整校验并克隆全部 operation，再按声明顺序一次性入 API 写入队列；同一次 flush 只更新一次 assistant 消息、只发一次 `era:apiWrite`，并在 `era:writeDone` 中回传 `transactionIds`（恰好一个事务时同时给 `transactionId`）。
- **但本卡两个 bundle 里 `transactionByObject`、`transactionId` 出现次数均为 0**。魔改版只有「相邻同类型任务合并」这一层弱事务性，**没有原子提交、没有事务 ID 回执**。
- 框架层的另一个已知非事务点（README P1）：CRUD 通过多次 `updateEraStatData` 落盘，EditLog 最后才单独保存，中途失败会出现「状态已改但日志缺失」的不可回滚状态。

### 1.6 EditLog / 回滚机制

`rollbackByMk(MK)` 读该 MK 日志并**严格逆序**执行：

| 日志 op | 回滚动作 |
| --- | --- |
| `insert` | `unset(path)` |
| `update` | 恢复 `value_old` |
| `delete` | 恢复 `value_old` |
| update/delete 缺 `value_old` | `unset(path)` |

回滚**不删除**对应 EditLog。

**历史旧值追溯**（`findLatestNewValue`，生成 update 日志时用）：从目标消息前一条向旧扫描 → 跳过用户消息与无 MK 消息 → 读每条 MK 的 EditLog → 逆序找目标路径最新 `value_new` → 若日志改的是父对象则从父级 `value_new` 取子路径 → 找不到或遇到该路径的 delete 日志返回 `null`。

**历史同步 `resyncStateOnHistoryChange`**：

- 消息数减少 → 从末尾向前找 MK 对齐点，检测被删 MK；若被删 MK 的 EditLog 全空 → 只修 `SelectedMks`，否则逆序回滚旧主干。
- 消息数相同 → 找最早 MK 不匹配位置。
- 消息数增加 → 从旧 `SelectedMks.length` 起。
- 强制完全重算 → 从消息 0 起。
- 最后从重算点起按当前消息顺序重放，并替换 `SelectedMks`。
- **空聊天不清理旧状态**（删光消息后旧 `stat_data` 仍在，已知缺陷）。

### 1.7 对外事件接口

**框架监听（入队）**

| 分组 | 事件 | 行为 |
| --- | --- | --- |
| `WRITE` | `APP_READY`、`manual_write`、`era:apiWrite` | 回滚最新 MK 后重新应用最后 AI 消息 |
| `SYNC` | `MESSAGE_RECEIVED`、`MESSAGE_DELETED`、`MESSAGE_SWIPED`、`CHAT_CHANGED` | 历史同步 |
| `SYNC` | `manual_sync`、`manual_full_sync`、`combo_sync` | 普通/强制同步 |
| `API` | 六个 `era:*` 写入事件（bundle 版本；src 版本七个） | 向最后一条非 user 消息追加变量指令 |
| `UPDATE_MK_ONLY` | `MESSAGE_SENT` | 只保证最新用户消息有 MK |
| `COLLISION_DETECTORS` | `GENERATION_STARTED` | 仅参与对冲/组合 |
| `COMBO_STARTERS` | `MESSAGE_UPDATED` | 仅参与组合 |

**收集/防抖窗口**（`events/merger.ts`）

| 队首事件 | 等待 |
| --- | --- |
| 任意 API 事件 | 0 ms |
| `MESSAGE_SWIPED` | 500 ms |
| `MESSAGE_UPDATED` | 1500 ms |
| 其他 | 300 ms |

```ts
EVENT_COLLISION_MAP = new Map([[MESSAGE_SWIPED, { next: GENERATION_STARTED, maxInterval: 600 }]]);   // 两者都丢弃
EVENT_COMBO_MAP     = new Map([[MESSAGE_UPDATED, { next: GENERATION_STARTED, resultType: 'combo_sync', maxInterval: 1600 }]]);
```
相邻同组 WRITE/WRITE、SYNC/SYNC 后者覆盖前者（所以 `manual_full_sync` 可能被后到的普通 SYNC 覆盖，是已知缺陷）。

**外部脚本 → ERA（`eventEmit`）**

| 事件 | detail |
| --- | --- |
| `era:insertByObject` | 要插入的对象 |
| `era:updateByObject` | 要更新的对象 |
| `era:deleteByObject` | 描述删除路径的对象 |
| `era:insertByPath` | `{ path, value }` |
| `era:updateByPath` | `{ path, value }` |
| `era:deleteByPath` | `{ path }` |
| `era:transactionByObject` | `{ transactionId, operations[] }` **← 仅 src，bundle 无** |

```js
eventEmit('era:insertByObject', { player: { name: '某角色', hp: 100 } });
eventEmit('era:updateByPath',  { path: 'player.hp', value: 120 });
eventEmit('era:deleteByPath',  { path: 'player.gold' });
// 删整个 player
eventEmit('era:deleteByObject', { player: {} });
// 只删 player.gold 和 player.mana，player 保留为空对象
eventEmit('era:deleteByObject', { player: { gold: {}, mana: {} } });
```

路径 API 内部用 `_.set({}, path, value)` 构造嵌套对象。**普通单操作没有 request ID、没有同步返回值、没有失败回执**——调用方要自己等 `era:writeDone`。（前端就是这么做的：`emitSourcedEraVariableWriteAndWait()`，见 `src/武侠/docs/03-变量读取与写入.md`。）

**ERA → 外部**

```ts
ERA_EVENT_EMITTER = { WRITE_DONE: 'era:writeDone', API_WRITE: 'era:apiWrite' };

type WriteDonePayload = {
  mk: string;
  message_id: number;
  actions: { rollback: boolean; apply: boolean; resync: boolean; api: boolean; apiWrite: boolean };
  selectedMks: Array<string | null | undefined>;
  editLogs: Record<string, string | EditLogEntry[] | EditLogEntry>;
  stat: unknown;             // 含 $meta
  statWithoutMeta: unknown;  // 剥掉全部 $* 字段
  consecutiveProcessingCount: number;
  transactionIds?: string[]; // 仅 src
  transactionId?: string;    // 仅 src
};
```

监听示例：
```js
eventOn('era:writeDone', detail => {
  console.log('写入楼层', detail.message_id, 'MK', detail.mk);
  console.log('纯净状态', detail.statWithoutMeta);
});
```

注意：`stat` / `statWithoutMeta` 广播前反转义，`editLogs` **不**反转义且通常是 JSON 字符串；**没有 `success` / `error` 字段**；API 完成的广播实际表现为 `api:false, apiWrite:true`。

### 1.8 宏（世界书 / 提示词读变量）

```text
{{ERA:path.to.value}}
{{ERA:array[0].name}}
{{ERA:$ALLDATA}}

{{ERA-withmeta:path.to.value}}
{{ERA-withmeta:$ALLDATA}}
```

路径不存在 → 空串；对象/数组 → 紧凑 JSON；`null` → 字符串 `"null"`；其余 → `String(value)`。普通 `ERA` 剥 `$*`，`ERA-withmeta` 保留。

> **陷阱**：快速检测用区分大小写的 `text.includes('{{ERA')`，所以 `{{era:...}}`、`{{ ERA:...}}` 实际不会被替换。统一用大写、无前置空格。

### 1.9 配置项（脚本变量 + 按钮）

角色卡中两个 ERA 条目的配置完全一样：

```yaml
按钮:
  启用: true
  按钮列表:
    - 名称: 写入变量修改      # → pushToQueue('manual_write')     回滚并重写最后 AI 消息
    - 名称: 手动同步状态      # → pushToQueue('manual_sync')      普通历史同步
    - 名称: 强制完全重算      # → pushToQueue('manual_full_sync') 从消息 0 重算
数据:
  强制重载功能: false
  强制重载消息数: 0
```

`强制重载功能`（`api/macro/patch.ts`）启用后：等 1000 ms → 取最后 N 条消息 → 依次点 `.mes_button.mes_edit`，50 ms 后点 `.mes_edit_done.menu_button`，消息间隔 100 ms。**依赖 DOM 选择器、无 await、无互斥**，本卡明确关掉了（因为有隐藏楼层脚本，DOM 只剩一楼，重渲染会打架）。

日志：级别 `debug=0 / log=1 / warn=2 / error=3`，**启动级别硬编码为 `debug`**，格式 `《ERA》（MK）「模块名」【函数名】消息`。长会话下这是明显的性能开销。

### 1.10 「魔改」相对 1.0.5 到底改了什么

用 `diff` 逐模块比对，**两个 bundle 的 webpack 模块清单完全一致（21 个），差异只有一个连续 hunk，全部落在 `api/command.ts`**。其余 20 个模块（patcher / insert / update / delete / template / mk / rollback / sync / merger / queue / dispatcher / macro / utils…）字节相同。

#### 1.0.5 的实现（简单直写 + 50 ms 防抖广播）

```js
const debouncedEmitApiWrite = _.debounce(() => {
  eventEmit(ERA_EVENT_EMITTER.API_WRITE);
}, 50, { leading: false, trailing: true });

async function performApiWrite(job) {
  const contentString = J(job.blockContent);                       // JSON.stringify(o, null, 2) 带缩进
  const block = `\n<${job.blockTag}>\n${contentString}\n</${job.blockTag}>`;
  const lastAiMessage = await findLastAiMessage();
  if (!lastAiMessage) { logger.warn(...); return; }
  const newContent = (getMessageContent(lastAiMessage) ?? '') + block;
  await updateMessageContent(lastAiMessage, newContent);           // 每个任务各写一次楼层
  debouncedEmitApiWrite();
}
```
问题：N 个 `era:*` 调用 = N 次 `setChatMessages` + N 个独立变量块堆在正文末尾，正文膨胀且 IO 次数线性增长。

#### 魔改版的实现（75 ms 批队列 + 任务合并 + 正文块压缩 + single-flight）

原文摘录（编译产物，`api/command.ts`）：

```js
const API_WRITE_FLUSH_DELAY = 75;
const VARIABLE_BLOCK_REGEX = /<(VariableInsert|VariableEdit|VariableDelete)>\s*([\s\S]*?)\s*<\/\1>/g;
const apiWriteQueue = [];
let apiWriteFlushTimer = null;
let apiWriteFlushPromise = null;
```

**(a) 入队而非直写**
```js
function performApiWrite(job) {
    apiWriteQueue.push({ blockTag: job.blockTag, blockContent: cloneJson(job.blockContent || {}) });
    scheduleApiWriteFlush();
}
function scheduleApiWriteFlush() {
    if (apiWriteFlushTimer !== null || apiWriteFlushPromise) return;
    apiWriteFlushTimer = setTimeout(() => { apiWriteFlushTimer = null; void flushApiWriteQueue(); }, API_WRITE_FLUSH_DELAY);
}
```

**(b) 三套按类型的相邻任务合并规则**
```js
mergeInsertFirstWins  // VariableInsert：同 key 先到值为准，缺失 key 继续补入
mergeUpdateLastWins   // VariableEdit：同 key 后到值为准
mergeDeleteUnion      // VariableDelete：并集；任一侧为空对象 {} 时，父节点整删优先
function mergeJobInto(targetJob, sourceJob) {
    if (targetJob.blockTag !== sourceJob.blockTag) return false;   // 不同类型不合并，保留 Insert/Edit/Delete 边界
    ...
}
```

**(c) 正文中已有变量块的原地压缩**
```js
function compressVariableBlocksInText(text) { ... }
// 扫描正文所有 <Variable*> 块；只有「相邻 + 中间空白 + 同类型」才合并；
// 合法 JSON 用紧凑 JSON.stringify 重写，无法解析的块原样保留
```

**(d) 一次 flush 只写一次楼层、只发一次 `era:apiWrite`，single-flight + 自动续排**
```js
async function flushApiWriteQueue() {
    if (apiWriteFlushPromise) return apiWriteFlushPromise;      // single-flight
    apiWriteFlushPromise = (async () => {
        const jobs = apiWriteQueue.splice(0);
        if (jobs.length === 0) return;
        const lastAiMessage = await findLastAiMessage();
        if (!lastAiMessage) { logger.warn('flushApiWriteQueue', '找不到任何 AI 消息，无法执行 API 写入。'); return; }
        const compactedOriginal = compressVariableBlocksInText(getMessageContent(lastAiMessage) ?? '');
        const mergedJobs = mergeAdjacentJobs(jobs);
        const appendedBlocks = mergedJobs.map(buildVariableBlock).join('');
        const newContent = compressVariableBlocksInText(compactedOriginal + appendedBlocks);
        await updateMessageContent(lastAiMessage, newContent);    // 一次写入
        eventEmit(ERA_EVENT_EMITTER.API_WRITE);                   // 一次广播
    })().finally(() => {
        apiWriteFlushPromise = null;
        if (apiWriteQueue.length > 0) scheduleApiWriteFlush();    // 续排
    });
    return apiWriteFlushPromise;
}
```

**(e) 块内容改用紧凑 JSON**
```js
function buildVariableBlock(job) {
    let contentString;
    try { contentString = JSON.stringify(job.blockContent ?? {}); }   // 紧凑，不再是 J() 的 2 空格缩进
    catch { contentString = J(job.blockContent ?? {}); }
    return '\n<' + job.blockTag + '>\n' + contentString + '\n</' + job.blockTag + '>';
}
```

**魔改小结**：解决的是「前端一回合发几十条 `era:*` → 楼层正文被几十个变量块撑爆 + 几十次 `setChatMessages`」。副作用要知道：`splice(0)` 先取走任务，**找不到 AI 消息或写入失败时这批任务丢失，不重新入队、调用方也收不到失败事件**（README P1 明确列为待修）。

**魔改版仍缺 `src/` HEAD 的三项能力**（若新卡需要，得重新构建 `src`）：
1. `api/writeScheduler.ts` 的可见性自适应调度（隐藏页 `queueMicrotask`、可见→隐藏时把 75 ms timer 提升为 microtask、注册失败立即 fallback）。魔改版是裸 `setTimeout`，**后台标签页会被 Chromium 节流十几秒到几分钟**。
2. `era:transactionByObject` 批事务与 `transactionId(s)` 回执。
3. `utils/diagnostics.ts` 的持久化环形诊断缓冲（`localStorage['era_diagnostics_v1']` / `window.ERADiagnostics.read() / .state() / .clear()`）。

### 1.11 与前端 / 世界书的协作方式

- **世界书 → AI**：`变量指导.txt` 教会 AI 输出上述三种指令块。核心约定摘录：
  - 「所有分析必须写在 `<VariableThink>` 中，指令块只包含纯净的 JSON」
  - 「可以连续使用多个不同类型的指令块，但是相同类型的变量修改指令要集成在一起」（**正好配合魔改版的相邻同类型合并**）
  - 「不要在指令块的 JSON 中添加注释」（配合 `parseJsonl` 的注释清理坑）
  - 「`stat_data.前端变量`（`周围地点`、`战力区`、`随机数`）是前端生成的只读上下文，禁止通过任何 `<Variable*>` 修改」
- **世界书 ← 变量**：条目里既可以用 `{{ERA:path}}` 宏，也可以直接 EJS 读 `getVariables({type:'chat'}).stat_data.前端变量.周围地点`。
- **前端 React**：唯一持久源是 `getVariables({type:'chat'}).stat_data`；普通游戏变量走 ERA（`era:*` → 等匹配的 `era:writeDone`）；变量编辑器等特殊场景走 `updateVariablesWith()` 直接写并发 `<卡名>:directVariableWriteDone`，**明确规定「直接写入不得伪造 `era:writeDone`」**。
- **事件脚本**：监听 `era:writeDone` 触发事件检查，用 `era:*` 写回事件结算差分，读世界书 `事件条目-*` / `成长条目-*`。

---

## 2. `隐藏楼层.js`

一个 jQuery `$(() => { ... })` IIFE，**不碰变量，纯 DOM + 生命周期协调**。与 nba2k 卡逐字节相同。

### 2.1 常量与状态（原文摘录）

```js
const SYNC_LATEST_MESSAGE_SHELL_EVENT      = 'wuxia:sync-latest-message-shell';
const WUXIA_TURN_LIFECYCLE_EVENT           = 'wuxia:turn-lifecycle';
const WUXIA_TURN_LOCK_ACK_EVENT            = 'wuxia:turn-lock-ack';
const WUXIA_TURN_RESPONSE_DELIVERED_EVENT  = 'wuxia:turn-response-delivered';
const TURN_LOCK_TIMEOUT_MS                 = 8 * 60 * 1000;   // 回合锁兜底 8 分钟
const TURN_RESPONSE_DELIVERY_TIMEOUT_MS    = 30 * 1000;       // 二段「回复送达」兜底 30 秒
const BLACK_BOX_STORAGE_KEY                = 'wuxia_iframe_lifecycle_black_box_v1';
const PENDING_RELOAD_REASON_STORAGE_KEY    = 'wuxia_iframe_pending_reload_reason_v1';
const MAX_BLACK_BOX_ENTRIES                = 240;
const PENDING_RELOAD_REASON_MAX_AGE_MS     = 30 * 1000;
const COLLAPSE_MAX_WAIT_MS                 = 2000;            // 防抖被反复重置时的封顶等待
const URGENT_COLLAPSE_REASONS = new Set([
  'turn-finish-event',
  'turn-lock-timeout',
  'turn-response-delivered',
  'turn-response-delivery-timeout',
  'explicit-latest-message-shell-sync',
]);
const SCRIPT_RUNTIME_ID = `hidden-floor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
```

### 2.2 「隐藏楼层」的用途与实现

**用途**：这类卡的 UI 是一整个 React 应用，跑在**最后一楼消息里的 iframe**中。酒馆原生会渲染全部历史楼层 DOM —— 每一楼都可能带一份 loader/iframe，导致内存暴涨、重复挂载、滚动错乱。所以脚本把 `#chat` 里除最后一楼外的 DOM **全部删掉**，让宿主只剩「一个楼层外壳 + 一个 iframe」。真正的历史仍在酒馆的聊天数据里（ERA 的 `SelectedMks` / EditLog 都基于聊天数据而非 DOM），DOM 只是显示层。

**实现要点**（`syncAndCollapseToLastMessage`）：

```js
$latest.addClass('last_mes');
$messages.not($latest).remove();
$('#show_more_messages').remove();
```

前置的三道保护：

1. **回合锁挂起**：`if (activeTurnRoundId || pendingResponseDeliveryRoundId) { ...记录 pendingMessageId...; return; }` —— 生成期间绝不动 DOM。
2. **编辑框保护**：
   ```js
   // 编辑框打开时不要删 DOM，否则会打断酒馆的编辑控件。
   if ($('#curEditTextarea').length > 0) { scheduleCollapse(250, expectedMessageId, 'editor-open-retry'); return; }
   ```
3. **`refresh:none` 新楼层没有宿主 DOM 时，复用旧外壳并改 mesid**（这是全脚本最精妙的一段，注释原文）：
   ```js
   // refresh:none 创建的新消息不会生成宿主 DOM。复用当前伪同层外壳时，必须同步
   // mesid 和楼层标题，酒馆的编辑按钮才会定位到真实最新消息。
   const $shell = $messages.filter('.last_mes').last().length > 0 ? $messages.filter('.last_mes').last() : $messages.last();
   $shell.attr('mesid', String(latestMessageId));
   $shell.data('mesid', latestMessageId);
   $shell.find('.mesIDDisplay').text(String(latestMessageId));
   await refreshOneMessage(latestMessageId, $shell);
   ```
   失败时**完整回滚 mesid / data / 标题**，并清掉 pending reload 标记。`syncInProgress` 做互斥。

**折叠调度器 `scheduleCollapse(delay, expectedMessageId, triggerReason)`**：

- `URGENT_COLLAPSE_REASONS` 里的原因 → `priority = 'urgent'`，`effectiveDelay = 0`，且**已排队的 urgent 不会被普通 DOM 变化推迟**：
  ```js
  if (collapseTimerPriority === 'urgent' && priority !== 'urgent') {
    // 回合完成或显式同步已经排队时，普通 DOM 变化不能把它推迟。
    return;
  }
  ```
- 普通原因 `effectiveDelay = Math.min(delay, COLLAPSE_MAX_WAIT_MS - elapsed)` —— **防抖有 2 秒封顶**，避免 MutationObserver 疯狂触发导致永远不执行。
- 每次触发都记 `triggerReasonCounts` / `resetCount` / `waitMs` 到黑匣子。

**触发源**：
- `MutationObserver` on `#chat`（childList，reason `chat-child-list-mutation`）与 `#sheld`（reason `shell-child-list-mutation`，同时重新 `observeChat()`）
- 酒馆事件：`MESSAGE_EDITED / MESSAGE_UPDATED / MESSAGE_SWIPED / MESSAGE_DELETED / MORE_MESSAGES_LOADED / USER_MESSAGE_RENDERED / CHARACTER_MESSAGE_RENDERED` → `scheduleCollapse(120, undefined, 'tavern-event:'+type)`
- 前端显式：`eventOn('wuxia:sync-latest-message-shell', id => scheduleCollapse(50, Number(id), 'explicit-latest-message-shell-sync'))`

### 2.3 回合锁 ACK 机制（本卡最值得复用的设计）

**要解决的问题**：前端 React 跑在最后一楼的 iframe 里。如果生成过程中脚本把那一楼的 DOM 删了/换了，**iframe 会被销毁重建，正在 `await generate()` 的前端逻辑直接蒸发**。所以必须让前端能「先锁住宿主，再开始一轮」。

**握手时序**（脚本侧 = `隐藏楼层.js`；前端侧 = `src/武侠/utils/turnLock.ts` + `hooks/useMessageHandler.ts`）：

```
前端 acquireWuxiaTurnLock(roundId, chatId)
  ├─ eventOn('wuxia:turn-lock-ack', ...)      先挂监听
  ├─ eventEmit('wuxia:turn-lifecycle', { phase:'start', roundId, chatId })
  └─ 等待 ACK，超时 WUXIA_TURN_LOCK_ACK_TIMEOUT_MS = 2_000 ms
                        ↓
脚本 eventOn('wuxia:turn-lifecycle') → payload.phase === 'start'
  ├─ lockTurn(roundId, chatId)   // activeTurnRoundId = roundId，起 8 分钟兜底 timer
  └─ eventEmit('wuxia:turn-lock-ack', {
       phase: 'locked', roundId, chatId,
       scriptRuntimeId: SCRIPT_RUNTIME_ID, lockedAt: Date.now(),
     })
                        ↓
前端拿到 roundId 匹配的 ACK → 才 createChatMessages(user) → generate() → createChatMessages(assistant)
                        ↓
前端 releaseWuxiaTurnLock(roundId, chatId, messageId, timeout, waitForResponseDelivery)
  └─ eventEmit('wuxia:turn-lifecycle', { phase:'finish', roundId, chatId, messageId, waitForResponseDelivery? })
                        ↓
脚本 unlockTurn(...) → scheduleCollapse(0, messageId, 'turn-finish-event')   // urgent，立即折叠
```

脚本侧关键代码（原文）：

```js
eventOn(WUXIA_TURN_LIFECYCLE_EVENT, payload => {
  if (!payload || typeof payload !== 'object') return;
  if (payload.phase === 'start') {
    const roundId = lockTurn(payload.roundId, payload.chatId);
    void eventEmit(WUXIA_TURN_LOCK_ACK_EVENT, {
      phase: 'locked', roundId, chatId: payload.chatId,
      scriptRuntimeId: SCRIPT_RUNTIME_ID, lockedAt: Date.now(),
    })
      .then(() => recordBlackBox('turn-lock-ack-sent', { roundId, chatId: payload.chatId }))
      .catch(error => recordBlackBox('turn-lock-ack-failed', { roundId, error: String(error) }));
    return;
  }
  if (payload.phase === 'finish') {
    unlockTurn(payload.roundId, payload.messageId, 'turn-finish-event', payload.waitForResponseDelivery === true);
  }
});
```

前端侧的失败语义（`turnLock.ts`）——**ACK 没到就直接失败，不建楼、不调模型**：

```
throw new Error('回合锁未确认，为避免生成过程中替换 iframe，本轮尚未创建用户楼层。');
```

**三项防死锁设计**：

1. **roundId 校验**：`unlockTurn` 里 `if (expectedRoundId && activeTurnRoundId && expectedRoundId !== activeTurnRoundId) { recordBlackBox('turn-unlock-ignored', {reason:'round-id-mismatch'}); return; }` —— 旧回合的迟到 finish 不会解开新回合的锁。ACK 侧同理（`isMatchingAck` 只认同 roundId）。
2. **8 分钟兜底 timer**：`turnLockTimer` 到期 → warn → `unlockTurn(..., 'turn-lock-timeout')`。前端崩了也能自愈。
3. **`CHAT_CHANGED` 强制清锁**：切聊天时清空 `activeTurnRoundId / pendingMessageId / pendingResponseDelivery*`、清所有 timer，然后 `reloadIframe()`。

**二段锁：`waitForResponseDelivery`**
`phase:'finish'` 带 `waitForResponseDelivery: true` 时，脚本**不立刻折叠**，而是转入「等待回复送达」态：

```js
if (waitForResponseDelivery && releasedRoundId) {
  pendingResponseDeliveryRoundId  = releasedRoundId;
  pendingResponseDeliveryMessageId = latestPendingMessageId;
  responseDeliveryTimer = setTimeout(() => { ... finishDeferredResponseDelivery(..., 'turn-response-delivery-timeout'); },
                                     TURN_RESPONSE_DELIVERY_TIMEOUT_MS); // 30s
  recordBlackBox('turn-refresh-deferred-for-response-delivery', { roundId, messageId });
  return;
}
```
直到前端发 `wuxia:turn-response-delivered`（或 30 秒超时）才 `scheduleCollapse(0, ..., 'turn-response-delivered')`。用途：ERA `era:apiWrite` 追加变量块 → `era:writeDone` 这一段还在跑，此时换 DOM 依然危险。

### 2.4 黑匣子（诊断）

```js
localStorage['wuxia_iframe_lifecycle_black_box_v1']   // 环形，最多 240 条
// entry: { id, timestamp, source:'hidden-floor', event, runtimeId, details }
localStorage['wuxia_iframe_pending_reload_reason_v1'] // 单条，30 秒过期
```
记录的事件名：`hidden-floor-script-boot / turn-lock-acquired / turn-lock-ack-sent / turn-lock-ack-failed / turn-lock-released / turn-unlock-ignored / turn-lock-timeout / turn-refresh-deferred-for-response-delivery / turn-response-delivery-released / turn-response-delivery-ignored / turn-response-delivery-timeout / shell-sync-deferred-by-turn-lock / refresh-one-message-started / refresh-one-message-returned / iframe-reload-requested / collapse-debounce-fired / hidden-floor-script-pagehide`。

`markPendingReloadReason()` 在 `refreshOneMessage` / `reloadIframe` 前落盘一条「即将重载，原因是 X」，iframe 重建后 `pagehide` 处理器读回来，把「这次重载是我自己干的 vs 外部原因」区分开。**这是排查 iframe 莫名重载的关键手段，强烈建议照搬。**

清理（`pagehide`）：记一条黑匣子 → 清 collapseTimer → `chatObserver?.disconnect()` / `shellObserver?.disconnect()` → `clearTurnLockTimer()`。

---

## 3. `调试.js`

**用途**：一次性诊断脚本（`启用: false`，靠按钮手动跑），回答「为什么事件脚本读不到事件条目」。

流程：`getCharWorldbookNames('current')` 取 primary + additional → 逐本 `getWorldbook(name)` → 打印全部条目名与启用状态 → 过滤 `entry.name.startsWith('事件条目-')` → 对每个条目 `JSON.parse(entry.content)` 并打印 `事件地点` / `触发条件` / `事件结束时间`，解析失败则打印前 200 字符。全程 `console.group` + `toastr` 提示。

配置项只有一个常量：

```js
const EVENT_KEY_PREFIX = "事件条目-";
```

> 注意它与 `src/事件脚本` 已经脱节：README 里前缀是 `EVENT_KEY_PREFIXES: ['事件条目-', '成长条目-']`，且生产环境事件数据已改为从 `src/事件脚本/generated/event-data/` 的 manifest + 分片加载，世界书扫描只是 `ERA_EVENT_DATA_PROVIDER=worldbook` 的调试回退。

角色卡里这个脚本条目还挂了一大串隐藏按钮（`初始化测试变量`、`API: Insert (Object)`、`API: Insert (Path)` 等），说明它历史上还承担过 ERA API 手动冒烟测试的角色，当前文件内容只剩世界书读取部分。

---

## 4. 复刻新卡时的处置建议

### 4.1 逐块标注

| 模块 / 机制 | 处置 | 说明 |
| --- | --- | --- |
| `隐藏楼层.js` 折叠逻辑（MutationObserver + scheduleCollapse + 只留 last_mes） | **原样照搬** | 已验证跨卡通用（与 nba2k 卡逐字节相同）；不依赖任何变量结构 |
| `隐藏楼层.js` 回合锁 ACK / 二段送达锁 / 黑匣子 | **原样照搬** | 同上。只有当新卡前端不是「iframe 内 SPA」时才不需要 |
| `隐藏楼层.js` 的 `wuxia:` 事件名前缀 | **原样照搬（建议）** | nba2k 也没改前缀。**若改名，必须同步改前端 `turnLock.ts` 的四个常量**，两边任一漏改 = 前端每回合抛「回合锁未确认」 |
| `隐藏楼层.js` 的超时常量（8 min / 30 s / 2000 ms / 250 ms / 120 ms / 50 ms） | **需要改配置（通常不用改）** | 8 分钟对应「最慢的一次 generate」；若新卡走多轮 agent 流程可能要调大 |
| 依赖的酒馆助手 API（`getLastMessageId` / `refreshOneMessage` / `reloadIframe` / `SillyTavern.getCurrentChatId`）与 DOM 选择器（`#chat > .mes`、`#sheld`、`.last_mes`、`[mesid]`、`.mesIDDisplay`、`#curEditTextarea`、`#show_more_messages`） | **原样照搬，但需版本验证** | 这些是酒馆内部 DOM 约定，酒馆大版本升级后要回归 |
| ERA 框架 bundle 本体（21 模块） | **原样照搬** | 变量结构无关，纯通用引擎 |
| ERA `魔改` 的 `api/command.ts`（75 ms 批队列 + 合并 + 压缩） | **原样照搬** | 只要新卡也是「前端一回合发多条 `era:*`」的模式就该用魔改版 |
| ERA 脚本按钮三枚（`写入变量修改` / `手动同步状态` / `强制完全重算`） | **原样照搬** | 按钮名是 `getButtonEvent('...')` 硬编码的，**名字不能改** |
| ERA 脚本变量 `强制重载功能` / `强制重载消息数` | **需要改配置** | 与隐藏楼层脚本共用时**必须保持 `false` / `0`**（DOM 只剩一楼，重渲染会打架） |
| ERA 事件分组 / 防抖窗口 / 对冲组合规则（`merger.ts`） | **原样照搬** | 除非新卡有特殊的 swipe/重生成流程 |
| ERA 数据模型（`ERAMetaData.EditLogs` / `SelectedMks` / `stat_data`） | **原样照搬** | 是框架契约，别动 |
| `stat_data` 下的**具体业务结构**（`世界信息.时间`、`事件系统`、`角色数据`、`user数据.所在位置`、`前端变量.*`…） | **需按变量结构改写** | 全部是题材专用。前端 `readGameDataPure()`、事件脚本、世界书条目三处都强耦合 |
| `变量指导.txt` | **需按变量结构改写** | 骨架（三大指令使用场景 / `<VariableThink>` / 输出格式要求 / 「同类型指令集成在一起」/ 「不要写注释」/ 「前端派生区只读」）可照搬；「事件进度与时间结算规则」「战斗判定协议」是题材专用 |
| `$template` / `$meta.updatable` / `$meta.necessary` 的用法 | **需按变量结构改写** | 机制照搬，具体挂在哪些节点上按新卡定 |
| `调试.js` | **需要改配置** | 改 `EVENT_KEY_PREFIX`；若新卡没有「世界书事件条目」体系则整个删掉 |
| `ERA变量框架-1.0.5.js` | **可以不带** | 纯回退备份，新卡直接只带魔改版即可 |

### 4.2 复刻时必须一并带走的隐性约定

1. **前端建楼必须 `refresh:none`**，否则酒馆会重渲染 DOM、iframe 重建。隐藏楼层脚本里那段「复用外壳改 mesid + `refreshOneMessage`」的补偿逻辑，就是为 `refresh:none` 兜底的。
2. **`era:*` 写入没有回执**，前端必须自己等匹配的 `era:writeDone`（按 `mk` / `message_id` 匹配），且**只等原始写入，不等同一事件上更慢的 UI 刷新/后台补全监听器**。
3. **直接写入（`updateVariablesWith`）不得伪造 `era:writeDone`**，另发自己的完成信号（本卡用 `wuxia:directVariableWriteDone`）。
4. **变量结构里避开三个保留 token** `__DOT__` `__DQUOTE__` `__SQUOTE__`，避开 key 里的 `.` `"` `'`，避开「对象数组」。
5. **世界书里读变量统一用大写无空格的 `{{ERA:...}}`**。
6. 世界书让 AI 写 JSON 时**不能出现 `//`、`/* */`、`<!-- -->`，也要小心 URL**（`parseJsonl` 会截断）。
7. `era:updateByPath` 的 **`value: '+=10'` 是文档谎言**，运算表达式未实现，别在新卡的提示词里教 AI 这么写。
8. 若新卡会长时间挂后台标签页，**魔改版的裸 `setTimeout` 会被节流**，考虑从 `src/ERA变量框架/` 重新构建以拿到 `writeScheduler` 的隐藏页 microtask 路径：
   ```bash
   pnpm exec webpack --mode development --env srcOnly=true
   # → dist/ERA变量框架/index.js
   ```

### 4.3 已知缺陷清单（照搬时要心里有数）

- **P0**：`processQueue` 没有最外层 `try/finally`，`dispatchAndExecuteTask` 的 `finally` 里 `await updateLatestSelectedMk()` 抛错会**永久锁死事件队列**，此后所有 ERA 事件停止处理。表现为「变量突然不再更新，也不报错」。
- API flush 失败（找不到 AI 消息 / 写入失败）时任务**静默丢失**，无重试、无失败事件。
- 删光全部消息不会清理旧 `stat_data` / `SelectedMks`。
- CRUD 与 EditLog 不是同一事务，中途失败会留下不可回滚状态。
- 损坏的 EditLog 被 `parseEditLog` 当成空日志，可能**跳过必要的回滚**。
- `findLastAiMessage` 只排除 user，**system 消息也会被当成指令注入目标**。
- 日志级别硬编码 `debug`，长会话有可观的 `cloneDeep` / `JSON.stringify` 开销。
- EditLog 无 GC 策略，长会话无限增长。
