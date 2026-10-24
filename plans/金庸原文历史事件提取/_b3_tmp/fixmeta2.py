# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
p='../批次B/B3-天龙第31-40回.md'
t=io.open(p,encoding='utf-8').read()
t=t.replace('- 编号段：EV-天龙-1201 ~ 1699（本文件实际使用 1201 起，连续无跳号）',
            '- 编号段：EV-天龙-1201 ~ 1699（本文件实际使用 1201–1285，共 85 张，连续无跳号）')
t=t.replace('→ 本文件**不为这两项建卡**，只建「本段确实写到」的旁证（见 1239、1250 附近待核栏）。',
            '→ 本文件**不为这两项建卡**，只建「本段确实写到」的旁证（见 EV-天龙-1204 虚竹孤儿出身、EV-天龙-1208 段正淳风流之名，二者的待核栏均已注明揭密不在本段）。')
io.open(p,'w',encoding='utf-8').write(t)
print('ok')
# verify those ids point at expected cards
for m in re.finditer(r'^### (EV-天龙-1204|EV-天龙-1208) · (.+)$', t, re.M): print(m.group(1), m.group(2))