import re
from collections import Counter, defaultdict
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
cards = [(m.group(1), m.group(2)) for m in
         re.finditer(r'### (EV-天龙-(\d{4})) · ([^\n]*)\n((?:(?!\n### |\n## ).)*?)(?=\n### |\n## |\Z)', t, re.S)]
print('cards', len(cards))
rows = []
for m in re.finditer(r'### (EV-天龙-(\d{4})) · ([^\n]*)\n((?:(?!\n### |\n## ).)*?)(?=\n### |\n## |\Z)', t, re.S):
    num, title, body = m.group(2), m.group(3), m.group(4)
    ch = re.search(r'^- 原文位置: 《天龙八部》第([一二三四五六七八九十]+)回', body, re.M).group(1)
    diff = re.search(r'^- 与现有条目差分: (.+)$', body, re.M).group(1).split('（')[0].strip()
    rows.append((int(num), ch, title, diff))
print('--- ch40 cards (check against B3) ---')
for n, ch, ti, df in rows:
    if ch == '四十': print(' ', n, ti)
print('--- diff tally ---')
print(Counter(r[3] for r in rows))
print('--- per chapter ---')
d = defaultdict(list)
for n, ch, ti, df in rows: d[ch].append(n)
for ch in ['四十','四十一','四十二','四十三','四十四','四十五','四十六','四十七','四十八','四十九','五十']:
    v = sorted(d.get(ch, []))
    print(ch, len(v), v[0] if v else '-', v[-1] if v else '-')
print('TOTAL', sum(len(v) for v in d.values()))
