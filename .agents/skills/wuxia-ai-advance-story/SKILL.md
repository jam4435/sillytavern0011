---
name: wuxia-ai-advance-story
description:
  通过 Playwright/CDP UI runner 从酒馆新聊天完成武侠角色预设与开局事件选择，或推进、检查、受控重新生成真实回合，并用渐进式诊断研究事件完成轮数、正文连续性、跨事件接续、变量执行与参与事件结算。用于更换开局时间或事件、完整开局回归、单轮或多轮剧情推进、提示词对照重生成和变量故障定位；默认调用 pnpm wuxia:ui。完整开局会创建并初始化聊天，真实推进会新增聊天楼层，受控重生成会新增 swipe。
---

# 武侠剧情推进与审计

从仓库根目录调用 `pnpm wuxia:ui`。runner 通过 Playwright
CDP 连接用户手动启动的专用 Chrome，负责真实发送、等待生成、重新获取 iframe、读取回复与四个调试区。不要复制 runner 源码，也不要用旧 CLI、Relay、iframe
RPC 或桥接代替真实发送链。

## 选择工作流

- 普通推进或检查：遵循本文件；用户未指定轮数时默认一轮。
- 更换开局时间或事件，或从酒馆页完整测试“进入聊天 → 角色预设 → 开局事件 → 首轮剧情”：使用“完整新开局”工作流。现有 `opening/game` 存档不能返回角色创建页更换事件，必须从新的空聊天开始。
- 研究事件完成轮数、固定输入连续推进、跨事件接续、正文偏航、参与事件变量正确性或事件时间窗口：必须先完整读取
  [references/story-progression-audit.md](references/story-progression-audit.md)，再执行。不要为普通单轮任务加载该文件。
- 研究同一用户输入在不同提示词下的稳定性：仅在用户明确要求重试、重新生成或控制变量实验时，读取同一审计协议并使用
  `--regenerate`。

## 开始前

1. 启动或复用固定的测试专用 Chrome profile。默认 CDP 地址为 `http://127.0.0.1:9333`。在 Codex 等会清理命令子进程的受管理环境中，优先调用 Skill 自带的 WMI 启动器：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .agents/skills/wuxia-ai-advance-story/scripts/start-wuxia-chrome.ps1
```

   启动器先复用已监听的 `9333`；否则通过 `Win32_Process.Create` 创建脱离当前命令任务树的 Chrome，并等待 `/json/version` 可读。它不会注册计划任务、关闭日常 Chrome 或清理 profile。不要用 `cmd start`、普通后台 `&` 或受管理 shell 内的 `Start-Process` 反复尝试；这些方式可能产生空命令窗，或在命令结束时连带终止 Chrome。

   用户手动启动时使用相同参数：

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9333 `
  --user-data-dir="F:\Develop\AI\sillytavern\.wuxia-chrome-profile" `
  "http://127.0.0.1:8000/"
```

   该 profile 是测试配置的唯一持久化位置：主题、额外变量模式、API profile 等浏览器端设置会跨重启保留。不得改用临时目录、无 `--user-data-dir` 的 Chrome，或日常 Chrome 的 Default profile；不得删除或清空此目录。仅在用户明确要求时才变更端口或 profile 路径，并同步向启动脚本传入 `-Port`、`-ProfilePath`、`-PageUrl`，向 runner 使用 `--endpoint`、`--page-url`。
   默认复用并持续保留这个专用 Chrome。测试结束后不要顺手关闭浏览器或终止其后台任务，以免下一组提示词测试重新等待酒馆和武侠 iframe 加载。只有用户明确要求关闭、实例异常必须重启，或本次任务明确声明使用一次性临时浏览器时才终止；保留时在报告中注明 CDP 地址和后台任务 ID（若有）。
2. 新启动或重启专用 Chrome 时，必须同时打开酒馆网页 `http://127.0.0.1:8000/`，不要只启动空浏览器、停在新标签页或依赖会话自动恢复。确认该 Chrome 已开放 CDP，并保持酒馆武侠页面打开；不同地址或页面使用
   `--endpoint` 或 `--page-url`。
3. 先只读检查：

```powershell
pnpm wuxia:ui -- --inspect-only
```

4. 确认页面空闲、输入可用、iframe 与基础自动化标记正常。研究任务还必须按审计协议区分生成资产的计划窗口与聊天变量中的实际运行时窗口；两者因弹性提前入场或同地点相对平移不同，不单独构成污染或停止条件。不要为了取得历史调试区而发送行动。
5. 仅在用户明确要求推进、真实回归，或已授权测试聊天时发送行动。

