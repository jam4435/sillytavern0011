# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
t=t.replace('- 后果: EV-天龙-1285（慕容龙城创斗转星移）、EV-天龙-1210（慕容氏复国心术的实践：空棺之谜）',
            '- 后果: EV-天龙-1285（慕容龙城创斗转星移并图谋复国）')
io.open('_final.md','w',encoding='utf-8').write(t)
print('ok')