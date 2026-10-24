import re
LQ, RQ, ELL = chr(0x201c), chr(0x201d), chr(0x2026)*2
nov = open('原文UTF8/天龙八部.txt', encoding='utf-8').read().split('\n')
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
blocks = re.findall(r'### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---|\Z)', t, re.S)
targets = ['1704','1756','1765','1794','1796','1811','1816']
for eid, body in blocks:
    if eid.split('-')[-1] not in targets: continue
    pos = re.search(r'^- 原文位置: (.+)$', body, re.M).group(1)
    ex = re.search(r'^- 原文摘录: (.+)$', body, re.M).group(1)
    q = re.findall(LQ + '([^' + RQ + ']+)' + RQ, ex)[0]
    segs = [p for p in q.split(ELL) if len(p) >= 8] or [q]
    s = segs[0]
    found = [i+1 for i, line in enumerate(nov) if s in line]
    print('=== %s ===' % eid)
    print('  POS:', pos)
    print('  SEG:', s[:50])
    print('  ACTUAL LINES:', found[:8])
