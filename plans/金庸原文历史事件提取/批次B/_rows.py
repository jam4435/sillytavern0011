import re, json
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
ms = list(re.finditer(r'### (EV-天龙-(\d{4})) · ([^\n]*)\n((?:(?!\n### |\n## ).)*?)(?=\n### |\n## |\Z)', t, re.S))
print('cards', len(ms))
rows = []
for m in ms:
    body = m.group(4)
    pre = re.search(r'^- 前因: (.+)$', body, re.M)
    con = re.search(r'^- 后果: (.+)$', body, re.M)
    rows.append([m.group(2), m.group(3), pre.group(1) if pre else '', con.group(1) if con else ''])
json.dump(rows, open('批次B/_rows.json','w'), ensure_ascii=False, indent=1)
for r in rows[:60]:
    print(r[0], r[1][:26])
    print('   前:', r[2][:76])
    print('   后:', r[3][:76])
