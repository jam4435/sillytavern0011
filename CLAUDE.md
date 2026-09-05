# 酒馆助手前端界面或脚本编写

@.cursor/rules/项目基本概念.mdc
@.cursor/rules/酒馆助手接口.mdc
@.cursor/rules/前端界面.mdc
@.cursor/rules/脚本.mdc

- 单插件修改调试必须使用单模块极速构建：`pnpm fast:only <模块名>`（如 `ck`、`三国`、`武侠`、`JM`、`nba2k`），禁止跑全量构建；监听使用 `pnpm watch:only <模块名>`。
- 善用5.6-Luna/Terra的并行子任务读取文件/执行计划，以此增加效率并减少上下文。
