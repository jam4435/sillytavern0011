# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
lines = io.open('../原文UTF8/天龙八部.txt', encoding='utf-8').read().split('\n')
idx={}
for ln in io.open('../章节索引.tsv', encoding='utf-8'):
    p=ln.rstrip('\n').split('|')
    if p[0]=='天龙八部': idx[int(p[1])]=(int(p[4]),int(p[5]),p[3])
def ch(n):
    for k in sorted(idx):
        a,b,t=idx[k]
        if a<=n<=b: return 'ch%d %s'%(k,t)
    return '?'
def w(s):
    return [i+1 for i,l in enumerate(lines) if s in l]
for s in ['刀白凤','招亲','叶二娘','镇南王','曼陀山庄','虚竹的亲生','西夏公主']:
    h=w(s)
    print(s, len(h), [(x, ch(x)) for x in h[:5]])
print('--- chapter 41-48 边界 ---')
for k in range(40,49):
    print(k, idx[k])