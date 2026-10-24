# -*- coding: utf-8 -*-
import io
lines = io.open('../原文UTF8/天龙八部.txt', encoding='utf-8').read().split('\n')
a,b=13649,17436
for n in ['雁门关','带头大哥','叶二娘','刀白凤','契丹','萧远山','中原群雄','玄苦','玄悲','灵门']:
    hits=[i for i in range(a,b) if n in lines[i-1]]
    print('###',n,len(hits),hits[:20])
