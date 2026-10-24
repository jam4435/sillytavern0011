
import re
nov = open("原文UTF8/天龙八部.txt",encoding="utf-8").read()
t = open("批次A/A1-逍遥派三师兄妹.md",encoding="utf-8").read()
for eid in ["EV-天龙-0007","EV-天龙-0011","EV-天龙-0021"]:
    m = re.search(r"### "+eid+r"[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
    ex = re.search(r"^- 原文摘录: “(.+?)”$", m.group(1), re.M).group(1)
    parts=[p for p in ex.split("……") if len(p)>=8]
    print("==", eid, "段数", len(parts))
    for p in parts:
        print("   ", "OK " if p in nov else "MISS", p[:70])
