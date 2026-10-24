
# -*- coding: utf-8 -*-
import re, io
LQ="\u201c"; RQ="\u201d"; ELL="\u2026\u2026"
md = io.open('批次D/D2-神雕第21-40回.md', encoding='utf-8').read()
nov = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read().split('\n')
ids = ['0631','0688','0683','0668','0704','0716']
for eid in ids:
    b = re.search(r'### EV-神雕-'+eid+r'[^\n]*\n(.*?)(?=\n### |\n---|\Z)', md, re.S).group(1)
    pos = re.search(r'^- 原文位置: (.+)$', b, re.M).group(1)
    ex = re.search(r'^- 原文摘录: (.+)$', b, re.M).group(1)
    quotes = re.findall(LQ+r'([^'+RQ+r']+)'+RQ, ex)
    segs = []
    for q in quotes: segs += [p for p in q.split(ELL) if len(p)>=8] or [q]
    print('===', eid)
    print(' POS:', pos)
    for s in segs:
        found = [n for n in range(1, len(nov)+1) if s in nov[n-1]]
        print('  SEG(%d): %s' % (len(s), s[:36]))
        print('     lines:', found[:10])
