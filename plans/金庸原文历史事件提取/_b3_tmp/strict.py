# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
nov=io.open('../原文UTF8/天龙八部.txt',encoding='utf-8').read()
L=nov.split('\n')
LQ='\u201c'; RQ='\u201d'
entries=re.findall(r'### (EV-天龙-\d+) · ([^\n]*)\n(.*?)(?=\n### |\n---)', t, re.S)
bad=[]
for eid,title,body in entries:
    mq=re.search(r'^- 原文摘录: (.+)$', body, re.M)
    q=mq.group(1)
    s=q.find(LQ); e=q.rfind(RQ)
    inner=q[s+1:e] if s>=0 and e>s else q
    for seg in inner.split('\u2026\u2026'):
        if len(seg)>=8 and seg not in nov:
            bad.append((eid, seg[:50])); break
        if 0<len(seg)<8 and seg not in nov:
            bad.append((eid,'SHORT:'+seg)); break
print('STRICT FAIL', len(bad))
for b in bad: print(' ', b[0], '|', b[1])