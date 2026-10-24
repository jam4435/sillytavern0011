
# -*- coding: utf-8 -*-
import io, re
NOV = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read().split('\n')
md = io.open('批次D/_test_body.md', encoding='utf-8').read()
m = re.search(r"### EV-神雕-0609[^\n]*\n(.*?)(?=\n### )", md, re.S)
q = re.search(r"原文摘录: “(.+)”", m.group(1)).group(1)
print('MINE:', q)
print('ORD :', [hex(ord(c)) for c in q[-8:]])
orig = NOV[7741]
i = orig.find('他在嘉兴府')
print('ORIG:', orig[i:i+70])
print('ORD2:', [hex(ord(c)) for c in orig[i:i+70][-8:]])
# find divergence
for k in range(len(q)):
    if q[k] != orig[i+k]:
        print('DIVERGE at', k, repr(q[k]), hex(ord(q[k])), 'vs', repr(orig[i+k]), hex(ord(orig[i+k])))
        break
