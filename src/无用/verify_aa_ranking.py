"""
验证知乎文章《对Artificial Analysis大模型评测的修正》的重算排名
从 AA 官网 RSC 数据提取模型评分，独立重算 Intelligence Index
"""
import re
import json
import sys
from collections import defaultdict

# 读取RSC数据
with open('aa_models_rsc.txt', 'r', encoding='utf-8') as f:
    raw = f.read()

print(f"读取文件大小: {len(raw):,} 字符")

# 解析 self.__next_f.push 调用
# 格式: self.__next_f.push([1,"DATA"]);
push_pattern = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', re.DOTALL)

all_data = []
for m in push_pattern.finditer(raw):
    escaped = m.group(1)
    all_data.append(escaped)

print(f"找到 {len(all_data)} 个 RSC 数据块")

# 合并所有数据块
combined = '\n'.join(all_data)

# 在 RSC 数据中查找模型评估数据
# 模型数据格式: {"agentic_index":..., "intelligence_index":..., ...}
# 找到包含所有评估字段的 JSON 对象

# 查找包含多个评估字段的模型对象
eval_fields = ['agentic_index', 'intelligence_index', 'gdpval', 'gpqa', 'hle',
               'ifbench', 'lcr', 'critpt', 'omniscience', 'accuracy',
               'hallucination_rate', 'non_hallucination_rate']

# 在 combined 文本中搜索模型数据
# RSC 格式中数据是 JSON 转义的，需要先反转义
def unescape_rsc(s):
    """反转义 RSC 中的 JSON 字符串"""
    # RSC 使用 \" 转义双引号
    result = s.replace('\\"', '"').replace('\\\\', '\\')
    return result

# 在原始文本中搜索包含评估字段的区域
# 搜索同时包含 "intelligence_index" 和 "agentic_index" 的区域
marker = 'intelligence_index'

# 在原始文件中找所有包含 intelligence_index 的位置
positions = [m.start() for m in re.finditer(re.escape(marker), raw)]
print(f"在文件中找到 {len(positions)} 处 '{marker}'")

# 策略：找到包含模型数据的大型 JSON 数组
# 查找模式: "models":[ 后面跟着多个包含评估字段的对象
# 在 RSC 转义的文本中，这看起来像: \\\"models\\\":[

# 尝试找到包含模型短名称和评分的完整数据
# 搜索模式: "short_name":"GPT-5.5
if 'short_name' in raw:
    short_positions = [m.start() for m in re.finditer(r'short_name', raw)]
    print(f"找到 {len(short_positions)} 处 'short_name'")

# 提取包含 intelligence_index 的完整 JSON-like 结构
# 数据位于转义字符串中，需要逐层解析

# 方法：将整个文件的转义还原，然后找JSON数组
def find_model_objects(text):
    """在 RSC 文本中查找模型数据对象"""
    models = []

    # 搜索包含 intelligence_index 的 JSON 对象
    # 在转义的 RSC 中，模式是: {\\\"agentic_index\\\":数字,\\\"coding_index\\\":数字,...

    # 匹配一个完整的模型数据对象
    # 每个模型对象包含 agentic_index, coding_index, intelligence_index 等字段
    pattern = r'\{(?:[^{}]|\{[^{}]*\})*"intelligence_index"[^}]*\}'

    # 在原始转义文本中搜索（需要更宽松的匹配）
    # 因为对象很复杂，包含嵌套的 creator 对象等

    # 改用更具体的方法：找 "short_name" 附近的数据
    short_matches = list(re.finditer(r'"short_name":"([^"]+)"', text))
    print(f"  找到 {len(short_matches)} 个模型名称")

    return short_matches

# 尝试在 combined（未转义）文本中查找
# 实际上数据在 raw 中是转义的，需要处理
print("\n--- 分析数据结构 ---")

# 找到包含模型数据的关键区域
# 之前已知 agentic_index 出现在数据中
agentic_matches = list(re.finditer(r'agentic_index', raw))
if agentic_matches:
    # 提取第一个匹配点周围的内容
    first_pos = agentic_matches[0].start()
    context = raw[first_pos-500:first_pos+500]
    print(f"第一个 agentic_index 上下文:")
    print(context[:300])
    print("...")

# 尝试不同的提取策略：
# 1. 找到所有模型的 short_name 和对应的 intelligence_index
# 在转义文本中: \\\"short_name\\\":\\\"GPT-5.5 (xhigh)\\\"
# pattern for a complete model record with all scores
print("\n--- 提取模型数据 ---")

# 搜索 model_evaluations 或直接包含评分的模型列表
# 在 raw 中搜索包含 agentic_index 和 short_name 的大块
# 每个模型对象的模式（在转义后）包含所有这些字段

# 找到包含 intelligence_index 值的区域
# 用更宽松的模式匹配模型对象
model_pattern = re.compile(
    r'"short_name":"([^"]+)"'
    r'.*?"intelligence_index":([0-9.]+)'
    r'.*?"agentic_index":([0-9.]+)'
    r'.*?"coding_index":([0-9.]+)'
    r'.*?"gdpval":([0-9.]+)'
    r'.*?"gpqa":([0-9.]+)'
    r'.*?"hle":([0-9.]+)'
    r'.*?"ifbench":([0-9.]+)'
    r'.*?"lcr":([0-9.]+)'
    r'.*?"critpt":([0-9.]+)'
    r'.*?"omniscience":([0-9.-]+)'
    r'.*?"accuracy":([0-9.]+)'
    r'.*?"hallucination_rate":([0-9.]+)'
    r'.*?"non_hallucination_rate":([0-9.]+)'
    r'.*?"attempt_rate":([0-9.]+)?',
    re.DOTALL
)

# 问题：字段出现顺序不固定，上面的正则可能不匹配
# 改用逐个提取的方式

# 找一个模型数据对象的完整示例
# 在 raw 中搜索 "short_name" 后的完整 JSON 块
sample_match = re.search(r'"short_name":"[^"]+".{0,2000}"intelligence_index"', raw, re.DOTALL)
if sample_match:
    print("找到一个模型数据样本:")
    print(sample_match.group()[:500])
    print("...")

print("\n--- 改用结构化搜索 ---")
# 在 raw 中找所有 "intelligence_index":数字 的匹配
ii_matches = list(re.finditer(r'"intelligence_index":([0-9.]+)', raw))
print(f"找到 {len(ii_matches)} 个 intelligence_index 值")

# 提取前几个值
for m in ii_matches[:10]:
    val = m.group(1)
    # 在值附近找 short_name
    nearby = raw[max(0, m.start()-3000):m.start()]
    sn_match = re.search(r'"short_name":"([^"]+)"', nearby)
    if sn_match:
        print(f"  {sn_match.group(1)}: II={val}")
