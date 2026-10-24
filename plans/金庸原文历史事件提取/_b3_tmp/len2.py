# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
p='../批次B/B3-天龙第31-40回.md'
t=io.open(p,encoding='utf-8').read()
entries=re.findall(r'### (EV-天龙-\d+) · ([^\n]*)\n(.*?)(?=\n### |\n---|\Z)', t, re.S)
lens=[]
for eid,title,body in entries:
    q=re.search(r'^- 原文摘录: (.+)$', body, re.M).group(1)
    s=q.find('\u201c'); e=q.rfind('\u201d')
    lens.append((len(q[s+1:e]), eid))
lens.sort(reverse=True)
print(lens[:8])
print('max', lens[0][0], 'min', lens[-1][0])