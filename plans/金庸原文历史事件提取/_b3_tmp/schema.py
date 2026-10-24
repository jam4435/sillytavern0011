# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
p='../批次B/B3-天龙第31-40回.md'
t=io.open(p,encoding='utf-8').read()
ids=re.findall(r'^### (EV-天龙-\d+)', t, re.M)
print('cards',len(ids),'seq', ids==['EV-天龙-%04d'%(1201+i) for i in range(len(ids))])
# check all 12 fields present in each card
entries=re.findall(r'### (EV-天龙-\d+) · ([^\n]*)\n(.*?)(?=\n### |\n---|\Z)', t, re.S)
need=['原文位置','原文摘录','发生时间','地点','涉及人物','关系变化','事件经过','前因','后果','线索性质','跨书引用','与现有条目差分','待核']
missing=[]
for eid,title,body in entries:
    for f in need:
        if ('- %s:'%f) not in body: missing.append((eid,f))
print('field-missing', missing)
print('entries parsed', len(entries))