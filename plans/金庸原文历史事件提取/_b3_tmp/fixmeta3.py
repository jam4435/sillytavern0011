# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
p='../批次B/B3-天龙第31-40回.md'
t=io.open(p,encoding='utf-8').read()
t=t.replace('（见 EV-天龙-1204 虚竹孤儿出身、EV-天龙-1208 段正淳风流之名，二者的待核栏均已注明揭密不在本段）',
            '（见 EV-天龙-1204 虚竹孤儿出身、EV-天龙-1209 段正淳风流之名，二者的待核栏均已注明揭密不在本段）')
io.open(p,'w',encoding='utf-8').write(t)
print('EV-天龙-1209' in t)