---
name: wuxia-ui-playtest
description: 通过外部 Playwright/CDP UI runner 推进或检查 SillyTavern 武侠游戏的真实回合，并按需使用旧 CLI 做状态、快照、stat_data 和变量持久化诊断。用于剧情推进、多轮 UI 回归、提示词与变量调试、会话定位或武侠自动化故障排查；默认调用 pnpm wuxia:ui。真实推进会新增聊天楼层并修改当前存档。
---

# 武侠剧情测试

默认从仓库根目录运行 `pnpm wuxia:ui`。runner 通过 Playwright CDP 连接用户手动启动的专用 Chrome，不会启动、关闭或切换浏览器窗口；它负责发送、等待 DOM 旋转、重新获取 iframe、读取纯正文与四个调试区。

旧 CLI 只用于诊断。不要用 `pnpm wuxia turn`、iframe `runTurn` RPC、Relay 或桥接执行真实多轮推进，也不要修改或复制 runner 源码。

## 开始前

1. 确认专用 Chrome 已以 CDP 开放，默认地址为 `http://127.0.0.1:9333`，并保持酒馆武侠页面打开。若地址或页面不同，使用 `--endpoint` 或 `--page-url`。
2. 先运行只读检查：

```powershell
pnpm wuxia:ui -- --inspect-only
```

3. `--inspect-only` 没有历史调试记录时可返回空记录或失败；这只表示当前会话还未通过 UI 发送过一轮，不是首轮发送的阻塞条件。不要为取得调试框而重发行动。
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
- `extra`：正文与额外变量输入、输出均应完成且无 `error`；随后执行变量持久化诊断。
- 仅在用户明确要求收集后续故障时使用 `--continue-on-error`；它不是重试机制。

## 结构化诊断

需要确认目标、诊断旧桥接、比较 `stat_data`、验证变量落地或判断结果未知时，使用旧 CLI 的只读命令：

```powershell
pnpm --silent wuxia status
pnpm --silent wuxia snapshot
```

多个酒馆页面或会话存在时，先从 `status` 选择唯一目标，再以 `--bridge-id`、`--session-id` 或 `--chat-id` 进行诊断。将 UI runner 的正文和调试报告与 snapshot 的最近楼层、`statData`、变量验证结果交叉比对；调试内容可能含完整提示词、角色卡或世界书，只在当前任务范围内保留和概述。

## 安全与停止条件

- 结果未知、超时、CDP 断开、iframe 换代异常或发送后读取失败时，绝不重发同一行动。先运行 `--inspect-only` 与 `wuxia snapshot`；只有能唯一确认行动尚未发送时才可重新发送，否则停止并报告不确定性。
- 页面正在生成、输入框禁用、目标不唯一、找不到游戏 iframe、缺少基础自动化标记或 CDP 不可达时，不发送新行动。
- 变量模型失败、变量解析失败、落地验证 `failed` / `inconclusive`、模型 429 或调试区 `error` 都是测试发现；在本轮完成且下一轮不会重复发送时，按用户指定轮数继续。
- 不调用变量写入、删除楼层、`triggerSlash` 或绕过真实发送链的 `generate()`。

## 故障归类

- CDP 不可达：确认专用 Chrome 与 `9333`。
- 找不到游戏 iframe 或基础标记：确认酒馆页面、武侠页面及最新构建已刷新。
- 调试区为空：当前会话没有已保存的 UI 调试回合；首轮后再读取，不把它归因为 DOM 选择器失效。
- `MULTIPLE_BRIDGES`、`BRIDGE_OFFLINE`、`AUTOMATION_NOT_READY` 或 `BUSY`：停止推进，使用 `status` / `snapshot` 定位并恢复可判定状态。
