# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
lines = io.open('../原文UTF8/天龙八部.txt', encoding='utf-8').read().split('\n')
idx={}
for ln in io.open('../章节索引.tsv', encoding='utf-8'):
    p=ln.rstrip('\n').split('|')
    if p[0]=='天龙八部':
        a,b=p[4].split('-'); idx[int(p[1])]=(int(a),int(b),p[3])
def ch(n):
    for k in sorted(idx):
        a,b,t=idx[k]
        if a<=n<=b: return k
def w(s):
    return [i+1 for i,l in enumerate(lines) if s in l]
for s in ['我是你的儿子','你的儿子','亲生儿子','虚竹的母亲','虚竹的爹爹','梦中女郎']:
    h=w(s); print(s, len(h), [(x,ch(x)) for x in h[:6]])
print('--- 玄慈 自认 ---')
for s in ['老衲虚竹','以虚竹为子','虚竹……虚竹','我是虚竹']:
    h=w(s); print(s, len(h), [(x,ch(x)) for x in h[:4]])