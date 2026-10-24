# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
lines = io.open('../原文UTF8/天龙八部.txt', encoding='utf-8').read().split('\n')
def where(n, lo=1, hi=22333):
    return [i+1 for i in range(lo,hi) if n in lines[i-1]]
for n in ['叶二娘','虚竹','玄慈','刀白凤','雁门关']:
    h=where(n, 17436, 19000)
    print(n, len(h), h[:12])
print('--- 叶二娘 认子 关键词 ---')
for n in ['我儿','孩子','娃娃','虚竹','儿子','亲生']:
    h=where(n, 18000, 19000)
    print(n, len(h), h[:15])
