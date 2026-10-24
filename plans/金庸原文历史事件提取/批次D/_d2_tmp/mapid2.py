
# -*- coding: utf-8 -*-
import io, os, re
D='批次D/_d2_tmp/cards'
files = sorted([f for f in os.listdir(D) if re.match(r'^\d{3}_', f)])
by = {}
for f in files:
    num = int(f[:3])
    by['EV-神雕-%04d' % (600 + num - 1)] = f
for eid in ['EV-神雕-0631','EV-神雕-0688','EV-神雕-0683','EV-神雕-0668','EV-神雕-0704','EV-神雕-0716']:
    print(eid, by[eid])
