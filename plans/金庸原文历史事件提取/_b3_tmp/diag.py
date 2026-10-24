# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
nov=io.open('../原文UTF8/天龙八部.txt',encoding='utf-8').read()
entries=re.findall(r'### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---)', t, re.S)
LQ='\u201c'; RQ='\u201d'; ELL='\u2026\u2026'
for eid, body in entries:
    m=re.search(r'^- 原文摘录: (.+)$', body, re.M)
    if not m: print(eid,'NOEX'); continue
    quotes=re.findall(LQ+'([^'+RQ+']+)'+RQ, m.group(1))
    for q in quotes:
        segs=[p for p in q.split(ELL) if len(p)>=8] or [q]
        miss=[p for p in segs if p not in nov]
        if miss:
            print(eid,'| MISS:',miss[0][:70])