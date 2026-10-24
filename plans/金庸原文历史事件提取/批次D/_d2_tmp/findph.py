
# -*- coding: utf-8 -*-
import io, os, re
D='批次D/_d2_tmp/cards'
for f in sorted(os.listdir(D)):
    if not re.match(r'^\d{3}_', f): continue
    p=os.path.join(D,f); s=io.open(p,encoding='utf-8').read()
    if '（见相关主线卡）' in s:
        for ln in s.split('\n'):
            if '（见相关主线卡）' in ln:
                print(f, '|', ln[:110])
