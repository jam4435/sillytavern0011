# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_whole.md',encoding='utf-8').read()
ids=re.findall(r'^### (EV-天龙-\d+)', t, re.M)
order=[]
for x in ids:
    if x not in order: order.append(x)
mapping={}
for i,old in enumerate(order):
    mapping[old]='EV-天龙-%04d' % (1201+i)
print('cards',len(ids),'unique',len(order))
print('range', min(mapping.values()), max(mapping.values()))
# placeholder replace
for i,(old,new) in enumerate(mapping.items()):
    t=t.replace(old, '\x00%d\x00'%i)
for i,(old,new) in enumerate(mapping.items()):
    t=t.replace('\x00%d\x00'%i, new)
io.open('_final.md','w',encoding='utf-8').write(t)
ids2=re.findall(r'^### (EV-天龙-\d+)', t, re.M)
print('after',len(ids2), 'first',ids2[0],'last',ids2[-1])
print('sequential:', ids2==['EV-天龙-%04d'%(1201+i) for i in range(len(ids2))])