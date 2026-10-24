
# -*- coding: utf-8 -*-
import io
LINES = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read().split('\n')
chap = []
for row in io.open('章节索引.tsv', encoding='utf-8'):
    f = row.rstrip('\n').split('|')
    if f[0]=='神雕侠侣':
        a,b = f[4].split('-')
        chap.append((int(f[1]), f[3], int(a), int(b)))
MARK = ['当年','那时','从前','往日','昔年','数十年前','多年前','自幼','幼时','少年时','年轻时','小时候','先师','祖师','师父说','曾听','听说','原来','后来','当时','昔日','旧事','往事','身世','来历','真相','秘密','临终','遗言','遗训','上代','前辈','百年前','十余年前','数年前','二十年前','三十年前']
tot = 0
for s,t,a,b in chap:
    if s < 23: continue
    n = sum(1 for i in range(a,b+1) if any(m in LINES[i-1] for m in MARK))
    tot += n
    print(s, t, a, b, n)
print('TOTAL', tot)