## 完整新开局与更换开局事件

角色预设保存在测试专用 Chrome profile 的 `localStorage`。先确认要加载的预设完整名称或 ID，以及目标事件完整名称或 ID；名称必须唯一。默认角色卡名为“金庸群侠传”，不同卡名使用 `--character-name`。

```powershell
pnpm wuxia:ui -- --start-new-game `
  --character-build "测试角色" `
  --opening-event "郭杨邀饮说书人" `
  --opening-action "开始" `
  --output wuxia-new-game-report.json
```

runner 真实执行：在酒馆宿主页唯一定位角色卡；若当前不是空聊天则点击“开始新聊天”；进入武侠开始页和“新的故事”；加载角色预设并接受确认；从确认页连续返回到“出身/开局时间地点”；选择目标事件；回到确认页提交；在首次聊天命名窗选择“保留当前名称”；最后从开局输入页发送 `--opening-action` 并等待进入游戏页。

- 当前已经是该角色的空聊天时复用它，不额外创建聊天；当前为 `setup/opening/game` 时创建新聊天，绝不在已初始化存档上直接改开局变量。
- 默认开局行动是“开始”。完整流程会初始化 `stat_data`、创建真实 user/assistant 楼层并调用模型，不是 dry-run。
- `--start-new-game` 必须提供 `--character-build` 和 `--opening-event`，且不能与 `--chat-id`、推进、检查、重生成、重载、终止或历史回退合用。
- 角色卡、角色预设或事件匹配不唯一，酒馆页面不唯一，新聊天后 `chatId` 未变化，步骤状态不符，初始化或命名窗超时，或首轮未进入 `game` 时立即停止。不得改写 localStorage、React state 或聊天变量来绕过 UI。
- 报告中的 `createdNewChat`、`chatId`、`characterBuild`、`openingEvent`、`openingAction`、`reply`、`failedSections` 和 `success` 是开局验收依据。失败后先检查报告和当前页面；不得无条件再次执行整套流程，因为初始化或首轮发送可能已经发生。

## 真实推进

```powershell
pnpm wuxia:ui -- --turns 1 --action "前往客栈打探消息" --output wuxia-ui-report.json
```

一个 `--action`
可重复使用，也可为每轮分别传入行动。普通任务按用户指定轮数执行；研究任务必须逐轮发送并逐轮检查，不得一次无监督发送全部轮数。runner 已检查本轮正文输入含当前行动；不要缓存跨轮 Frame 或 iframe 内运行实例。

默认使用输出优先的渐进式诊断：

1. 先看 `reply`、四区状态、`failedSections`，以及 `variable-output` 的合法变量块、应用验证和错误摘要。
2. 正文异常时再看 `main-output`；需要定位原因时才看 `main-input`。
3. 变量异常时先看 `variable-output`；需要定位原因时才看 `variable-input`。
4. 输入仍不能解释问题、结果与持久化矛盾，或到达研究基线/事件边界检查点时，才读取目标变量路径。

`main-output`/`reply` 是原始模型通道，可能包含供前端正则剥离的规划、思维或审计标签（例如
`<konatan_planning>`、`<event_audit>`、`<transition_audit>` 和前置的非正文说明）。除非用户明确反馈过滤后的游戏界面仍可见、标签未闭合或正则过滤失败，否则把这些内容视为预期中间输出：不得单独判为正文泄漏、连续性断裂或停止条件。审计正文时以过滤后保留的叙事段及变量实际写入为准。

可用紧凑报告脚本避免默认加载两个完整输入区：

```powershell
node .agents/skills/wuxia-ai-advance-story/scripts/summarize-ui-report.mjs wuxia-ui-report.json
```

- `inline`：正文输入、输出应成功；额外变量输入、输出为 `skipped` 属预期。
- `extra`：正文与变量阶段应完成且无 `error`；已有明确持久化验证时，不例行读取整棵变量树。
- 只在用户明确要求观察错误后的后续表现时使用 `--continue-on-error`；它不是重试机制。

## 受控重新生成

只在用户明确要求重试或控制变量实验时执行：

```powershell
pnpm wuxia:ui -- --regenerate --output wuxia-regenerate-report.json
```

`--regenerate`
真实点击前端“重新生成上一条回复”，每次只生成一个新 swipe；不新建 user 楼层，不改动原用户输入。前端会回滚当前 swipe 的变量、重新生成正文和变量，失败时恢复原 swipe。

