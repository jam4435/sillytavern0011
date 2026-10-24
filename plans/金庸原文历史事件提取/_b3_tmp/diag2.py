# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
nov=io.open('../原文UTF8/天龙八部.txt',encoding='utf-8').read()
entries=re.findall(r'### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---)', t, re.S)
bad=0
for eid, body in entries:
    m=re.search(r'^- 原文摘录: (.+)$', body, re.M)
    if not m: continue
    line=m.group(1)
    if '‘' in line or '’' in line:
        print('SINGLEQUOTE in excerpt:', eid, line[:80]); bad+=1
    # also brute force: whole excerpt body between outer quotes must be substring
    LQ='\u201c'; RQ='\u201d'
    qs=re.findall(LQ+'([^'+RQ+']+)'+RQ, line)
    for q in qs:
        for seg in q.split('\u2026\u2026'):
            if len(seg)<8: 
                if seg and seg not in nov:
                    print('SHORT-MISS', eid, repr(seg))
print('singlequote cards', bad)