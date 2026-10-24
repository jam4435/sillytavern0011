
# -*- coding: utf-8 -*-
import re, io
md = io.open('批次D/D2-神雕第21-40回.md', encoding='utf-8').read()
for eid in ['0631','0688','0683','0668','0704','0716']:
    b = re.search(r'### EV-神雕-'+eid+r'[^\n]*\n(.*?)(?=\n### |\n---|\Z)', md, re.S).group(1)
    print('===', eid)
    for ln in b.split('\n'):
        if ln.startswith('- 原文位置') or ln.startswith('- 原文摘录'):
            print(ln)
