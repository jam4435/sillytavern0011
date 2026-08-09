# NBA2K16 生涯模拟角色卡

仿 `角色卡/金庸群侠传` 的复合结构。玩法与系统设计见 [设计文档.md](./设计文档.md)，前端架构见 [`src/nba2k/架构.md`](../../src/nba2k/架构.md)。

## 目录

| 路径 | 内容 |
| ---- | ---- |
| `index.yaml` | 卡声明：首条消息、世界书挂载、正则矩阵、脚本库矩阵 |
| `世界书/` | 输出提示词、变量指导（ERA 格式）、cot、比赛规则、叙事风格、球队与球星档案、场外系统（代言/经纪人/恋爱）、赛季事件 |
| `正则/游戏页面.txt` | loader：把楼层显示替换为 `dist/nba2k/index.html` 的 iframe |
| `脚本/` | 隐藏楼层.js、ERA变量框架-魔改.js（复用自金庸卡） |
| `头像.png` | 占位头像（可自行替换） |

## 使用步骤

1. 构建前端：`pnpm build:src:fast`（产出 `dist/nba2k/index.html`，单文件自包含）。
2. 启动静态服务：以仓库根目录为静态根目录监听 `localhost:5500`，并确认浏览器可访问 `http://localhost:5500/dist/nba2k/index.html`。loader 固定使用该地址。
3. 打包角色卡：`node tavern_sync.mjs bundle nba2k` → 生成 `角色卡/nba2k.png`，导入酒馆。
   - 或 `node tavern_sync.mjs push nba2k` 直接推送到酒馆（已在 `tavern_sync.yaml` 登记，酒馆中名称：NBA2K16生涯）。
4. 酒馆中开启酒馆助手，新建聊天发送「【开始游戏】」，前端接管后按界面操作。

## 注意

- loader 正则的 `run_on_edit` 应保持关闭（避免编辑楼层时 loader 壳写入正文）。
- 深度世界书每回合通过 `{{ERA:$ALLDATA}}` 注入完整无 `$meta` 的 `stat_data` 快照，AI 只提交 ERA 增量指令。
- 一次生成采用回合事务：先取得隐藏楼层锁，再以 `refresh:none` 持久化 user/assistant 楼层，等待 ERA 写入完成后释放锁并同步最终楼层；assistant 落楼前失败会回滚孤立 user 楼层，ERA 超时则保留完整回合供手动同步。
- 前端仅在建档和开赛初始化时直写聊天变量；比赛/场外推进由 AI 的 ERA 指令落库。
- 球员数据（373 人）打包在前端里，世界书不含球员数值，避免上下文膨胀。
