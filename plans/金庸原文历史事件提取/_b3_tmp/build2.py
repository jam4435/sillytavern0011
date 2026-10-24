# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
def rd(p): return io.open(p,encoding='utf-8').read()
def norm(s): return s if s.endswith('\n') else s+'\n'
p1=norm(rd('p1.md')); p2=norm(rd('p2.md')); p3=norm(rd('p3.md'))
p4a=norm(rd('p4a.md')); p4b=norm(rd('p4b.md')); p4c=norm(rd('p4c.md')); p5=norm(rd('p5.md'))
mark='### EV-天龙-1265'
i=p5.index(mark); p5_head=p5[:i]; p5_body=p5[i:]
ch39='## 九、第39回 · 灵鹫宫石室与童姥旧规（行 17001–17435）\n\n'
out = p1 + p2 + p3 + p4a + ch39 + p4b + '\n---\n\n' + p5_head + p4c + '\n' + p5_body
out = out.replace('\n# B 部 · 第40回', '\n## B 部 · 第40回')
io.open('_final.md','w',encoding='utf-8').write(out)
ids=re.findall(r'^### (EV-天龙-\d+)', out, re.M)
print('cards',len(ids))
order=[]
[order.append(x) for x in ids if x not in order]
mapping={o:'EV-天龙-%04d'%(1201+k) for k,o in enumerate(order)}
for k,(o,n) in enumerate(mapping.items()): out=out.replace(o,'\x00%d\x00'%k)
for k,(o,n) in enumerate(mapping.items()): out=out.replace('\x00%d\x00'%k,n)
io.open('_final.md','w',encoding='utf-8').write(out)
for i,l in enumerate(out.split('\n'),1):
    if l.startswith('# ') or l.startswith('## '): print(i,'|',l[:60])