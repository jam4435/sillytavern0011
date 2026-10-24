
# -*- coding: utf-8 -*-
import io, sys
L = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read().split('\n')
nums = [int(x) for x in open(sys.argv[1], encoding='utf-8').read().split()]
out = io.open(sys.argv[2], 'w', encoding='utf-8')
for n in nums:
    out.write('%d\t%s\n' % (n, L[n-1].strip()))
out.close()
print(len(nums))
