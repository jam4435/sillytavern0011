# -*- coding: utf-8 -*-
import io, re

exec(open('批次E/_lib.py', encoding='utf-8').read())
for f in ['a','b','c','d','e']:
    exec(open('批次E/_cards_%s.py' % f, encoding='utf-8').read())

CN = {'第一回':1,'第二回':2,'第三回':3,'第四回':4,'第五回':5,'第六回':6,'第七回':7,'第八回':8,'第九回':9,
      '第十回':10,'第十一回':11,'第十二回':12,'第十三回':13,'第十四回':14,'第十五回':15,'第十六回':16,
      '第十七回':17,'第十八回':18,'第十九回':19,'第二十回':20}

CARDS.sort(key=lambda c: (CN[c['ch']], c['ls']))

# assign new ids
mapping = {}
for i, c in enumerate(CARDS, start=1):
    mapping[c['id']] = '%04d' % i
    c['newid'] = '%04d' % i

def repl(s):
    return re.sub(r'EV-倚天-(X\d\d|\d{4})', lambda m: 'EV-倚天-' + mapping.get(m.group(1), m.group(1)), s)

for c in CARDS:
    for k in ['story','cause','effect','diff','todo','cast','rel','loc','time','nature','cross','name']:
        if k in c:
            c[k] = repl(c[k])

def render(c):
    ex = '“' + '……'.join(c['ex']) + '”'
    L = ['### EV-倚天-%s · %s' % (c['newid'], c['name']),
         '- 原文位置: 《倚天屠龙记》%s %s｜行 %d-%d（命中行 %d）' % (c['ch'], c['title'], c['ls'], c['le'], c['hit']),
         '- 原文摘录: ' + ex,
         '- 发生时间: ' + c['time'],
         '- 地点: ' + c['loc'],
         '- 涉及人物: ' + c['cast'],
         '- 关系变化: ' + c['rel'],
         '- 事件经过: ' + c['story'],
         '- 前因: ' + c['cause'],
         '- 后果: ' + c['effect'],
         '- 线索性质: ' + c['nature'],
         '- 跨书引用: ' + c['cross'],
         '- 与现有条目差分: ' + c['diff'],
         '- 待核: ' + c['todo']]
    return '\n'.join(L)

body = '\n\n'.join(render(c) for c in CARDS)
io.open('批次E/_body.md','w',encoding='utf-8').write(body)

nov = io.open('原文UTF8/倚天屠龙记.txt', encoding='utf-8').read()
nov2 = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read()
bad = 0
for c in CARDS:
    for p in c['ex']:
        if p not in nov and p not in nov2:
            print('EX-MISS', c['newid'], p[:50]); bad += 1
    if len(''.join(c['ex'])) > 118:
        print('TOO-LONG', c['newid'], len(''.join(c['ex'])))
# chapter stats
from collections import Counter
cnt = Counter(c['ch'] for c in CARDS)
for k in sorted(cnt, key=lambda x: CN[x]):
    print(k, cnt[k])
print('cards', len(CARDS), 'miss', bad)
print('range', CARDS[0]['newid'], CARDS[-1]['newid'])
