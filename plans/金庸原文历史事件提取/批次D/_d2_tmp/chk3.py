
import os, io, re
D='批次D/_d2_tmp/cards'
for f in sorted(os.listdir(D)):
    if not re.match(r'^\d{3}_', f): continue
    lines = io.open(os.path.join(D,f), encoding='utf-8').read().split('\n')
    pos = [l for l in lines if l.startswith('- 原文位置: ')]
    if not pos or not re.search(r'第[一二三四五六七八九十百]+回', pos[0]):
        print('BAD', f, pos[:1])
