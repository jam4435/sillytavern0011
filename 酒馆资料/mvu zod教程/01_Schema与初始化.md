# 01. Schema 与初始化

目标：设计一份稳定、可校验、能被 AI 正确更新的 `stat_data` 结构，并让新聊天得到合法初始值。

## 1. 先决定什么值得成为变量

适合记录：

- 时间、地点、天气、当前任务等持续世界状态；
- 好感、阶段、伤势、资源等影响后续表现的状态；
- 物品栏、技能、关系网等会增删的集合；
- 状态栏必须展示或允许玩家修改的数据。

通常不该记录：

- 角色固定人设和世界观；
- 只在当前回复有效的动作或情绪修辞；
- 聊天记录已经明确、以后不会影响逻辑的细枝末节；
- 能从其他字段可靠推导出的重复数据；
- 会无限增长的完整日志、逐回合流水账。

设计原则：**变量少而有用，字段名稳定，层级表达语义，动态集合有清理规则。**

## 2. 四种路径必须分清

假设 Schema 中有 `角色.络络.好感度`：

| 场景                  | 正确写法                        |
| --------------------- | ------------------------------- |
| `schema.ts`           | `角色.络络.好感度`              |
| `initvar.yaml`        | `角色: { 络络: { 好感度: 0 } }` |
| EJS、宏、合并变量读取 | `stat_data.角色.络络.好感度`    |
| JSON Patch            | `/角色/络络/好感度`             |
| 状态栏 Pinia store    | `store.data.角色.络络.好感度`   |

Schema 与 initvar 表示的就是 `stat_data` 内部内容，不能再包一层 `stat_data`。

## 3. 一个可复用的最小 Schema

```ts
// src/角色卡名/schema.ts
export const Schema = z.object({
  世界: z.object({
    当前时间: z.string(),
    当前地点: z.string(),
    近期事务: z.record(z.string().describe('事务名'), z.string().describe('事务说明')),
  }),

  角色: z.object({
    络络: z.object({
      好感度: z.coerce.number().transform(value => _.clamp(value, 0, 100)),
      心情: z.enum(['平静', '开心', '低落', '愤怒']),
      着装: z.record(z.enum(['上装', '下装', '鞋子', '饰品']), z.string().describe('当前服装描述')),
    }),
  }),

  主角: z.object({
    物品栏: z
      .record(
        z.string().describe('物品名'),
        z.object({
          描述: z.string(),
          数量: z.coerce.number().int(),
        }),
      )
      .transform(items => _.pickBy(items, item => item.数量 > 0)),
  }),
});

export type Schema = z.output<typeof Schema>;
```

仓库已全局提供 `z` 和 `_`，通常无需 import。必须导出名为 `Schema` 的值，类型使用 `z.output<typeof Schema>`。

## 4. Zod 选型规则

### 文本与枚举

```ts
z.string();
z.literal('固定值');
z.enum(['未开始', '进行中', '已完成']);
z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
```

- 只有有限合法值时用 `z.enum`，减少模型自由发挥。
- 自由描述用 `z.string()`，并用 `.describe()` 帮助理解生成的 schema。
- 格式非常重要时才加正则；避免因无关格式问题拒绝整次变量更新。

### 数字

```ts
z.coerce.number().transform(value => _.clamp(value, 0, 100));
```

AI 可能输出数字字符串，因此优先 `z.coerce.number()`。对好感度等范围值，使用幂等 transform 纠正通常比 `.min(0).max(100)`
直接拒绝更稳。

不要随意使用 `z.coerce.boolean()`：非空字符串 `'false'` 也可能被转成 `true`。布尔值优先
`z.boolean()`，或明确预处理允许的字面量。

### 动态对象

```ts
z.record(z.string().describe('任务名'), z.string());
```

适合物品栏、任务表、称号表等按名称索引的集合。它比数组索引更适合 JSON Patch，也更容易让 AI 定位。

枚举键全部必需：

