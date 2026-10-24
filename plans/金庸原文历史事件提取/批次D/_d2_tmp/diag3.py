
# -*- coding: utf-8 -*-
import io, re
NOV = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read().split('\n')
md = io.open('批次D/_test_body.md', encoding='utf-8').read()
ids = ['0609','0611','0619','0627','0629','0631','0636','0643','0653','0654','0657','0661','0670','0673','0677','0685','0686','0709','0721']
out = io.open('批次D/_d2_tmp/fail.txt','w',encoding='utf-8')
for eid in ids:
    m = re.search(r"### EV-神雕-"+eid+r"[^\n]*\n(.*?)(?=\n### )", md, re.S)
    body = m.group(1)
    q = re.search(r"原文摘录: (.+)", body).group(1)
    pos = re.search(r"原文位置: (.+)", body).group(1)
    out.write('=== %s  %s\nMINE: %s\n' % (eid, pos, q))
    nums = [int(x) for x in re.findall(r'\d{4,5}', pos)]
    for n in nums[:3]:
        out.write('  L%d: %s\n' % (n, NOV[n-1][:300]))
out.close()
print('ok')
