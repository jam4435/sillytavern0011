# -*- coding: utf-8 -*-
import io, re, sys, collections
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('../批次B/B3-天龙第31-40回.md',encoding='utf-8').read()
entries=re.findall(r'### (EV-天龙-\d+) · ([^\n]*)\n(.*?)(?=\n### |\n---|\Z)', t, re.S)
c=collections.Counter()
for eid,title,body in entries:
    v=re.search(r'^- 与现有条目差分: (.+)$', body, re.M).group(1)
    k=v.split('（')[0].strip()
    c[k]+=1
for k,v in c.most_common(): print(v,'|',k)
print('total',len(entries))