# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
cur=''
bad=[]
for line in t.split('\n'):
    if line.startswith('## ') or line.startswith('# '): cur=line
    elif line.startswith('### EV-'):
        eid=line.split()[1]
        print(cur[:20], '|', eid, '|', line[4:60])