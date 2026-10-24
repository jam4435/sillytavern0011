# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
books=['射雕英雄传','神雕侠侣','倚天屠龙记','笑傲江湖','鹿鼎记']
for k in ['逍遥派','北冥神功','小无相功','天山六阳掌']:
    tot=[]
    for b in books:
        s=io.open('../原文UTF8/%s.txt'%b,encoding='utf-8').read()
        c=s.count(k)
        if c: tot.append((b,c))
    print(k, tot if tot else 'ALL-ZERO in other five')