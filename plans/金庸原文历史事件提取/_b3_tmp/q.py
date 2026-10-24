# -*- coding: utf-8 -*-
import json, io, sys
sys.stdout.reconfigure(encoding='utf-8')
rows = json.load(io.open('../现有条目索引.json', encoding='utf-8'))
kws = sys.argv[1:]
for kw in kws:
    hit = [r for r in rows if kw in (r.get('key') or '') or kw in (r.get('cast') or '') or kw in (r.get('summary') or '') or kw in (r.get('detailHead') or '')]
    print('=== %s : %d ===' % (kw, len(hit)))
    for h in hit:
        print('  [%s] %s | %s | %s | %s' % (h.get('src'), h.get('key'), h.get('loc'), h.get('time'), h.get('cast')))
        print('     %s' % h.get('summary'))
