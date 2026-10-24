
import json,collections,io
d=json.load(open('旧事线索扫描.json',encoding='utf-8'))
rows=[r for r in d if r['book']=='笑傲江湖' and 8870<=r['line']<=17686]
by=collections.defaultdict(list)
for r in rows: by[r['seq']].append(r)
out=io.open('_f2_hits.txt','w',encoding='utf-8')
for seq in sorted(by):
    out.write('### %d\n'%seq)
    for r in by[seq]:
        out.write('%d %s %s\n'%(r['line'], ''.join(r['markers'])[:14], r['text'][:44].replace('\n',' ')))
out.close()
print('ok',len(rows))
