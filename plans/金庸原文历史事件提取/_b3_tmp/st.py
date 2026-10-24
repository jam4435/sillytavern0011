# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
for i,l in enumerate(t.split('\n'),1):
    if l.startswith('# ') or l.startswith('## '):
        print(i,'|',l[:70])