# 武侠卡内思维链提示词变体矩阵

这里包含 3 组、共 9 个完整 `cot` 条目。每个 `.txt` 都包含参与事件检测和完整 EJS 条件包装，可以直接整体替换 `世界书/金庸群侠传1/世界书/cot.txt`。

## 前组：关键触发因素拆解

- `early-e1-no-auto-wording.txt`：删去“自动触发/每次启动”的显式措辞，保留条件注入、固定标签、01～08和流程结构，用于判断自动触发宣告是否必要。
- `early-e2-alternate-tag.txt`：只把固定 `<logic_check>` 改成 `<event_audit>`，其余保持基线，用于判断目标标签本身是否是触发关键。
- `early-e3-no-numeric-sequence.txt`：保留固定标签和全部八项，但用 A～H 替代 01～08，并取消“连续数字编号”措辞，用于判断数字编号是否必要。

## 中组：武侠卡专用事件证据链

- `middle-m1-lean-evidence.txt`：稳定外壳 + 每项“判定/本轮证据”，避免空修正字段。
- `middle-m2-phase-completion-ledger.txt`：强化事件阶段、完成条件、时间边界和结局证据，采用八项台账。
- `middle-m3-candidate-repair-chain.txt`：加入候选正文检查和按项修补，但禁止二次标签与自我纠错旁白。

## 后组：明显不同的替代结构

- `late-l1-state-machine.txt`：S0～S6 状态机。
- `late-l2-production-pipeline.txt`：输入解析→事件编译→候选生成→质量门→提交的流水线。
- `late-l3-dual-audit.txt`：推进审计员与反证审计员独立审查，最后合议裁决。

每个变体测试时仍应在推送后重载页面，并先确认首份计数样本的 `main-input` 含对应 `实验版本` 标记。
