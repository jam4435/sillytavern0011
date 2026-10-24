
import re
nov = open("原文UTF8/天龙八部.txt",encoding="utf-8").read()
t = open("批次A/A1-逍遥派三师兄妹.md",encoding="utf-8").read()
entries = re.findall(r"### (EV-[^\s·]+)[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
bad=[]
LQ="\u201c"; RQ="\u201d"; ELL="\u2026\u2026"
for eid, body in entries:
    m = re.search(r"^- 原文摘录: (.+)$", body, re.M)
    line = m.group(1)
    a = line.find(LQ); b = line.rfind(RQ)
    core = line[a+1:b] if a>=0 and b>a else line
    core = core.replace(LQ,"").replace(RQ,"")
    segs = [p for p in core.split(ELL) if len(p)>=8] or [core]
    if not all(p in nov for p in segs):
        bad.append(eid)
print("A1 final: total", len(entries), "fail", len(bad), bad)
