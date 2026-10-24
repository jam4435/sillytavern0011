
import json,io
d=json.load(open('现有条目索引.json',encoding='utf-8'))
print(type(d), len(d))
if isinstance(d,dict):
    k=list(d)[:3]; print(k); print(json.dumps(d[k[0]],ensure_ascii=False)[:600])
else:
    print(json.dumps(d[0],ensure_ascii=False)[:600])
