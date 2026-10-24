# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
L=io.open('../原文UTF8/笑傲江湖.txt',encoding='utf-8').read().split('\n')
for i,l in enumerate(L,1):
    if '逍遥派' in l or '北冥神功' in l: print(i, l[:200])