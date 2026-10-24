# -*- coding: utf-8 -*-
import sys, re, collections
sys.stdout.reconfigure(encoding='utf-8')
p = '批次D/D1-神雕第1-20回.md'
t = open(p, encoding='utf-8').read()
m = re.search(r'### (EV-[^\s\u00b7]+) . 0208.*?(?=\n### )', t, re.S)
print('=== CARD 0208 ===')
print(m.group(0)[:500] if m else 'NOT FOUND')
cards = re.findall(r'### (EV-[^\s\u00b7]+) [^\n]*\n(.*?)(?=\n### |\n---)', t, re.S)
print('cards', len(cards))
ch = collections.Counter(); diff = collections.Counter()
cn = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,
      '十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,'十八':18,'十九':19,'二十':20}
for eid, body in cards:
    mm = re.search(r'原文位置: 《神雕侠侣》第([一二三四五六七八九十]+)回', body)
    ch[cn.get(mm.group(1), 0) if mm else 0] += 1
    d = re.search(r'与现有条目差分: (.+)', body)
    k = d.group(1) if d else '?'
    if k.startswith('完全缺失'): diff['完全缺失'] += 1
    elif k.startswith('只有回忆'): diff['只有回忆或揭密场景'] += 1
    elif k.startswith('只有最终结果'): diff['只有最终结果缺前因与中间过程'] += 1
    elif k.startswith('部分已有'): diff['部分已有'] += 1
    elif k.startswith('已完整'): diff['已完整记录'] += 1
    elif k.startswith('证据不足'): diff['证据不足暂不能确定'] += 1
    else: diff[k[:20]] += 1
print('BY CHAPTER', dict(sorted(ch.items())))
print('BY DIFF', dict(diff))
