import re, json
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
ms = list(re.finditer(r'### (EV-天龙-(\d{4})) · ([^\n]*)\n((?:(?!\n### |\n## ).)*?)(?=\n### |\n## |\Z)', t, re.S))
title = {m.group(2): m.group(3) for m in ms}
json.dump(title, open('批次B/_titles.json','w'), ensure_ascii=False, indent=1)
for k in sorted(title):
    print(k, title[k])
