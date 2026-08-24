# wuxia-ai-advance-story 完整新开局补丁

目标文件：`.agents/skills/wuxia-ai-advance-story/SKILL.md`

本文件只因当前会话对 `.agents` 目录没有写权限而暂存。取得写权限后，将以下内容合入目标 Skill，并删除本补丁文件。

## Frontmatter 描述

将现有 `description` 更新为：

```yaml
description:
  通过 Playwright/CDP UI runner 从酒馆新聊天完成武侠角色预设与开局事件选择，或推进、检查、受控重新生成真实回合，并用渐进式诊断研究事件完成轮数、正文连续性、跨事件接续、变量执行与参与事件结算。用于更换开局时间/事件、完整开局回归、单轮或多轮剧情推进、提示词对照重生成和变量故障定位；默认调用 pnpm wuxia:ui。完整开局会创建并初始化聊天，真实推进会新增聊天楼层，受控重生成会新增 swipe。
```

## 工作流路由

在“选择工作流”中加入：

```markdown
- 更换开局时间/事件，或从酒馆页完整测试“进入聊天 → 角色预设 → 开局事件 → 首轮剧情”：使用“完整新开局”工作流。现有 `opening/game` 存档不能返回角色创建页更换事件，必须从新的空聊天开始。
```

## 完整新开局与更换开局事件

在“开始前”之后、“真实推进”之前加入：

```markdown
## 完整新开局与更换开局事件

角色预设保存在测试专用 Chrome profile 的 `localStorage`。先确认要加载的预设完整名称或 ID，以及目标事件完整名称或 ID；名称必须唯一。默认角色卡名为“金庸群侠传”，不同卡名用 `--character-name`。

\```powershell
pnpm wuxia:ui -- --start-new-game `
  --character-build "测试角色" `
  --opening-event "郭杨邀饮说书人" `
  --opening-action "开始" `
  --output wuxia-new-game-report.json
\```

runner 真实执行：在酒馆宿主页唯一定位角色卡；若当前不是空聊天则点击“开始新聊天”；进入武侠开始页和“新的故事”；加载角色预设并接受确认；从确认页连续返回到“出身/开局时间地点”；选择目标事件；回到确认页提交；在首次聊天命名窗选择“保留当前名称”；最后从开局输入页发送 `--opening-action` 并等待进入游戏页。

- 当前已经是该角色的空聊天时复用它，不额外创建聊天；当前为 `setup/opening/game` 时创建新聊天，绝不在已初始化存档上直接改开局变量。
- 默认开局行动是“开始”。完整流程会初始化 `stat_data`、创建真实 user/assistant 楼层并调用模型，不是 dry-run。
- `--start-new-game` 必须提供 `--character-build` 和 `--opening-event`，且不能与 `--chat-id`、推进、检查、重生成、重载、终止或历史回退合用。
- 角色卡、角色预设或事件匹配不唯一，酒馆页面不唯一，新聊天后 `chatId` 未变化，步骤状态不符，初始化/命名窗超时，或首轮未进入 `game` 时立即停止。不得改写 localStorage、React state 或聊天变量来绕过 UI。
- 报告中的 `createdNewChat`、`chatId`、`characterBuild`、`openingEvent`、`openingAction`、`reply`、`failedSections` 和 `success` 是开局验收依据。失败后先检查报告和当前页面；不得无条件再次执行整套流程，因为初始化或首轮发送可能已经发生。
```
