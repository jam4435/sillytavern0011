# -*- coding: utf-8 -*-
import io
d=''
def rd(p):
    return io.open(p, encoding='utf-8').read()
p1=rd('p1.md'); p2=rd('p2.md'); p3=rd('p3.md')
p4a=rd('p4a.md'); p4b=rd('p4b.md'); p4c=rd('p4c.md'); p5=rd('p5.md')
# split p5 at first card
mark='### EV-天龙-1265'
i=p5.index(mark)
p5_head=p5[:i]
p5_body=p5[i:]
ch39='## 九、第39回 · 灵鹫宫石室与童姥旧规（行 17001–17435）\n\n'
out = p1 + p2 + p3 + p4a + ch39 + p4b + '\n---\n\n' + p5_head + p4c + '\n' + p5_body
io.open('_whole.md','w',encoding='utf-8').write(out)
print('len',len(out))
import re
print('cards',len(re.findall(r'^### EV-', out, re.M)))
ids=re.findall(r'^### (EV-天龙-\d+)', out, re.M)
print('dup', [x for x in set(ids) if ids.count(x)>1])
print(ids)