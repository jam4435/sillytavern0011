# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
fixes=[
 ('行 15310、15316-15318（命中行 15318）','行 15310、15316-15318（命中行 15316）'),
 ('行 15326-15336（命中行 15336）','行 15326-15336（命中行 15326）'),
 ('行 15930-15938（命中行 15930）','行 15930-15938（命中行 15934）'),
 ('行 16128-16184（命中行 16178）','行 16128-16184（命中行 16170）'),
]
n=0
for a,b in fixes:
    if a in t: t=t.replace(a,b); n+=1
    else: print('NF',a)
io.open('_final.md','w',encoding='utf-8').write(t)
print('fixed',n)