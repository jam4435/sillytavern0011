
import json,collections
d=json.load(open('旧事线索扫描.json',encoding='utf-8'))
rows=[r for r in d if r['book']=='笑傲江湖' and 8870<=r['line']<=17686]
print('total hits',len(rows))
c=collections.Counter(r['seq'] for r in rows)
ch=[l.strip().split('|') for l in open('章节索引.tsv',encoding='utf-8') if l.startswith('笑傲江湖')]
for x in ch:
    s=int(x[1])
    if 21<=s<=40:
        print(s, x[3], x[4], x[5], 'hits=',c.get(s,0))
