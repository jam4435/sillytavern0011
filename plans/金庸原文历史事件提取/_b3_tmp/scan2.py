# -*- coding: utf-8 -*-
import json, io
d = json.load(io.open('../旧事线索扫描.json', encoding='utf-8'))
out = io.open('clues.txt','w',encoding='utf-8')
rows = [x for x in d if x.get('book')=='天龙八部' and 13649 <= x['line'] <= 17435]
out.write('total %d\n' % len(rows))
for x in sorted(rows, key=lambda y: y['line']):
    out.write('%d [%s] %s\n' % (x['line'], x['markers'], x['text'][:80]))
out.close()
print(len(rows))
