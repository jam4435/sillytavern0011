
# -*- coding: utf-8 -*-
import io, sys, re
LINES = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read().split('\n')
args = sys.argv[1:]
mode = args[0]
if mode == 'cand':
    a, b = int(args[1]), int(args[2]); trunc = int(args[3]) if len(args) > 3 else 80
    MARK = ['当年','那时','从前','往日','昔年','数年前','十余年前','二十年前','三十年前','多年前','自幼','幼时','少年时','年轻时','小时候','先师','祖师','师父说','曾听','听说','原来','本来','后来','当时','昔日','旧事','往事','身世','来历','真相','秘密','揭密','临终','遗言','遗训','上代','前辈']
    for i in range(a, b+1):
        t = LINES[i-1].strip()
        if not t: continue
        if any(m in t for m in MARK):
            s = t
            # find first marker pos
            pos = min([s.find(m) for m in MARK if m in s])
            st = max(0, pos-25)
            frag = s[st:st+trunc]
            print('%d|%s' % (i, frag))
elif mode == 'show':
    for x in args[1:]:
        i = int(x)
        print('%d|%s' % (i, LINES[i-1].strip()))
elif mode == 'range':
    a, b = int(args[1]), int(args[2])
    for i in range(a, b+1):
        print('%d|%s' % (i, LINES[i-1].strip()))
