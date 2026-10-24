# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
titles={}
for m in re.finditer(r'^### (EV-天龙-\d+) · (.+)$', t, re.M):
    titles[m.group(1)]=m.group(2)
refs=re.findall(r'EV-天龙-\d+', t)
cur=None; issues=[]
for line in t.split('\n'):
    m=re.match(r'^### (EV-天龙-\d+)', line)
    if m: cur=m.group(1); continue
    for r in re.findall(r'EV-天龙-\d+', line):
        if r==cur: continue
        if r not in titles: issues.append((cur,'MISSING',r))
print('missing refs:', issues[:20])
print('--- ref + target title ---')
seen=set()
for line in t.split('\n'):
    for r in re.findall(r'EV-天龙-\d+', line):
        if r in titles and r not in seen:
            seen.add(r)
print('total distinct refs', len(seen))