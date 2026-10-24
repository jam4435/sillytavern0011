
# -*- coding: utf-8 -*-
import json, io, os
d = json.load(open('批次D/_d2_tmp/cards.json', encoding='utf-8'))
os.makedirs('批次D/_d2_tmp/cards', exist_ok=True)
idx = []
for i, c in enumerate(d):
    fn = '批次D/_d2_tmp/cards/%03d_%s.md' % (i+1, c['key'])
    io.open(fn, 'w', encoding='utf-8').write(c['text'])
    idx.append(c['key'])
io.open('批次D/_d2_tmp/cards/_index.txt','w',encoding='utf-8').write('\n'.join(idx))
print(len(idx))
