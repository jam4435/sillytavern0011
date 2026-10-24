# -*- coding: utf-8 -*-
import json, io
d = json.load(io.open('../旧事线索扫描.json', encoding='utf-8'))
print(type(d), len(d))
if isinstance(d, dict):
    print(list(d.keys())[:5])
    d = d.get('items') or d.get('lines') or []
print(d[0])
