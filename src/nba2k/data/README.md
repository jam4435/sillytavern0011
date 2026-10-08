# 数据来源说明

## teams.json → teams.ts
NBA 2K16 (2015-16 赛季) 30 支球队。overall 为球队总评：数值依据 NBA 2K16 首发名单的球队实力排名（SAS/CLE/GSW 居前，PHI 垫底）结合 2K16 时代评分尺度推定，非逐队核实的游戏内原始数值。colors 为该时期球队官方主/副色。

## players.json → players.ts
NBA 2K16（2015-16赛季揭幕阵容，即2K16首发名单）。overall：各队核心/明星球员采用NBA 2K16真实首发评分（如库里93、勒布朗94、杜兰特92、威少90、哈登91等，凭资料回忆，个别可能±1）；其余角色球员与部分新秀按2015-16赛季实际地位推定。文件中的19项attrs是兼容种子，不是完整2K16导出；运行时由 `engine/playerAdapter.ts` 确定性展开为v3的43项能力并按位置补体重、臂展。外部排名CSV留作后续校准，不作为运行时依赖。阵容、号码与身高按2015年10月赛季初数据整理。


## rotationProfiles.ts
球队级轮换档案用于提供2015-16风格的赛前分钟与用人锚点，不是逐场历史录像。当前覆盖 GSW/CLE/SAS/OKC/HOU/LAC/MEM/CHI/MIA/POR/LAL/NYK：包含主要轮换分钟、轮换深度、替补信任、核心负荷、small-ball倾向、季后赛缩短轮换与 closingPriority。历史分钟只作为权重，运行时会重新归一到每队240分钟，并被伤病、主角角色、犯规、垃圾时间和季后赛上下文覆盖。未配置球队使用 RotationEngine 的总评/耐力通用 fallback。
