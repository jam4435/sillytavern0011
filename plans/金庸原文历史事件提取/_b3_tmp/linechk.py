# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
L=io.open('../原文UTF8/天龙八部.txt',encoding='utf-8').read().split('\n')
entries=re.findall(r'### (EV-天龙-\d+) · ([^\n]*)\n(.*?)(?=\n### |\n---)', t, re.S)
LQ='\u201c'; RQ='\u201d'
prob=[]
for eid,title,body in entries:
    mpos=re.search(r'^- 原文位置: (.+)$', body, re.M)
    mq=re.search(r'^- 原文摘录: (.+)$', body, re.M)
    pos=mpos.group(1); q=mq.group(1)
    hit=re.search(r'命中行 (\d+)', pos)
    if not hit: prob.append((eid,'NOHIT')); continue
    hitline=int(hit.group(1))
    qs=re.findall(LQ+'([^'+RQ+']+)'+RQ, q)
    segs=[p for p in qs[0].split('\u2026\u2026') if len(p)>=8]
    ok=all(s in L[hitline-1] for s in segs) if segs else False
    if not ok:
        found=[i+1 for i,l in enumerate(L) if all(s in l for s in segs)]
        prob.append((eid, hitline, found[:5]))
print('problems', len(prob))
for p in prob: print(p)