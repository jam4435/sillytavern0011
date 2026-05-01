"""
从AA官网RSC数据中提取模型评分，独立重算Intelligence Index
验证知乎文章的去幻觉率修正排名
"""
import re
import json
import sys

with open('aa_models_rsc.txt', 'r', encoding='utf-8') as f:
    raw = f.read()

print(f"文件大小: {len(raw):,} 字符")

# RSC数据中 JSON 使用 \\" 转义，先做预处理
# 将 RSC 转义还原为普通 JSON
def unescape_rsc(text):
    """还原RSC转义: \\\" -> \" , \\\\ -> \\ """
    # 先替换 \\\\ 为占位符
    text = text.replace('\\\\', '\x00')
    # 再替换 \\" 为 "
    text = text.replace('\\"', '"')
    # 还原占位符
    text = text.replace('\x00', '\\')
    return text

# 在原始文件中找包含 intelligence_index 数值的模型数据对象
# 数据模式: {\"agentic_index\":40.27,\"coding_index\":37.46,...,\"intelligence_index\":60.24,...}

# 方法：找所有包含 intelligence_index 数值和 short_name 的 JSON 对象
# 每个模型对象包含: agentic_index, coding_index, intelligence_index, short_name 等

# 构建匹配一个完整模型数据对象的正则
# 关键字段（按顺序不固定，用前瞻匹配）
model_obj_pattern = re.compile(
    r'\{(?=[^}]*"agentic_index":(?P<ai>[\d.]+))'
    r'(?=[^}]*"coding_index":(?P<ci>[\d.]+))'
    r'(?=[^}]*"intelligence_index":(?P<ii>[\d.]+))'
    r'(?=[^}]*"short_name":"(?P<sn>[^"]+)")'
    r'(?=[^}]*"gdpval":(?P<gdp>[\d.]+))'
    r'(?=[^}]*"gpqa":(?P<gpqa>[\d.]+))'
    r'(?=[^}]*"hle":(?P<hle>[\d.]+))'
    r'(?=[^}]*"ifbench":(?P<ifb>[\d.]+))'
    r'(?=[^}]*"lcr":(?P<lcr>[\d.]+))'
    r'(?=[^}]*"critpt":(?P<crit>[\d.]+))'
    r'(?=[^}]*"omniscience":(?P<omni>[\d.-]+))'
    r'(?=[^}]*"accuracy":(?P<acc>[\d.]+))'
    r'(?=[^}]*"hallucination_rate":(?P<hr>[\d.]+))'
    r'(?=[^}]*"non_hallucination_rate":(?P<nhr>[\d.]+))'
    r'(?=[^}]*"attempt_rate":(?P<ar>[\d.]+))'
    ,
    re.DOTALL
)

# 先用简单方法：找到所有 intelligence_index:数字 的位置
# 然后反向查找最近的 short_name，提取完整数据
ii_pattern = re.compile(r'"intelligence_index":([\d.]+)')
sn_pattern = re.compile(r'"short_name":"([^"]+)"')
ai_pattern = re.compile(r'"agentic_index":([\d.]+)')
ci_pattern = re.compile(r'"coding_index":([\d.]+)')
gdp_pattern = re.compile(r'"gdpval":([\d.]+)')
gpqa_pattern = re.compile(r'"gpqa":([\d.]+)')
hle_pattern = re.compile(r'"hle":([\d.]+)')
ifb_pattern = re.compile(r'"ifbench":([\d.]+)')
lcr_pattern = re.compile(r'"lcr":([\d.]+)')
crit_pattern = re.compile(r'"critpt":([\d.]+)')
omni_pattern = re.compile(r'"omniscience":([\d.-]+)')
acc_pattern = re.compile(r'"accuracy":([\d.]+)')
hr_pattern = re.compile(r'"hallucination_rate":([\d.]+)')
nhr_pattern = re.compile(r'"non_hallucination_rate":([\d.]+)')
ar_pattern = re.compile(r'"attempt_rate":([\d.]+)')

# 找所有包含 agentic_index 和 intelligence_index 的区域
# 数据在 RSC payload 中，先转义
print("还原RSC转义...")
unescaped = unescape_rsc(raw)
print(f"转义后大小: {len(unescaped):,} 字符")

# 在转义后的文本中搜索模型数据
# 每个模型对象应该是 {...} 包含所有评估字段

# 找所有 intelligence_index 出现的位置,然后提取周围的模型对象
print("搜索模型数据...")
ii_iter = list(ii_pattern.finditer(unescaped))
print(f"找到 {len(ii_iter)} 个 intelligence_index 值")

# 检查几个示例
for m in ii_iter[:5]:
    start = max(0, m.start() - 100)
    end = min(len(unescaped), m.end() + 100)
    ctx = unescaped[start:end]
    # 找其中的 short_name
    sn = sn_pattern.search(ctx)
    if sn:
        print(f"  II={m.group(1)}, model={sn.group(1)}")
    else:
        print(f"  II={m.group(1)}, no short_name nearby")

# 如果前面几个没有 short_name，说明 intelligence_index 出现在不同上下文中
# 需要区分模型列表中的 intelligence_index (有关联 short_name) 和其他地方的
print()

# 策略：找同时包含 intelligence_index 和 agentic_index 的对象
# 这样的对象才是模型评估数据
print("寻找完整的模型评估数据对象...")

# 在 unescaped 中找包含所有关键字段的对象
# 使用更宽松的方法：找包含 intelligence_index 且有 short_name 的大对象

# 搜索包含 short_name 后紧跟 agentic_index 等字段的区域
# 这些模型对象在 HTML 中以 JSON 形式嵌入
model_data = []

# 找所有 "short_name":"XXX" 后面跟着大量评估字段的完整对象
# 模型对象模式: 以 { 开始，包含所有字段，以 } 结束
# 但对象中有嵌套的 creator 对象，需要正确处理括号匹配

def extract_json_objects(text, start_positions):
    """从给定位置提取完整的JSON对象"""
    objects = []
    for pos in start_positions:
        # 向前找到 {
        brace_start = text.rfind('{', max(0, pos - 5000), pos)
        if brace_start < 0:
            continue

        # 从 { 开始匹配括号
        depth = 0
        end = brace_start
        for i in range(brace_start, min(brace_start + 50000, len(text))):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break

        if depth == 0:
            obj_str = text[brace_start:end]
            # 验证是否包含 intelligence_index
            if 'intelligence_index' in obj_str and 'short_name' in obj_str:
                objects.append(obj_str)

    return objects

# 找到所有包含 intelligence_index 且附近有 short_name 的位置
# 先找 "agentic_index":数字 模式（这是模型数据独有的字段）
ai_iter = list(ai_pattern.finditer(unescaped))
print(f"找到 {len(ai_iter)} 个 agentic_index 值")

# 找所有 agentic_index 且附近有 short_name 的
valid_positions = []
for m in ai_iter:
    nearby = unescaped[max(0, m.start()-3000):m.end()+3000]
    if 'short_name' in nearby:
        valid_positions.append(m.start())

print(f"其中 {len(valid_positions)} 个附近有 short_name (模型数据)")

# 提取这些模型对象
print("提取模型JSON对象...")
model_objs = extract_json_objects(unescaped, valid_positions)
print(f"成功提取 {len(model_objs)} 个模型对象")

if len(model_objs) == 0:
    print("未提取到对象，检查数据格式...")
    # 打印一个 agentic_index 附近的上下文
    if valid_positions:
        pos = valid_positions[0]
        ctx = unescaped[max(0,pos-200):pos+500]
        print(f"示例上下文:\n{ctx[:600]}")

print()
print("=" * 60)