```ts
z.record(z.enum(['上装', '下装', '鞋子']), z.string());
```

枚举键允许缺少：

```ts
z.partialRecord(z.enum(['上装', '下装', '鞋子']), z.string());
```

### 默认值与可选字段

只在业务上确实允许缺失时使用 `.default()`、`.prefault()` 或 `.optional()`。不要用大量 `.optional()` 掩盖 `initvar`
不完整的问题。

可被 JSON Patch `remove`、但解析后应自动恢复的字段，可用字段级 `prefault`：

```ts
备注: z.string().prefault('无'),
```

### transform

transform 适合：

- 数值夹取；
- 删除数量不大于 0 的物品；
- 限制动态对象最大长度；
- 在嵌套对象内生成只供界面使用的派生值。

必须满足幂等性：

```text
Schema.parse(Schema.parse(input)) 与 Schema.parse(input) 结果一致
```

根节点必须保持 plain `z.object(...)`。当前 `defineMvuDataStore` 要求根是 `z.ZodObject`，不要对根对象调用 `.transform()`
或 `.prefault()`；把变换放进字段或嵌套对象。

### 只读字段

当前 MVU Zod 注册器会拒绝更新任一路径段以 `_` 开头的字段。此类字段不要出现在 AI 更新规则中。

版本相关的其他前缀行为不要凭旧资料假设；只有当前项目代码明确使用时才采用。

## 5. initvar 必须完整匹配 Schema 输入

与上面 Schema 对应：

```yaml
# yaml-language-server: $schema=../../schema.json
# 先运行 pnpm watch 或 pnpm build 生成 schema.json
世界:
  当前时间: 2026-07-13 08:00
  当前地点: 教室
  近期事务:
    新生报到: 今天内完成报到手续

角色:
  络络:
    好感度: 10
    心情: 平静
    着装:
      上装: 白色衬衫
      下装: 深色半身裙
      鞋子: 黑色皮鞋
      饰品: 无

主角:
  物品栏:
    学生证:
      描述: 刚领取的新学生证
      数量: 1
```

检查规则：

- 字段名、层级和数据类型与 Schema 一致；
- 所有必填输入字段都存在；
- 不包 `stat_data`；
- 不填写由 transform 产生的派生输出字段；
- 日期时间建议写成明确字符串格式；
- 初始值描述开局已发生的事实，不提前写未发生剧情。

## 6. 注册 Schema

Schema 文件保持纯定义。注册放在独立脚本：

```ts
// src/角色卡名/脚本/变量结构/index.ts
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
import { Schema } from '../../schema';

$(() => {
  registerMvuSchema(Schema);
});
```

在 `index.yaml` 的酒馆助手脚本库中导入它的编译产物。不要把 `registerMvuSchema` 写进 `schema.ts`。

MVU 本体由 `index.yaml` 脚本库加载；模板中的 `脚本/MVU/index.ts`
是对应源码/组织文件，是否引用其构建产物以目标卡现有配置为准，不要重复加载两次。

## 7. schema.json 与构建

构建脚本只扫描 `src/**/schema.ts`。因此：

- 新卡必须位于 `src/`；
- `Schema` 必须可被导入；
- 运行 `pnpm watch` 或项目要求的 build 后应生成 `schema.json`；
- `initvar.yaml` 的第一行应引用它；
- `schema.json` 是输入侧 schema，transform 派生字段不在其中是正常现象。

如果 YAML 编辑器报错，优先修正 Schema 与 initvar，不要删除 schema 注释逃避校验。

## 8. Schema 设计完成条件

- [ ] 每个变量都有跨回合用途。
- [ ] 根是 `z.object`，没有外层 `stat_data`。
- [ ] 数字、枚举、动态对象的类型足够具体。
- [ ] transform 幂等，不会越 parse 越变化。
- [ ] initvar 包含全部必填输入字段。
- [ ] 动态集合有数量上限或清理策略。
- [ ] Schema、initvar、后续更新规则将使用完全相同的路径。
