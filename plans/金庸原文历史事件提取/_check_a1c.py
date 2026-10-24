
import re
nov = open("原文UTF8/天龙八部.txt",encoding="utf-8").read()
t = open("批次A/A1-逍遥派三师兄妹.md",encoding="utf-8").read()
for eid in ["EV-天龙-0009","EV-天龙-0028","EV-天龙-0033","EV-天龙-0048"]:
    m = re.search(r"### "+eid+r"[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
    line = re.search(r"^- 原文摘录: (.+)$", m.group(1), re.M).group(1)
    print("==", eid)
    for q in re.findall(r"“([^”]{8,})”", line):
        for seg in [p for p in q.split("……") if len(p)>=8]:
            print("   ", "OK  " if seg in nov else "MISS", seg[:75])
