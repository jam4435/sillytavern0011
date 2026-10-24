
# -*- coding: utf-8 -*-
import io, os, re
D='批次D/_d2_tmp/cards'
files = sorted([f for f in os.listdir(D) if re.match(r'^\d{3}_', f)])
titles = []
for f in files:
    body = io.open(os.path.join(D,f), encoding='utf-8').read().strip()
    titles.append(body.split('\n')[0].lstrip('· ').strip())
t2i = {t: 'EV-神雕-%04d' % (601+i) for i,t in enumerate(titles)}
# fix ids already substituted (0600..0717 offsets)
print(files[0], t2i[titles[0]], files[-1], t2i[titles[-1]])
