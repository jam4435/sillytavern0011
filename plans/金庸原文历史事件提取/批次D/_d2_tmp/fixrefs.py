
# -*- coding: utf-8 -*-
import io, os, re, json
D='批次D/_d2_tmp/cards'
alias = json.load(open('批次D/_d2_tmp/alias.json', encoding='utf-8'))
files = sorted([f for f in os.listdir(D) if re.match(r'^\d{3}_', f)])
titles = []
for f in files:
    body = io.open(os.path.join(D,f), encoding='utf-8').read().strip()
    titles.append(body.split('\n')[0].lstrip('· ').strip())
t2i = {t: 'EV-神雕-%04d' % (600+i) for i,t in enumerate(titles)}
def rep(m):
    k = m.group(1).strip()
    k2 = alias.get(k, k)
    if k2 in t2i: return t2i[k2]
    return None
out = []
mismatch = set()
for f in files:
    p = os.path.join(D,f)
    s = io.open(p, encoding='utf-8').read()
    def f2(m):
        k = m.group(1).strip()
        k2 = alias.get(k, k)
        if k2 in t2i: return t2i[k2]
        mismatch.add(k)
        return m.group(0)
    s2 = re.sub(r'\[\[([^\]]+)\]\]', f2, s)
    io.open(p,'w',encoding='utf-8').write(s2)
print('unresolved:', sorted(mismatch))
