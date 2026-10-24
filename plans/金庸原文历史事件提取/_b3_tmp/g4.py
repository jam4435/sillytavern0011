# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
lines = io.open('../原文UTF8/天龙八部.txt', encoding='utf-8').read().split('\n')
def where(n):
    hits=[i+1 for i,l in enumerate(lines) if n in l]
    return len(hits), hits[:6]
for n in ['西夏公主','招亲','王夫人','镇南王夫人','玄慈','叶二娘','雁门关','带头大哥','萧远山','刀白凤']:
    c,h=where(n)
    print(n, c, h)
print('--- 王语嫣母亲 mentions near ch38? 搜索 舅母/妈妈')
for n in ['舅母','妈妈','母亲']:
    c,h=where(n); print(n,c,h[:8])
