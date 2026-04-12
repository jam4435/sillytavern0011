EJS提示词模板知识库（SillyTavern + ST-Prompt-Template扩展）

运行环境：世界书条目、预设提示词、角色卡定义、消息中均可执行EJS代码。
核心用途：根据变量值动态控制哪些提示词发送给AI，实现多阶段人设、条件分支、状态栏渲染等。

═══════════════════════════════════════
一、标签语法
═══════════════════════════════════════

<%_ 代码 _%>    执行代码，不输出，自动去空白（推荐）
<%= 表达式 %>    输出值（HTML转义）
<%- 表达式 %>    输出值（原样，不转义）
<%# 注释 %>      注释，不执行

标签外的文本是普通提示词，会直接发送给AI。

═══════════════════════════════════════
二、条件控制（if/else）
═══════════════════════════════════════

<%_ if (getvar('stat_data.角色.好感度') < 30) { _%>
好感度低时AI看到的提示词
<%_ } else if (getvar('stat_data.角色.好感度') < 60) { _%>
中等好感度提示词
<%_ } else { _%>
高好感度提示词
<%_ } _%>

文本相等用 ===：
<%_ if (getvar('stat_data.天气') === '晴天') { _%>

多条件用 && 和 ||：
<%_ if (getvar('stat_data.好感度') > 50 && getvar('stat_data.信任') > 30) { _%>

═══════════════════════════════════════
三、变量读写
═══════════════════════════════════════

【读取变量】
getvar('路径')                              → 值
getvar('路径', { defaults: 0 })             → 不存在时返回0
getvar('stat_data.角色.好感度')             → MVU变量（stat_data前缀必写）
getvar('stat_data.角色.好感度') !== undefined → 判断是否存在

【设置变量】
setvar('key', value, { scope: 'local' })     → 写入聊天变量
setvar('key', value, { scope: 'message' })   → 写入消息变量（默认）
setvar('key', value, { flags: 'nx' })        → 仅不存在时写入
setvar('key', value, 'global')               → scope快捷写法
setvar('key', value, 'nx')                   → flags快捷写法

【增减变量】
incvar('好感度', 5, { scope: 'local', min: 0, max: 100 })  → +5，限制范围
decvar('金币', 100, { scope: 'local', min: 0 })             → -100，不低于0

【删除/插入】
delvar('key')                    → 删除变量
delvar('key', '属性名')          → 删除对象属性
insvar('数组', '新元素')         → 追加到数组末尾

【作用域】
global   全局变量，持久化，跨角色跨对话共享
local    聊天变量，持久化，当前聊天记录
message  消息变量，持久化，绑定到具体消息楼层（默认）
cache    临时变量，不持久化（默认读取源）
initial  初始变量，只读

优先级（高→低）：消息变量(最新→最旧) → 聊天变量 → 全局变量
合并后的变量在 variables 对象中可直接访问。

═══════════════════════════════════════
四、输出与世界书条目加载
═══════════════════════════════════════

【print输出】
<%_
if (getvar('stat_data.天气') === '晴天') {
  print('【阳光明媚，适合出门】');
}
_%>

【getwi加载其他条目】必须加await
<%_
if (getvar('stat_data.好感度') < 30) {
  print(await getwi('角色_阶段01'));
} else {
  print(await getwi('角色_阶段02'));
}
_%>

等价写法：<%- await getwi('条目名') %>

getwi参数：
await getwi('条目名')                → 自动推断世界书
await getwi('世界书名', '条目名')     → 指定世界书
await getwi('条目名', { key: value }) → 传递数据

【activewi激活条目】让酒馆原生处理（遵循绿灯/向量化等）
await activewi('条目名')         → 普通激活
await activewi('条目名', true)   → 强制激活
※ 必须在 [GENERATE:BEFORE] 或 @@generate_before 条目中使用

【填入变量值】
<%= getvar('stat_data.好感度') %>
<%= YAML.stringify(getvar('stat_data'), { blockQuote: 'literal' }) %>
<%= JSON.stringify(getvar('stat_data')) %>

═══════════════════════════════════════
五、装饰器（条目内容开头，每行一个，不能有空行）
═══════════════════════════════════════

@@activate              视为蓝灯永久激活
@@dont_activate         完全禁止激活
@@generate_before       注入到提示词开头
@@generate_after        注入到提示词末尾
@@render_before         渲染到消息开头（不发给AI）
@@render_after          渲染到消息末尾（不发给AI）
@@preprocessing         在世界书处理前执行（用于动态激活绿灯）
@@initial_variables     将内容视为初始变量
@@private               自动包裹作用域，避免变量重复声明
@@if 条件               条件为false时排除此条目
@@iframe                创建iframe包裹，避免样式污染
@@iframe 标题文字       自动折叠的iframe

@@if 示例：
@@if variables.好感度 >= 90
好感度很高时才发送的内容

═══════════════════════════════════════
六、内容注入（条目标题/备忘前缀）
═══════════════════════════════════════

[GENERATE:BEFORE]     提示词开头（仅蓝灯）
[GENERATE:AFTER]      提示词末尾（蓝灯和绿灯）
[RENDER:BEFORE]       消息开头渲染（不发给AI）
[RENDER:AFTER]        消息末尾渲染（不发给AI）
[InitialVariables]    初始变量（标准JSON）

═══════════════════════════════════════
七、@INJECT注入（条目必须设为禁用）
═══════════════════════════════════════

以独立 {role, content} 消息插入Prompt（比世界书合并更精确）。

@INJECT pos=1,role=system              绝对位置
@INJECT pos=-1,role=user               最后位置
@INJECT target=user,index=1,at=before,role=system    目标消息前
@INJECT target=assistant,index=-1,at=after,role=user  最后助手消息后
@INJECT regex=你好,at=before,role=system              正则匹配

═══════════════════════════════════════
八、injectPrompt（依赖倒置注入）
═══════════════════════════════════════

世界书中定义：
<% injectPrompt("CoT", `思考步骤内容`) %>

预设中使用：
<%- getPromptsInjected("CoT") %>

用途：世界书定义提示词片段，在预设指定位置精确注入。

═══════════════════════════════════════
九、多阶段人设系统
═══════════════════════════════════════

结构：
  控制器条目（蓝灯永久激活）→ 读变量 → getwi加载对应阶段条目
  阶段条目（禁用）→ 被控制器按需加载

控制器写法：
<%_
if (typeof goodwill === 'undefined') var goodwill = getvar('stat_data.好感度', { defaults: 0 });
_%>
<%_ if (goodwill < 30) { _%>
<%- await getwi('角色_阶段01') %>
<%_ } else if (goodwill < 60) { _%>
<%- await getwi('角色_阶段02') %>
<%_ } else { _%>
<%- await getwi('角色_阶段03') %>
<%_ } _%>

条目配置：
  控制器   → 蓝灯永久激活，顺序100
  阶段条目 → 禁用，顺序98~800

防重复声明（多条目共享变量名时必用）：
if (typeof value === 'undefined') var value = getvar('路径', { defaults: 0 });

或使用 @@private 装饰器自动包裹作用域。

═══════════════════════════════════════
十、聊天消息操作
═══════════════════════════════════════

getChatMessage(idx)                  → 指定楼层消息内容
getChatMessages(count)               → 最后N条消息
getChatMessages(start, end)          → 范围内消息
matchChatMessages(['关键词'])         → 最后2楼是否包含关键词
matchChatMessages(['关键词'], { start: -4 })  → 扩大扫描范围
matchChatMessages([/正则/s])         → 正则匹配

═══════════════════════════════════════
十一、正则激活
═══════════════════════════════════════

activateRegex(/<think>[\s\S]*?<\/think>/gi, "");   → 隐藏思维链
activateRegex(/pattern/gi, '替换', { message: true, html: true });  → 楼层HTML替换

═══════════════════════════════════════
十二、常用内置常量
═══════════════════════════════════════

variables         合并后的所有变量对象
_                 Lodash库
$                 jQuery库
toastr            通知库（toastr.info/success/warning/error）
userName          用户名
charName          角色名
lastMessageId     最后消息ID
lastUserMessage   最后用户消息内容
lastCharMessage   最后角色消息内容
generateType      生成类型：normal/continue/regenerate/swipe
runType           当前阶段：generate/preparation/render

仅渲染时（runType='render'）：
message_id        消息楼层号
is_last           是否最后一条
is_user           是否用户消息
is_system         是否系统消息

═══════════════════════════════════════
十三、调试方法
═══════════════════════════════════════

提示词查看器：输入框左下角魔棒 → 提示词查看器（查看实际发送内容）
弹窗：alert('消息')
通知：toastr.info('消息')
控制台：console.log('消息')（F12 → Console）
断点：<%_ debugger; _%>（F12打开后暂停执行）

═══════════════════════════════════════
十四、易错点
═══════════════════════════════════════

1. getwi必须加await：
   ✅ <%- await getwi('条目名') %>
   ❌ <%- getwi('条目名') %>

2. MVU变量路径必须带stat_data前缀：
   ✅ getvar('stat_data.角色.好感度')
   ❌ getvar('角色.好感度')

3. 不需要[0]索引：
   ✅ getvar('stat_data.角色.好感度')
   ❌ getvar('stat_data.角色.好感度[0]')

4. 多条目共享变量名用typeof防重复声明：
   ✅ if (typeof v === 'undefined') var v = getvar('路径');
   ❌ const v = getvar('路径');  // 第二个条目会报错

5. activewi必须在[GENERATE:BEFORE]或@@generate_before中使用

6. @INJECT条目必须设为禁用状态

7. 装饰器之间不能有空行

8. define函数内必须用this访问getvar/setvar等：
   ✅ define('fn', function() { return this.getvar('key'); })
   ❌ define('fn', () => getvar('key'))

9. @@preprocessing不能和@@generate_before/@@generate_after同时使用

10. setvar后立即读取需要 { noCache: true }

═══════════════════════════════════════
十五、@@iframe状态栏示例
═══════════════════════════════════════

@@render_after
@@iframe
@@if !is_user && !is_system
<html>
<head></head>
<body>
<div>
好感度：<%- variables.stat_data.角色.好感度 %>
</div>
</body>
</html>

折叠版：
@@render_after
@@iframe 状态栏（点击展开）
@@if !is_user && !is_system
<html>...内容...</html>

═══════════════════════════════════════
十六、@@preprocessing动态激活示例
═══════════════════════════════════════

@@preprocessing
<%_ if (getvar('stat_data.天气') === '晴天') { _%>
晴天关键词
<%_ } _%>

条目内容处理后变为"晴天关键词"，激活以此为绿灯关键词的其他条目。
要求：SillyTavern 1.13.4+

═══════════════════════════════════════
十七、完整函数速查
═══════════════════════════════════════

变量：getvar setvar incvar decvar delvar insvar define patchVariables
世界书：await getwi  await activewi  await getEnabledWorldInfoEntries
角色/预设：await getchar  await getpreset  await getqr  await getCharData
消息：getChatMessage  getChatMessages  matchChatMessages
输出：print  injectPrompt  getPromptsInjected  hasPromptsInjected
正则：activateRegex
工具：parseJSON  jsonPatch  await evalTemplate  await execute
