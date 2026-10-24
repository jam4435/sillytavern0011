# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
L=io.open('../原文UTF8/天龙八部.txt',encoding='utf-8').read().split('\n')
LQ='\u201c'; RQ='\u201d'
entries=re.findall(r'### (EV-天龙-\d+) · ([^\n]*)\n(.*?)(?=\n### |\n---)', t, re.S)
for eid,title,body in entries:
    pos=re.search(r'^- 原文位置: (.+)$', body, re.M).group(1)
    q=re.search(r'^- 原文摘录: (.+)$', body, re.M).group(1)
    s=q.find(LQ); e=q.rfind(RQ); inner=q[s+1:e]
    segs=[x for x in inner.split('\u2026\u2026') if len(x)>=8]
    hit=int(re.search(r'命中行 (\d+)', pos).group(1))
    lines=[i+1 for i,l in enumerate(L) if all(sg in l for sg in segs)]
    if hit not in lines:
        print(eid, 'HIT', hit, 'ACTUAL', lines[:4], '|', title[:30])