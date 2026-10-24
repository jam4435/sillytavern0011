
# -*- coding: utf-8 -*-
import io, re
t = io.open('批次D/D2-神雕第21-40回.md', encoding='utf-8').read()
ids = re.findall(r'^### (EV-神雕-\d{4})', t, re.M)
print('cards', len(ids), 'unique', len(set(ids)))
print(ids[:3], ids[-3:])
# unresolved refs
bad = re.findall(r'EV-神雕-([^\s、，。）]+)', t)
unk = [b for b in bad if not re.match(r'^\d{4}$', b)]
print('unresolved', unk[:10])
# field completeness
blocks = re.findall(r'^### EV-神雕-\d{4}[^\n]*\n(.*?)(?=\n### |\n---)', t, re.S|re.M)
need = ['原文位置','原文摘录','发生时间','地点','涉及人物','关系变化','事件经过','前因','后果','线索性质','跨书引用','与现有条目差分','待核']
badcards = []
for i,b in enumerate(blocks):
    miss = [n for n in need if ('- '+n+':') not in b]
    if miss: badcards.append((ids[i], miss))
print('incomplete', badcards)
print('chars', len(t))
