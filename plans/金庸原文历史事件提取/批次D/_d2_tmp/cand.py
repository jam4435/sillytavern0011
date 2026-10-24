
# -*- coding: utf-8 -*-
import io, sys
LINES = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read().split('\n')
MARK = ['当年','那时','从前','往日','昔年','数年前','十余年前','二十年前','三十年前','多年前','自幼','幼时','少年时','年轻时','小时候','先师','祖师','师父说','曾听','听说','原来','后来','当时','昔日','旧事','往事','身世','来历','真相','秘密','临终','遗言','遗训','上代','前辈','数十年前','百年前']
def cand(a, b, trunc=90):
    out = []
    for i in range(a, b+1):
        t = LINES[i-1].strip()
        if not t: continue
        hits = [m for m in MARK if m in t]
        if hits:
            pos = min(t.find(m) for m in hits)
            st = max(0, pos-20)
            out.append('%d|%s' % (i, t[st:st+trunc]))
    return out
if __name__ == '__main__':
    import sys
    a, b = int(sys.argv[1]), int(sys.argv[2])
    fn = sys.argv[3]
    trunc = int(sys.argv[4]) if len(sys.argv) > 4 else 90
    io.open(fn,'w',encoding='utf-8').write('\n'.join(cand(a,b,trunc)))
    print('wrote', fn)
