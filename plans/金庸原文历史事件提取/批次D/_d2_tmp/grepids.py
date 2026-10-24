
# -*- coding: utf-8 -*-
import io, os, re
D='批次D/_d2_tmp/cards'
for f in sorted(os.listdir(D)):
    if not re.match(r'^\d{3}_', f): continue
    s = io.open(os.path.join(D,f),encoding='utf-8').read()
    for m in re.finditer(r'EV-神雕-\d{4}', s):
        # print context
        a=max(0,m.start()-14); b=m.end()+14
        print(f, '|', s[a:b].replace('\n',' '))