- 重生成不是新剧情轮，报告中记为同一轮的新样本，不计入事件完成轮数。
- 一次只重生成一个样本，立即审计 `main-output`、`variable-output` 和持久化结果；不得无监督批量点击。
- 不得用于不确定原回合是否已发送的故障重试，也不代替模型请求内建的 HTTP 429 重试。
- 进行提示词对照时，每次只修改一个提示词变量并推送，保留独立报告；具体对照步骤见审计协议。

## 从首个回复重新开始

多组提示词需要共享完全相同的开局上下文，或多轮测试已经把当前聊天推进到后续楼层时，先通过武侠前端“存档与分叉”回到当前脉络的第一个 assistant 回复：

```powershell
pnpm wuxia:ui -- --restart-from-first-reply --output wuxia-restart-first-reply.json
```

该命令真实执行以下 UI 操作：打开“存档与分叉”，选择当前连通脉络中深度为 0 的首个回复节点，点击“从此处继续”，再点击“确认继续”。它不会删除楼层、覆盖来源聊天、发送 user 行动或调用模型；需要回退时由前端创建原生 branch chat，并等待 checkout journal、ERA full sync、事件派生字段重算与哈希校验完成。只有新 iframe 已就绪、输入解锁且历史树再次确认首节点为当前节点时才报告成功。

React Flow 历史节点可能因缩放、平移或画布裁切而被标题栏遮挡。runner 应先用 `data-wuxia-automation="history-node"` 及节点元数据唯一定位，再触发该元素自身的 DOM `click()` 并等待 `data-wuxia-history-selected="true"`；这仍会沿 React Flow `onNodeClick` 和前端 checkout 处理链执行，属于真实 UI 操作。不得直接调用 React 状态 setter、checkout 函数或变量接口；也不要用坐标强制点击代替选中状态验证。

- 若当前本来就在首个回复，命令返回 `alreadyAtFirstReply: true`，不创建多余分支。
- 页面正在生成、历史谱牒加载失败、确认按钮不可用、checkout 超时或最终首节点校验失败时立即停止；不得继续发送或重生成。
- `--restart-from-first-reply` 是独立操作，不能与 `--regenerate`、`--inspect-only`、`--action`、`--turns` 或 `--stop-generation` 合用。
- 分叉只恢复聊天与变量上下文，不证明最新世界书已经注入。提示词推送后仍须刷新酒馆测试页；第一个计数样本必须在 `main-input` 命中新版本唯一标记，否则该样本作废。

多提示词实验的推荐顺序：保存基线 → 写入并推送一个完整提示词变体 → 刷新测试页 → `--restart-from-first-reply` → `--inspect-only` → 逐个 `--regenerate` 并立即审计。需要测试该提示词的后续多轮表现时，再从这个已验证的首回复分支逐轮发送行动；下一个变体重新执行上述顺序。

## 按需读取变量

使用只读快照：

```powershell
pnpm wuxia:ui -- --inspect-only --stat-data-snapshot --output wuxia-stat-data-diagnostic.json
```

快照来自聊天级
`getVariables({ type: 'chat' }).stat_data`。只读取与当前判断相关的路径，不把整棵变量树载入上下文或倾倒给用户。普通推进仅在变量错误、声明与落地矛盾、调试不足或用户明确要求时读取；研究任务另按审计协议保留基线与事件边界检查点。

## 安全与停止

- 页面正在生成、输入框禁用、目标不唯一、找不到游戏 iframe、缺少基础标记或 CDP 不可达时，不发送行动。
- 未在 15 秒内检测到 `generating: true` 时先执行
  `--inspect-only`。若页面空闲、回复未变化且没有生成迹象，可重发同一行动一次；再次失败即停止报告。页面已生成、回复变化、CDP 断开、iframe 换代或读取失败时不得重发。
- 普通任务把变量错误作为测试发现并按用户要求处理；研究任务一旦满足审计协议中的明显问题条件，立即停止新增回合并报告，除非用户明确要求错误后继续。
- 不调用变量写入、删除楼层、`triggerSlash` 或绕过真实发送/重生成链的 `generate()`。

### 卡住的生成

已确认发送后若页面长期维持 `generating: true` 且正文不再变化，不要再次发送；执行：

```powershell
pnpm wuxia:ui -- --stop-generation --output wuxia-stop-generation.json
pnpm wuxia:ui -- --inspect-only
```

只有确认恢复 `generating: false` 和输入可用后，才可重发刚才行动一次。终止失败或页面仍忙时停止报告。

## 旧桥专项诊断

只有明确排查 Relay/桥协议时才使用 `pnpm --silent wuxia status` 或 `pnpm --silent wuxia snapshot`。Relay 离线不阻塞已通过
`--inspect-only` 的 UI runner。
