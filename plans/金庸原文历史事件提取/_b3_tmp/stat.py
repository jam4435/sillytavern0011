# -*- coding: utf-8 -*-
import io, re, sys, collections
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
entries=re.findall(r'### (EV-天龙-\d+) · ([^\n]*)\n(.*?)(?=\n### |\n---)', t, re.S)
c=collections.Counter()
for eid,title,body in entries:
    m=re.search(r'^- 与现有条目差分: (.+)$', body, re.M)
    v=m.group(1).split('（')[0].split('(')[0].strip()
    c[v]+=1
print('total',len(entries))
for k,v in c.most_common(): print(v,'|',k)
print('--- 线索性质 ---')
c2=collections.Counter()
for eid,title,body in entries:
    m=re.search(r'^- 线索性质: (.+)$', body, re.M)
    c2[m.group(1).split('（')[0].strip()]+=1
for k,v in c2.most_common(): print(v,'|',k)