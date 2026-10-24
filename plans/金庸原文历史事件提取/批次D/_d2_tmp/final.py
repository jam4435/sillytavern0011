
# -*- coding: utf-8 -*-
import os, io, re, json
D='批次D/_d2_tmp/cards'
files = sorted([f for f in os.listdir(D) if re.match(r'^\d{3}_', f)])
chap = []
for row in io.open('章节索引.tsv', encoding='utf-8'):
    f = row.rstrip('\n').split('|')
    if f[0]=='神雕侠侣':
        a,b = f[4].split('-')
        chap.append((int(f[1]), f[3], int(a), int(b)))
def resolve(text, t2i):
    return re.sub(r'\[\[([^\]]+)\]\]', lambda m: t2i.get(m.group(1).strip(), 'EV-神雕-' + m.group(1).strip()), text)
cards = []
for f in files:
    num = int(f[:3])
    body = io.open(os.path.join(D,f), encoding='utf-8').read().strip()
    lines = body.split('\n')
    title = lines[0].lstrip('· ').strip()
    fields = lines[1:]
    pos = next((l for l in fields if l.startswith('- 原文位置: ')), '')
    m = re.search(r'第([一二三四五六七八九十]+)回', pos)
    cards.append({'num':num,'title':title,'fields':fields,'chap':m.group(1) if m else '?','pos':pos})
t2i = {c['title']: 'EV-神雕-%04d' % (600 + c['num'] - 1) for c in cards}
out = io.open('批次D/_d2_tmp/main.md','w',encoding='utf-8')
cur = None
order = ['二十一','二十二','二十三','二十四','二十五','二十六','二十七','二十八','二十九','三十','三十一','三十二','三十三','三十四','三十五','三十六','三十七','三十八','三十九','四十']
for cn in order:
    grp = [c for c in cards if c['chap']==cn]
    if not grp: continue
    info = next((x for x in chap if str(x[0])==str(order.index(cn)+21)), None)
    out.write('\n---\n\n## 第%s回 %s（行 %d-%d）· 本回 %d 条\n\n' % (cn, info[1] if info else '', info[2] if info else 0, info[3] if info else 0, len(grp)))
    for c in grp:
        out.write('### %s · %s\n' % (t2i[c['title']], c['title']))
        out.write('\n'.join(resolve(x, t2i) for x in c['fields']))
        out.write('\n\n')
out.close()
print('ok', len(cards))
