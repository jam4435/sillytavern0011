# -*- coding: utf-8 -*-
import io, json, sys
sys.stdout.reconfigure(encoding='utf-8')
rows=json.load(io.open('../现有条目索引.json',encoding='utf-8'))
def hits(k):
    return [r for r in rows if k in (r.get('key') or '') or k in (r.get('cast') or '') or k in (r.get('summary') or '') or k in (r.get('detailHead') or '')]
for k in ['伏牛派','柯百岁','大金刚拳','空棺','榜文']:
    print('===',k)
    for r in hits(k):
        print('  ', r.get('key'),'|',r.get('cast'),'|',r.get('summary')[:110])