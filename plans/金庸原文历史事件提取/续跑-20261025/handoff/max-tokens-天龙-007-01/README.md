# 天龙第7回截断恢复

2026-10-25 22:07（北京时间）恢复单个六书并行控制器，PID35396。实时状态读工作目录 `supervisor-state.json`、`queue.json` 和 `deliverables/progress.json`。

原控制器16796在收齐整批后停止于 `天龙-007-01`，其余五路正常完成。失败调用以max-tokens结束，32767输出tokens全部用于推理；共47469 tokens已完整计入累计预算。原输入、输出与回执未修改，失败批次核对见 `failed-wave-check.json`。

原窗口2615–2858在原文空段2674、2736、2802行后按字符量分成四项：a为2615–2674，b为2675–2736，c为2737–2802，d为2803–2858。各自主文本约3200字；7张旧卡沿用 `orchestrate.anchor_for()` 分配到唯一子项，数量为1、1、5、0，提示词继续补充各卡全部证据。没有根据卡题猜分，也没有丢弃旧卡。

`split.json` 保存父任务、子任务、卡片定位行、提示词字符数、全部历史回执哈希及父调用文件哈希，`queue-before.json` 是拆分前队列。覆盖逐行计数与卡片UID计数均严格守恒，其他任务未变。活动窗口数从608增至611，不代表增加原文覆盖。

首项 `天龙-007-01a` 已以原模型buddy / deepseek-v4.1-flash、low、32768上限、单步零工具和独立Session试跑通过，5条事件、零校验问题，新增18575 tokens。`python -X utf8 -B verify_trial_tianlong007.py` 重验原始输出、原校验器、路由与回执、历史哈希、旧卡分配、其他任务状态及累计用量，全部通过，结果见 `trial-acceptance.json`。其余b/c/d在恢复时仍为pending，由六书控制器在天龙一路按序执行，不能视为已经验收。

恢复前152/611窗口reviewed、459 pending，1648条事件记录，285张旧卡已有模型回执；累计4530354/15000000 tokens，包含所有历史失败和修复用量。已处理的停止标记另存 `STOP-before-resume.json`。启动信息见 `resume-launch.json`，日志为 `resume.stdout.log`、`resume.stderr.log`。

没有修改最终世界书、预加入事件或人物快照。reviewed表示模型返回及程序校验通过，正文差分、跨书去重和独立语义审阅仍待完成。
