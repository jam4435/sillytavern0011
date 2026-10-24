
import re
nov = open("原文UTF8/天龙八部.txt",encoding="utf-8").read()
t = open("批次A/A1-逍遥派三师兄妹.md",encoding="utf-8").read()
entries = re.findall(r"### (EV-[^\s·]+)[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
LQ="\u201c"; RQ="\u201d"; SL="\u2018"; SR="\u2019"
bad=[]; ok=0
for eid, body in entries:
    line = re.search(r"^- 原文摘录: (.+)$", body, re.M).group(1)
    a=line.find(LQ); b=line.rfind(RQ)
    core = line[a+1:b]
    # 规范化：把内层双引号还原为原文的单引号，再比对
    cand = [core, core.replace(LQ,SL).replace(RQ,SR)]
    segs_list = [[p for p in c.split("\u2026\u2026") if len(p)>=8] or [c] for c in cand]
    if any(all(p in nov for p in segs) for segs in segs_list):
        ok+=1
    else:
        bad.append(eid)
print("A1 normalized: ok", ok, "fail", len(bad), bad)
