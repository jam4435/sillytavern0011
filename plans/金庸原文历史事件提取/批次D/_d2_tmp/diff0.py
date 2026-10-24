
# -*- coding: utf-8 -*-
import json, io
d = json.load(open('现有条目索引.json', encoding='utf-8'))
rows = d if isinstance(d, list) else d.get('rows') or d.get('items')
print(type(d), len(rows))
print(json.dumps(rows[0], ensure_ascii=False)[:500])
sd = [r for r in rows if '神雕' in json.dumps(r, ensure_ascii=False)[:200]]
print('SD-count', len(sd))
