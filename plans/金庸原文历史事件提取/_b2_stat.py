
import re, io, sys, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
t = open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\\批次B\\B2-天龙第18-30回.md", encoding="utf-8").read()
cards = re.findall(r"### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---\n|\Z)", t, re.S)
print("cards:", len(cards))
d = collections.Counter()
for eid, body in cards:
    m = re.search(r"^- 与现有条目差分: (.+)$", body, re.M)
    v = m.group(1) if m else "??"
    for k in ["完全缺失","只有回忆或揭密场景","只有最终结果","部分已有","已完整记录","证据不足"]:
        if v.startswith(k):
            d[k]+=1; break
    else:
        d["其它:"+v[:12]]+=1
print("DIFF:", dict(d))
c = collections.Counter()
for eid, body in cards:
    m = re.search(r"^- 发生时间: (.+)$", body, re.M)
    v = m.group(1) if m else ""
    for k in ["高置信","中置信","低置信"]:
        if k in v: c[k]+=1; break
    else: c["未标"]+=1
print("CONF:", dict(c))
