
import re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
p = r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\\批次B\\B2-天龙第18-30回.md"
t = open(p, encoding="utf-8").read()
ids = set(re.findall(r"^### (EV-天龙-\d{4})", t, re.M))
refs = {}
for m in re.finditer(r"^- (前因|后果): (.+)$", t, re.M):
    for rid in re.findall(r"EV-天龙-\d{4}", m.group(2)):
        refs.setdefault(rid, set()).add(m.group(1))
missing = sorted(set(refs) - ids)
print("cards:", len(ids), "min/max:", min(ids), max(ids))
print("dangling refs:", missing)
for r in missing:
    lines=[ln for ln in t.split("\n") if r in ln]
    print("  ", r, "->", lines[:2])
