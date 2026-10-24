import re
p = '批次B/B4-天龙第41-50回.md'
t = open(p, encoding='utf-8').read()
old = '《天龙八部》第四十二回 老魔小丑 岂堪一击 胜之不武｜行 18642-18660（命中行 18660）'
new = '《天龙八部》第四十二回 老魔小丑 岂堪一击 胜之不武｜行 18642-18670（命中行 18642）'
assert old in t
t = t.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(t)
print('fixed 1741')

# 全量自查：摘录首段是否真的落在命中行
nov = open('原文UTF8/天龙八部.txt', encoding='utf-8').read().split('\n')
LQ, RQ, ELL = chr(0x201c), chr(0x201d), chr(0x2026)*2
blocks = re.findall(r'### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---|\Z)', t, re.S)
bad = []
for eid, body in blocks:
    pos = re.search(r'^- 原文位置: (.+)$', body, re.M)
    ex = re.search(r'^- 原文摘录: (.+)$', body, re.M)
    if not (pos and ex): continue
    quotes = re.findall(LQ + '([^' + RQ + ']+)' + RQ, ex.group(1))
    segs = [q for q in quotes]
    if not segs: continue
    q = segs[0]
    seg = ([x for x in q.split(ELL) if len(x) >= 8] or [q])[0]
    hits = [int(x) for x in re.findall(r'\d{2,6}', re.search(r'命中行\s*([\d,、\s]+)', pos.group(1)).group(1))]
    if not any(seg in nov[n-1] for n in hits):
        real = [i+1 for i, l in enumerate(nov) if seg in l]
        bad.append((eid, hits, real[:4]))
print('bad', len(bad))
for b in bad: print(' ', b)
