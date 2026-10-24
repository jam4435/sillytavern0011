# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
lines = io.open('../原分UTF8/天龙八部.txt'.replace('分',''), encoding='utf-8').read().split('\n')
import re
def w(n):
    return [(i+1) for i,l in enumerate(lines) if n in l]
# chapter index
idx={}
for ln in io.open('../章节索引.tsv', encoding='utf-8'):
    p=ln.rstrip('\n').split('|')
    if p[0]=='天龙八部': idx[int(p[1])]=(int(p[4]),int(p[5]))
def ch(lineno):
    for k,(a,b) in idx.items():
        if a<=lineno<=b: return k
    return None
for n in ['刀白凤','招亲','叶二娘','西夏公主','镇南王','曼陀山庄','菱湖']:
    h=w(n)
    print(n, len(h), [(x,ch(x)) for x in h[:6]])
