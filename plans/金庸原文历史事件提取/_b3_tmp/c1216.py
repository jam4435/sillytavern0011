# -*- coding: utf-8 -*-
import io, sys
sys.stdout.reconfigure(encoding='utf-8')
L=io.open('../原文UTF8/天龙八部.txt',encoding='utf-8').read().split('\n')
print('14763 has seg1:', '我们三人掘进墓圹，打开棺材，崔兄，你道见到什么？' in L[14762])
print('14767 has seg2:', '棺材里是空的，没有死人。' in L[14766])