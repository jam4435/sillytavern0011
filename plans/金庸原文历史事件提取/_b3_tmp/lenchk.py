# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
p='../批次B/B3-天龙第31-40回.md'
t=io.open(p,encoding='utf-8').read()
entries=re.findall(r'### (EV-天龙-\d+) · ([^\n]*)\n(.*?)(?=\n### |\n---|\Z)', t, re.S)
over=[]
for eid,title,body in entries:
    q=re.search(r'^- 原文摘录: (.+)$', body, re.M).group(1)
    s=q.find('\u201c'); e=q.rfind('\u201d')
    inner=q[s+1:e]
    n=len(inner)
    if n>128: over.append((eid,n,inner[:40]))
print('over-120cards', len(over))
for o in over: print(o)