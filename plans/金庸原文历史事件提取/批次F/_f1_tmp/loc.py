import re, json
LQ="\u201c"; RQ="\u201d"; ELL="\u2026\u2026"
QUOTES = set("\u201c\u201d\u2018\u2019\u300c\u300d")
nov = open('原文UTF8/笑傲江湖.txt', encoding='utf-8').read().split("\n")

def norm(s):
    return "".join(ch for ch in s if ch not in QUOTES)

# precompute normalized lines with index maps
NL=[]; NM=[]
for line in nov:
    idx=[]; buf=[]
    for i,ch in enumerate(line):
        if ch in QUOTES: continue
        idx.append(i); buf.append(ch)
    NL.append("".join(buf)); NM.append(idx)

def locate(seg):
    p = norm(seg)
    outs=[]
    for i,line in enumerate(NL):
        start=0
        while True:
            k=line.find(p, start)
            if k<0: break
            raw = nov[i][NM[i][k]:NM[i][k+len(p)-1]+1]
            outs.append((i+1, raw))
            start=k+1
    return outs

t = open('批次F/F1-笑傲第1-20回.md', encoding='utf-8').read()
blocks = list(re.finditer(r"### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---|\Z)", t, re.S))
report=[]
for m in blocks:
    eid=m.group(1); body=m.group(2)
    exm = re.search(r"^- 原文摘录: (.+)$", body, re.M)
    ex = exm.group(1)
    quotes = re.findall(LQ + r"([^" + RQ + r"]+)" + RQ, ex)
    segs=[]
    for q in quotes:
        segs += [p for p in q.split(ELL) if len(p) >= 8] or [q]
    info={'id':eid}
    miss=[]
    for s in segs:
        locs = locate(s)
        if not locs: miss.append(s)
    if miss:
        report.append((eid, miss))
print("cards with unlocatable segs:", len(report))
for eid, miss in report:
    print("=====", eid)
    for s in miss: print("   MISS:", s)
