
# -*- coding: utf-8 -*-
import io, os, re
D='批次D/_d2_tmp/cards'
files = sorted([f for f in os.listdir(D) if re.match(r'^\d{3}_', f)])
from collections import Counter, OrderedDict
diff = Counter()
ranges = []
for f in files:
    s = io.open(os.path.join(D,f), encoding='utf-8').read()
    m = re.search(r'- 与现有条目差分: (\S+)', s)
    diff[m.group(1) if m else '?'] += 1
    pos = re.search(r'行 ([\d\-、]+)', s)
    if pos:
        for x in re.findall(r'\d{4,5}', pos.group(1)):
            ranges.append(int(x))
print(dict(diff))
print('min', min(ranges), 'max', max(ranges))
