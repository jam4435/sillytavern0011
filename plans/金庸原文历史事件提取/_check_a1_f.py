
import re
nov = open("原文UTF8/天龙八部.txt",encoding="utf-8").read()
t = open("批次A/A1-逍遥派三师兄妹.md",encoding="utf-8").read()
LQ="\u201c"; RQ="\u201d"; SL="\u2018"; SR="\u2019"
for eid in ["EV-天龙-0007","EV-天龙-0034","EV-天龙-0046","EV-天龙-0052","EV-天龙-0056"]:
    body = re.search(r"### "+eid+r"[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S).group(1)
    line = re.search(r"^- 原文摘录: (.+)$", body, re.M).group(1)
    print("==", eid, "|", line[:180])
