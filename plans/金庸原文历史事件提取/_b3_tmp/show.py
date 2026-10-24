# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
for line in t.split('\n'):
    if '15483' in line or '1286' in line: print(repr(line[:160]))