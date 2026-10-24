import re, json
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
ms = list(re.finditer(r'### (EV-天龙-(\d{4})) · ([^\n]*)\n((?:(?!\n### |\n## ).)*?)(?=\n### |\n## |\Z)', t, re.S))
out = []
for m in ms:
    body = m.group(4)
    for fld in ['前因', '后果']:
        mm = re.search(r'^- ' + fld + r': (.+)$', body, re.M)
        if mm:
            out.append((m.group(2), m.group(3)[:26], fld, mm.group(1)[:90]))
json.dump(out, open('批次B/_edges.json','w'), ensure_ascii=False, indent=1)
print('edges', len(out))
for row in out[:40]:
    print(row[0], '|', row[2], '|', row[3])
