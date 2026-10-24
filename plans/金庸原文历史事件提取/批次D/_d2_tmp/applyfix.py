# -*- coding: utf-8 -*-
import io, os, re, json, sys
D='批次D/_d2_tmp/cards'
fixes = json.load(open('批次D/_d2_tmp/fixes.json', encoding='utf-8'))
done = []
for f in sorted(os.listdir(D)):
    if not re.match(r'^\d{3}_', f): continue
    p = os.path.join(D, f)
    s = io.open(p, encoding='utf-8').read()
    o = s
    for a, b in fixes:
        if a in s:
            s = s.replace(a, b)
            done.append((f, a[:12]))
    if s != o:
        io.open(p,'w',encoding='utf-8').write(s)
print(len(done))
for d in done: print(d)
