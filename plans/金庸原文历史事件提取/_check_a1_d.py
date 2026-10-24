
import re
nov = open("原文UTF8/天龙八部.txt",encoding="utf-8").read()
t = open("批次A/A1-逍遥派三师兄妹.md",encoding="utf-8").read()
LQ="\u201c"; RQ="\u201d"
for eid in ["EV-天龙-0009","EV-天龙-0033","EV-天龙-0048","EV-天龙-0001"]:
    m = re.search(r"### "+eid+r"[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
    line = re.search(r"^- 原文摘录: (.+)$", m.group(1), re.M).group(1)
    a = line.find(LQ); b = line.rfind(RQ)
    core = line[a+1:b]
    print("==", eid, "len", len(core))
    print("   full-in-novel:", core in nov)
    # 逐句找第一条不在原文的
    for seg in [p for p in core.split("\u2026\u2026") if len(p)>=8]:
        if seg not in nov:
            print("   MISS:", seg[:100])
