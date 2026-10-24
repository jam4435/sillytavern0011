
# -*- coding: utf-8 -*-
import os, io, re, json
D='批次D/_d2_tmp/cards'
files = sorted([f for f in os.listdir(D) if re.match(r'^\d{3}_', f)])
from collections import Counter
cc = Counter()
bad_len = []
for f in files:
    s = io.open(os.path.join(D,f), encoding='utf-8').read()
    m = re.search(r'第([一二三四五六七八九十]+)回', s)
    cc[m.group(1) if m else '?'] += 1
    q = re.search(r'- 原文摘录: (.+)', s).group(1)
    if len(q) > 140: bad_len.append((f, len(q)))
order = ['二十一','二十二','二十三','二十四','二十五','二十六','二十七','二十八','二十九','三十','三十一','三十二','三十三','三十四','三十五','三十六','三十七','三十八','三十九','四十']
for k in order:
    print(k, cc.get(k,0))
print('total', sum(cc.values()), 'keys', dict(cc))
print('overlong', bad_len)
