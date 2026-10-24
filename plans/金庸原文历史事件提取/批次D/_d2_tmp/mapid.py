
# -*- coding: utf-8 -*-
import io, os, re
D='批次D/_d2_tmp/cards'
files = sorted([f for f in os.listdir(D) if re.match(r'^\d{3}_', f)])
for i,f in enumerate(files, start=599):
    if ('%04d'%i) in ('0631','0683','0668','0688','0704','0716'):
        print('EV-%04d'%i, f)
print('first', 'EV-0600', files[0], 'last', 'EV-%04d'%(599+len(files)), files[-1])
