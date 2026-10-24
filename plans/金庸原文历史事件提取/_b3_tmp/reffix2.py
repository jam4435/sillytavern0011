# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
t=t.replace('- 后果: EV-天龙-15483（万仙大会歃血反叛）、乌老大上峰擒「哑巴女童」即童姥（EV-天龙-1230）',
            '- 后果: EV-天龙-1231（万仙大会歃血反叛）、EV-天龙-1230（上峰擒「哑巴女童」即童姥）')
t=t.replace('- 后果: EV-天龙-1285（慕容龙城）、EV-天龙-1286（王语嫣之母的反对）',
            '- 后果: EV-天龙-1285（慕容龙城创斗转星移）、EV-天龙-1210（慕容氏复国心术的实践：空棺之谜）')
io.open('_final.md','w',encoding='utf-8').write(t)
print('ok')