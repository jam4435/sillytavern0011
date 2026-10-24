import re, json
LQ="\u201c"; RQ="\u201d"; ELL="\u2026\u2026"
QALL=set("\u201c\u201d\u2018\u2019")
nov = open('原文UTF8/笑傲江湖.txt', encoding='utf-8').read().split("\n")
def kept(ch): return ch not in QALL
NL=[]; NM=[]
for line in nov:
    idx=[];buf=[]
    for i,ch in enumerate(line):
        if kept(ch): idx.append(i);buf.append(ch)
    NL.append("".join(buf)); NM.append(idx)
def norm(s): return "".join(c for c in s if kept(c))
def locate(seg):
    p=norm(seg); out=[]
    for i,line in enumerate(NL):
        st=0
        while True:
            k=line.find(p,st)
            if k<0: break
            raw=nov[i][NM[i][k]:NM[i][k+len(p)-1]+1]
            out.append((i+1,raw)); st=k+1
    return out
t=open('批次F/F1-笑傲第1-20回.md',encoding='utf-8').read()
blocks=list(re.finditer(r"### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---|\Z)",t,re.S))
rows=[]
for m in blocks:
    eid=m.group(1); body=m.group(2)
    ex=re.search(r"^- 原文摘录: (.+)$",body,re.M).group(1)
    quotes=re.findall(LQ+r"([^"+RQ+r"]+)"+RQ,ex)
    segs=[]
    for q in quotes: segs += [p for p in q.split(ELL) if len(p)>=8] or [q]
    info=[]
    for s in segs:
        locs=locate(s)
        info.append((s,[l for l,_ in locs][:4],[r for _,r in locs][:1]))
    alllines=[]
    for s,ls,raws in info:
        alllines += ls[:1]
    spread = (min(alllines), max(alllines)) if alllines else None
    need_split = any('\u201d' in (raws[0] if raws else '') or '\u201c' in (raws[0] if raws else '') for s,ls,raws in info)
    if spread and (spread[1]-spread[0] > 25 or need_split or not alllines):
        rows.append((eid, spread, need_split, [(s[:28], ls) for s,ls,raws in info]))
print("cards needing attention:", len(rows))
for r in rows: print(r[0], 'spread', r[1], 'quoteInside', r[2])
