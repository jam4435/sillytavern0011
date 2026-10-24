
import re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
t = open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\\批次B\\B2-天龙第18-30回.md", encoding="utf-8").read()
cards = re.findall(r"### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---\n|\Z)", t, re.S)
for eid, body in cards:
    if not re.search(r"^- 与现有条目差分: ", body, re.M):
        print("NO_DIFF:", eid); print(body[:600]); print("...")
    m = re.search(r"^- 发生时间: (.+)$", body, re.M)
    if m and not any(k in m.group(1) for k in ["高置信","中置信","低置信"]):
        print("NO_CONF:", eid, "|", m.group(1)[:200])
