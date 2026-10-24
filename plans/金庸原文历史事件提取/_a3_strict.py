
import re
LQ="\u201c"; RQ="\u201d"
nov = open("原文UTF8/射雕英雄传.txt",encoding="utf-8").read()+"\n"+open("原文UTF8/神雕侠侣.txt",encoding="utf-8").read()
t = open("批次A/A3-梅超风完整前史.md",encoding="utf-8").read()
entries = re.findall(r"### (EV-[^\s·]+)[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
bad=[]; ok=0
for eid, body in entries:
    line = re.search(r"^- 原文摘录: (.+)$", body, re.M).group(1)
    quotes = re.findall(LQ+r"([^"+RQ+r"]+)"+RQ, line)
    if not quotes: bad.append((eid,"NOQ")); continue
    allok=True
    for q in quotes:
        segs=[p for p in q.split("\u2026\u2026") if len(p)>=8] or [q]
        if not all(p in nov for p in segs): allok=False; break
    if allok: ok+=1
    else: bad.append((eid,"MISS"))
print("A3 strict: cards",len(entries),"pass",ok,"fail",len(bad),bad[:6])
# 检查「原文叙述照抄」标注是否与第三人称一致
narr = len(re.findall(r"原文叙述照抄", t))
print("标注为叙述照抄的卡:", narr)
