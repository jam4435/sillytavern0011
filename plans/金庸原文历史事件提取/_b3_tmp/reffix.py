# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
fixes=[
 ('- 后果: EV-天龙-15483（万仙大会歃血反叛）、乌老大上峰擒「哑巴女童」即童姥（EV-天龙-1231）',
  '- 后果: EV-天龙-1231（万仙大会歃血反叛）、乌老大上峰擒「哑巴女童」即童姥（EV-天龙-1232）'),
 ('- 后果: EV-天龙-1900（慕容龙城）、EV-天龙-1285（王语嫣之母的反对）',
  '- 后果: EV-天龙-1285（慕容龙城）、EV-天龙-1216（慕容氏复国心术见于空棺之谜）'),
]
n=0
for a,b in fixes:
    if a in t: t=t.replace(a,b); n+=1
    else: print('NF', a[:40])
io.open('_final.md','w',encoding='utf-8').write(t)
print('fixed',n)