import re, json
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
ms = list(re.finditer(r'### (EV-天龙-(\d{4})) · ([^\n]*)\n((?:(?!\n### |\n## ).)*?)(?=\n### |\n## |\Z)', t, re.S))
print('cards', len(ms))
for m in ms[:3] + ms[30:32]:
    body = m.group(4)
    pre = re.search(r'^- 前因: (.+)$', body, re.M)
    con = re.search(r'^- 后果: (.+)$', body, re.M)
    print(m.group(2), m.group(3)[:22])
    print('   前因:', (pre.group(1)[:70] if pre else None))
    print('   后果:', (con.group(1)[:70] if con else None))
