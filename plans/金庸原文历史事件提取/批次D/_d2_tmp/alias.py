
# -*- coding: utf-8 -*-
import io, os, re, json
D='批次D/_d2_tmp/cards'
files = sorted([f for f in os.listdir(D) if re.match(r'^\d{3}_', f)])
alias = {}
for f in files:
    num = int(f[:3]); key = f.split('_',1)[1][:-3]
    body = io.open(os.path.join(D,f), encoding='utf-8').read().strip()
    title = body.split('\n')[0].lstrip('· ').strip()
    alias[key] = title
    alias[title] = title
json.dump(alias, io.open('批次D/_d2_tmp/alias.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(alias))
