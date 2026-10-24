
import os, io, re
D='批次D/_d2_tmp/cards'
for f in sorted(os.listdir(D)):
    if not re.match(r'^\d{3}_', f): continue
    b = io.open(os.path.join(D,f), encoding='utf-8').read()
    if '原文位置' not in b:
        print('NO POS:', f)
    m = re.search(r'第([一二三四五六七八九十百]+)回', b)
    if not m: print('NO CHAP:', f, b.split('\n')[0][:40])
print(sorted([f for f in os.listdir(D) if re.match(r'^\d{3}_', f)])[-6:])
