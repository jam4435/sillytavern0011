
import re
nov = open("原文UTF8/天龙八部.txt",encoding="utf-8").read()
t = open("批次A/A1-逍遥派三师兄妹.md",encoding="utf-8").read()
entries = re.findall(r"### (EV-[^\s·]+)[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
bad=[]; ok=0
for eid, body in entries:
    m = re.search(r"^- 原文摘录: (.+)$", body, re.M)
    if not m: bad.append((eid,"NO")); continue
    line = m.group(1)
    # 提取所有中文字符串（中文引号内）
    quotes = re.findall(r"“([^”]{8,})”", line)
    if not quotes: bad.append((eid,"NOQUOTE")); continue
    allok=True
    for q in quotes:
        for seg in [p for p in q.split("……") if len(p)>=8]:
            if seg not in nov: allok=False
    if allok: ok+=1
    else: bad.append((eid,"MISS"))
print("A1 解析式判定：通过", ok, "不通过", len(bad), [b[0] for b in bad])
