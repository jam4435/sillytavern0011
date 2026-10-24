# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
p='../批次B/B3-天龙第31-40回.md'
t=io.open(p,encoding='utf-8').read()
a='**「已完整记录」的 3 条已在本文件正文中标出，建议调度层复核后撤销或降级**：'
b='**「已完整记录」的 3 条（行 309 / 642 / 783）已在本文件正文中标出，建议调度层复核后撤销或降级**：'
assert a in t
t=t.replace(a,b)
io.open(p,'w',encoding='utf-8').write(t)
print('ok')