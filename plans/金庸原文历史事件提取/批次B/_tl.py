import re
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
ms = list(re.finditer(r'### (EV-天龙-(\d{4})) · ([^\n]*)\n', t))
for m in ms:
    print(m.group(2), '|', m.group(3))
