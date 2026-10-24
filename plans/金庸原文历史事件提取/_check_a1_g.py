
import re
nov = open("原文UTF8/天龙八部.txt",encoding="utf-8").read()
t = open("批次A/A1-逍遥派三师兄妹.md",encoding="utf-8").read()
LQ="\u201c"; RQ="\u201d"; SL="\u2018"; SR="\u2019"
entries = re.findall(r"### (EV-[^\s·]+)[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
bad=[]; ok=0
for eid, body in entries:
    line = re.search(r"^- 原文摘录: (.+)$", body, re.M).group(1)
    # 抽出所有成对引号里的内容（支持 ①② 分段 + 行号标注）
    quotes = re.findall(LQ + r"([^" + RQ + r"]+)" + RQ, line)
    if not quotes:
        bad.append((eid,"noquote")); continue
    allok=True
    for q in quotes:
        q2 = q.replace(LQ,SL).replace(RQ,SR)
        for cand in (q, q2):
            segs=[p for p in cand.split("\u2026\u2026") if len(p)>=8] or [cand]
            if all(p in nov for p in segs):
                break
        else:
            allok=False
    if allok: ok+=1
    else: bad.append((eid,"miss"))
print("A1 FINAL ok", ok, "/", len(entries), "fail", bad)
