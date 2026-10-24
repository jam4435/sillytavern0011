# -*- coding: utf-8 -*-
import io, re, sys, collections
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
cur='';c=collections.Counter();order=[]
for line in t.split('\n'):
    if line.startswith('## ') or line.startswith('# '):
        cur=line; 
        if cur not in order: order.append(cur)
    elif line.startswith('### EV-'): c[cur]+=1
for k in order: print(c[k],'|',k[:50])
print('sum',sum(c.values()))