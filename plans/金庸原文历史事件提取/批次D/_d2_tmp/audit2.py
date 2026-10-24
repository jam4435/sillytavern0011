
# -*- coding: utf-8 -*-
import io, re
t = io.open('批次D/D2-神雕第21-40回.md', encoding='utf-8').read()
# any leftover brackets or placeholder
print('brackets', t.count('[['), t.count(']]'))
print('placeholder', t.count('（见相关主线卡）'))
print('EV-神雕-待核', t.count('EV-神雕-待核'))
# show the 5 已完整记录 cards and the 差分 distribution
from collections import Counter
c = Counter(re.findall(r'- 与现有条目差分: ([^\n—]+)', t))
for k,v in c.items(): print(v, k.strip()[:30])
