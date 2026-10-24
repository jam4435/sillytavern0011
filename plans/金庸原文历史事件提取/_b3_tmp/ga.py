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
for s in ['刀白凤','延庆太子','那段延庆','孽种','你的亲生父亲','王夫人','舅母','姑母','曼陀山庄','王语嫣的母亲']:
    h=w(s)
    print(repr(s), len(h), sorted(set(ch(x) for x in h)), h[:4])