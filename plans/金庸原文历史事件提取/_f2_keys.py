
import json,io,re
d=json.load(open('现有条目索引.json',encoding='utf-8'))
cn='一二三四五六七八九十'
def num(x):
    # convert 二十一 style
    if x.startswith('十'): return 10+ (cn.index(x[1])+1 if len(x)>1 else 0)
    if len(x)==1: return cn.index(x)+1
    if x[1]=='十':
        base=(cn.index(x[0])+1)*10
        if len(x)==2: return base
        return base+cn.index(x[2])+1
    return None
out=io.open('_f2_keys.txt','w',encoding='utf-8')
for ch in range(21,41):
    # build string
    s=None
    for e in d:
        k=e['key']
        m=re.search(r'笑傲(第[一二三四五六七八九十]+回)',k)
        if m:
            n=num(m.group(1)[1:-1])
            if n==ch:
                out.write('%s\n'%k)
    out.write('---\n')
out.close()
print('ok')
