# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
f=io.open('foot.md',encoding='utf-8').read()
if not t.endswith('\n'): t+='\n'
out=t+'\n'+f
io.open('../批次B/B3-天龙第31-40回.md','w',encoding='utf-8').write(out)
print('written',len(out))