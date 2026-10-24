# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
L=io.open('../原文UTF8/天龙八部.txt',encoding='utf-8').read().split('\n')
LQ='\u201c'; RQ='\u201d'
entries=re.findall(r'### (EV-天龙-\d+) · ([^\n]*)\n(.*?)(?=\n### |\n---)', t, re.S)
prob=[]
for eid,title,body in entries:
    pos=re.search(r'^- 原文位置: (.+)$', body, re.M).group(1)
    q=re.search(r'^- 原文摘录: (.+)$', body, re.M).group(1)
    s=q.find(LQ); e=q.rfind(RQ); inner=q[s+1:e]
    segs=[x for x in inner.split('\u2026\u2026') if len(x)>=8]
    m=re.search(r'行 (\d+)(?:-(\d+))?', pos)
    a=int(m.group(1)); b=int(m.group(2)) if m.group(2) else a
    # extend: also include 命中行
    hit=int(re.search(r'命中行 (\d+)', pos).group(1))
    lo=min(a,hit); hi=max(b,hit)
    for sg in segs:
        found=[i+1 for i,l in enumerate(L) if sg in l]
        if not any(lo<=f<=hi for f in found):
            prob.append((eid, lo, hi, sg[:40], found[:3]))
print('range problems', len(prob))
for p in prob: print(p)