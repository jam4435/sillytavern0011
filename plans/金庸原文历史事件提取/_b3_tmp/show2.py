# -*- coding: utf-8 -*-
import io, json, sys
sys.stdout.reconfigure(encoding='utf-8')
rows=json.load(io.open('../现有条目索引.json',encoding='utf-8'))
def hits(k):
    return [r for r in rows if k in (r.get('key') or '') or k in (r.get('cast') or '') or k in (r.get('summary') or '') or k in (r.get('detailHead') or '')]
for k in ['二十三年','蒙眼','大燕','琵琶骨','神音','刺瞎']:
    print('===',k, len(hits(k)))
    for r in hits(k)[:3]:
        print('  ', r.get('key'),'|',r.get('cast'),'|',r.get('summary')[:90])