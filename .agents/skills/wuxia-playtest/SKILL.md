---
name: wuxia-playtest
description:
  通过本地 wuxia CLI 读取 SillyTavern
  武侠游戏快照、推进真实剧情回合，并检查主模型提示词、变量调试回复和变量更新验证。用于推进剧情、测试变量提示词、诊断变量未更新、核对状态栏数据或执行武侠回归测试；真实推进会新增聊天楼层并修改当前存档。
---

# 武侠剧情测试

从仓库根目录运行 CLI。CLI 通过 `pnpm watch` 和酒馆助手后台桥调用真实的 `WuxiaAutomation`，不要自行操作变量或伪造楼层。

## 标准流程

1. 运行 `pnpm --silent wuxia status`，确认 `serverOnline`、`bridgeConnected` 和 `readyBridgeCount`。
2. 运行 `pnpm --silent wuxia snapshot`，读取当前聊天、正文、选项、最近楼层、`statData` 和已有调试结果。
3. 根据用户指定的行动推进；用户只要求“继续/推进剧情”时，从正文和选项中选择一个连贯且信息量足够的行动。默认一次只推进一轮。
4. 运行 `pnpm --silent wuxia turn --input "玩家行动"`。
5. 检查返回报告中的：
   - `ok`、`rawReply` 和 `error`
   - `debug.main` 的最终提示词及主模型输出
   - `debug.variable` 的输入、输出、解析状态和错误
   - `variableVerification.verdict`、`parseErrors`、`comparisonStatusCounts`
   - `statDataBefore` 与 `statDataAfter`
6. 用简短结论报告剧情结果、提示词异常、变量声明是否落地，以及值得修改的提示词或代码位置。

## 命令

```powershell
pnpm --silent wuxia status
pnpm --silent wuxia snapshot
pnpm --silent wuxia turn --input "前往客栈打探消息"
```

多个酒馆页面在线时，从 `status.data.bridges` 选择目标并添加以下任一参数：

```powershell
--bridge-id <id>
--session-id <id>
--chat-id <id>
```

需要调整变量落地等待时间时才使用：

```powershell
--settle-timeout-ms 10000 --settle-delay-ms 120
```

## 安全规则

- `turn` 是真实写操作。仅在用户要求推进剧情、测试真实回合，或已明确授权的测试聊天中运行。
- 未指定轮数时只推进一轮；不要自行连续循环。
- `variableVerification.verdict` 为 `failed` 或 `inconclusive` 时停止推进，先报告解析错误、比较结果和变量差异。
- 收到 `OUTCOME_UNKNOWN` 时绝不重试原行动；先执行 `snapshot`，通过最近楼层和状态变量判断是否已经完成。
- 收到 `MULTIPLE_BRIDGES` 时不要猜测目标，列出候选会话并请用户选择。
- 不调用任意变量写入、删除楼层、`triggerSlash` 或绕过真实发送链的 `generate()`。
- 调试信息可能包含完整角色卡和世界书提示词；不要发送到任务范围外的系统。

## 故障判断

- `SERVER_OFFLINE`：`pnpm watch` 未运行或 6621 不可达。
- `BRIDGE_OFFLINE`：角色卡中的“武侠自动化桥（本地开发）”未启用，或脚本未加载。
- `AUTOMATION_NOT_READY`：尚未进入武侠游戏页，或状态栏正在热重载。
- `BUSY`：已有生成正在运行；等待完成后重新读取快照，不要排队新的回合。
