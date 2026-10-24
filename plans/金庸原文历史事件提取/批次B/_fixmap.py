import re, json
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
ms = list(re.finditer(r'### (EV-天龙-(\d{4})) · ([^\n]*)\n((?:(?!\n### |\n## ).)*?)(?=\n### |\n## |\Z)', t, re.S))
T = [(m.group(2), m.group(3)) for m in ms]
json.dump(T, open('批次B/_T.json','w'), ensure_ascii=False, indent=1)

def bigrams(s):
    s = re.sub(r'[^\u4e00-\u9fff]', '', s)
    return set(s[i:i+2] for i in range(len(s)-1))

refs = re.findall(r'(EV-天龙-(\d{4}))（([^）]{2,40})）', t)
print('refs with hints', len(refs))
uncertain = []
for eid, num, hint in refs:
    cur = [ti for n, ti in T if n == num]
    cur = cur[0] if cur else ''
    if not cur:
        uncertain.append((eid, hint, 'B3/A1?')); continue
    if bigrams(hint) & bigrams(cur):
        continue
    scores = sorted(((len(bigrams(hint) & bigrams(ti)), n, ti) for n, ti in T), reverse=True)
    best = scores[0]
    uncertain.append((eid, hint, cur, best[0], best[1], best[2]))
print('needing fix', len(uncertain))
for u in uncertain: print(' ', u)
