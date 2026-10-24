# -*- coding: utf-8 -*-
import io, re, json, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('../批次B/B3-天龙第31-40回.md',encoding='utf-8').read()
rows=json.load(io.open('../现有条目索引.json',encoding='utf-8'))
def cnt(k):
    return sum(1 for r in rows if k in (r.get('key') or '') or k in (r.get('cast') or '') or k in (r.get('summary') or '') or k in (r.get('detailHead') or ''))
kws=set()
for m in re.finditer(r'`([^`]{1,12})`', t):
    kws.add(m.group(1))
bad=[]
for k in sorted(kws):
    c=cnt(k)
    # find lines claiming 0 hit for this kw in 差分 field
    for line in t.split('\n'):
        if line.startswith('- 与现有条目差分:') and k in line and ('0 命中' in line or '均 0' in line):
            if c>0: bad.append((k,c,line[:110]))
print('CONTRADICTIONS', len(bad))
for b in bad: print(b)