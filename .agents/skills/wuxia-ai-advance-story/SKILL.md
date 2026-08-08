---
name: wuxia-ai-advance-story
description: 通过外部 Playwright/CDP UI runner 推进或检查 SillyTavern 武侠游戏的真实回合，并在本轮变量调试不足以定位问题时按需读取变量页的完整聊天级 stat_data。用于剧情推进、多轮 UI 回归、提示词与变量调试、会话定位或武侠自动化故障排查；默认调用 pnpm wuxia:ui。真实推进会新增聊天楼层并修改当前存档。
---

# 武侠剧情测试

默认从仓库根目录运行 `pnpm wuxia:ui`。runner 通过 Playwright CDP 连接用户手动启动的专用 Chrome，不会启动、关闭或切换浏览器窗口；它负责发送、等待 DOM 旋转、重新获取 iframe、读取纯正文与四个调试区。

旧 CLI/Relay 只用于专项兼容诊断。不要用 `pnpm wuxia turn`、iframe `runTurn` RPC、Relay 或桥接执行真实多轮推进，也不要复制 runner 源码。

## 开始前

1. 确认专用 Chrome 已以 CDP 开放，默认地址为 `http://127.0.0.1:9333`，并保持酒馆武侠页面打开。若地址或页面不同，使用 `--endpoint` 或 `--page-url`。runner 默认允许 Playwright 等待最多 30 秒完成 CDP 连接初始化。
2. 先运行只读检查：

```powershell
pnpm wuxia:ui -- --inspect-only
```

3. `--inspect-only` 只检查当前 iframe、基础自动化标记、空闲状态和最新回复，不要求历史调试记录。不要为取得调试框而发送行动。
4. 仅在用户明确要求推进剧情、真实回归，或已授权的测试聊天中发送行动。未指定轮数时默认一轮。

## 真实推进

```powershell
pnpm wuxia:ui -- --turns 1 --action "前往客栈打探消息" --output wuxia-ui-report.json
```

多轮使用 `--turns`；一个 `--action` 会在每轮重复，也可以每轮各传一个 `--action`。逐轮检查 `reply`、四个调试区、`success` 和 `failedSections`。runner 已验证本轮正文输入与行动一致；不要缓存跨轮 Frame 或 iframe 内运行实例。

```powershell
pnpm wuxia:ui -- --turns 5 --action "在客栈向掌柜打听消息" --output wuxia-ui-rounds.json
```

- `inline`：正文输入、输出应为成功；额外变量输入、输出为 `skipped` 是预期结果。
- `extra`：正文与额外变量输入、输出均应完成且无 `error`；调试区已明确确认变量持久化时，不要例行读取完整变量树。
- 仅在用户明确要求收集后续故障时使用 `--continue-on-error`；它不是重试机制。

## 按需读取完整变量

普通推进不得在每轮前后读取完整 `stat_data`。只有出现以下任一情况，且本轮四个调试区无法定位原因时，才读取一次当前完整变量：

- 额外变量模型、解析或持久化状态为 `error`、`failed` 或 `inconclusive`。
- 变量模型声明的 Insert/Edit/Delete 与页面报告的最终结果矛盾。
- 用户明确要求核对完整变量结构、隐藏字段或最终落地值。

使用变量页的只读快照：

```powershell
pnpm wuxia:ui -- --inspect-only --stat-data-snapshot --output wuxia-stat-data-diagnostic.json
```

读取 `inspect.statDataSnapshot.statData`，按具体可疑路径检查最终值。该数据直接来自聊天级
`getVariables({ type: 'chat' }).stat_data`，不会经过变量树的分组、搜索或隐藏字段过滤。完整结构可能很大，只读取与故障有关的路径并概述结论，不要在回复中倾倒整棵变量树。

如果用户明确要求回合前后完整差分，可以在发送前和发送后分别显式调用一次该命令，并在本地比较 JSON；这不是默认流程。

## 旧桥专项诊断

只有任务明确要求排查 Relay/桥协议时，才使用 `pnpm --silent wuxia status` 或 `pnpm --silent wuxia snapshot`。Relay 离线不再阻塞 UI runner 的普通推进或完整变量读取。

## 安全与停止条件

- 未在 15 秒内检测到页面进入 `generating: true` 时，先运行 `--inspect-only`。若页面已空闲、最新 assistant 正文未变化，且没有生成中的迹象，可将本次视为未发送成功并重发同一行动一次；重发后仍未进入生成，停止并报告。若页面正在生成、最新正文已变化、CDP 断开、iframe 换代异常或发送后读取失败，停止并报告，不再重发。变量异常且调试区不足时，再加 `--stat-data-snapshot`。
- 页面正在生成、输入框禁用、目标不唯一、找不到游戏 iframe、缺少基础自动化标记或 CDP 不可达时，不发送新行动。
- 变量模型失败、变量解析失败、落地验证 `failed` / `inconclusive`、模型 429 或调试区 `error` 都是测试发现；在本轮完成且下一轮不会重复发送时，按用户指定轮数继续。
- 不调用变量写入、删除楼层、`triggerSlash` 或绕过真实发送链的 `generate()`。

### 长时间卡住的生成恢复

若某回合已确认发送、页面长期维持 `generating: true`，且最新正文在多次只读检查中不再变化，可将其视为酒馆后台或模型返回卡住。不要再次发送行动；先通过 runner 的显式终止操作点击酒馆的终止按钮：

```powershell
pnpm wuxia:ui -- --stop-generation --output wuxia-stop-generation.json
pnpm wuxia:ui -- --inspect-only
```

`--stop-generation` 只会在当前确实处于生成状态时，通过终止图标 `i.fa-circle-stop` 的可点击容器停止生成，并等待页面重新空闲。只有第二个命令确认 `generating: false`、输入框恢复可用后，才可重新发送刚才那条行动一次。终止失败、页面仍忙或 iframe 异常时，停止并报告，不要重发。

## 故障归类

- CDP 不可达：确认专用 Chrome 与 `9333`。
- 找不到游戏 iframe 或基础标记：确认酒馆页面、武侠页面及最新构建已刷新。
- 调试区为空：当前会话没有已保存的 UI 调试回合；首轮后再读取，不把它归因为 DOM 选择器失效。
- `BUSY` 或基础 UI 自动化标记缺失：停止推进，用 `--inspect-only` 定位并恢复可判定状态。
- `MULTIPLE_BRIDGES`、`BRIDGE_OFFLINE`、`AUTOMATION_NOT_READY`：仅影响旧 Relay 专项诊断，不单独阻塞已通过 `--inspect-only` 的 UI runner。
