
# -*- coding: utf-8 -*-
import io
LINES = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read().split('\n')
chap = []
for row in io.open('章节索引.tsv', encoding='utf-8'):
    f = row.rstrip('\n').split('|')
    if f[0]=='神雕侠侣':
        a,b = f[4].split('-')
        chap.append((int(f[1]), f[3], int(a), int(b)))
MARK = ['当年','那时','从前','往日','昔年','数十年前','多年前','自幼','幼时','少年时','年轻时','小时候','先师','祖师','师父说','曾听','听说','原来','后来','当时','昔日','旧事','往事','身世','来历','真相','秘密','临终','遗言','遗训','上代','前辈','百年前','十余年前','数年前','二十年前','三十年前','其后','自此','原来如此','本来','幼年']
out = io.open('批次D/_d2_tmp/cand23_40.txt','w',encoding='utf-8')
for s,t,a,b in chap:
    if s < 23: continue
    out.write('=== 第%d回 %s  行 %d-%d ===\n' % (s,t,a,b))
    for i in range(a,b+1):
        line = LINES[i-1].strip()
        if not line: continue
        hits = [m for m in MARK if m in line]
        if hits:
            pos = min(line.find(m) for m in hits)
            st = max(0, pos-18)
            out.write('%d|%s\n' % (i, line[st:st+115]))
out.close()
print('ok')
