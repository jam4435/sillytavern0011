
# -*- coding: utf-8 -*-
import os, io, re, json
D = '批次D/_d2_tmp/cards'
files = sorted([f for f in os.listdir(D) if re.match(r'^\d{3}_', f)])
# chapter ranges
chap = []
for row in io.open('章节索引.tsv', encoding='utf-8'):
    f = row.rstrip('\n').split('|')
    if f[0] == '神雕侠侣':
        a, b = f[4].split('-')
        chap.append((int(f[1]), f[3], int(a), int(b)))
def chapof(i):
    for s,t,a,b in chap:
        if a <= i <= b: return (s,t)
    return (0,'')
# read all
cards = []
for f in files:
    num = int(f[:3])
    body = io.open(os.path.join(D,f), encoding='utf-8').read().strip()
    lines = body.split('\n')
    title = lines[0].lstrip('· ').strip()
    fields = lines[1:]
    cards.append({'num':num,'file':f,'title':title,'fields':fields,'body':body})
# build id map by nearest anchor : use title as key (unique enough)
title2id = {}
for c in cards:
    title2id[c['title']] = 'EV-神雕-%04d' % (600 + c['num'] - 1)
# assign IDs
for c in cards:
    c['id'] = title2id[c['title']]
# chapter of each card from 原文位置 line
def cardchap(c):
    for ln in c['fields']:
        if ln.startswith('- 原文位置: '):
            m = re.search(r'第([一二三四五六七八九十百]+)回', ln)
            if m: return m.group(0)
    return ''
for c in cards:
    c['chap'] = cardchap(c)
# resolve refs
def resolve(text):
    def rep(m):
        k = m.group(1).strip()
        if k in title2id: return title2id[k]
        return 'EV-神雕-待核(%s)' % k
    return re.sub(r'\[\[([^\]]+)\]\]', rep, text)
for c in cards:
    c['fields'] = [resolve(x) for x in c['fields']]
print(len(cards))
# write body
out = io.open('批次D/_d2_tmp/body.md','w',encoding='utf-8')
curch = None
for c in cards:
    if c['chap'] and c['chap'] != curch:
        curch = c['chap']
    out.write('### %s · %s\n' % (c['id'], c['title']))
    out.write('\n'.join(c['fields']))
    out.write('\n\n')
out.close()
# stats
cnt = {}
for c in cards:
    cnt[c['chap']] = cnt.get(c['chap'],0)+1
io.open('批次D/_d2_tmp/stats.json','w',encoding='utf-8').write(json.dumps({'count':len(cards),'bychap':cnt}, ensure_ascii=False, indent=1))
print(json.dumps(cnt, ensure_ascii=False))
