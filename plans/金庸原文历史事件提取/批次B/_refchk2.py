import re
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
heads = dict((m.group(1), m.group(2)) for m in re.finditer(r'### (EV-天龙-\d{4}) · ([^\n]*)', t))
for k in ['EV-天龙-1703','EV-天龙-1706','EV-天龙-1707','EV-天龙-1708','EV-天龙-1709','EV-天龙-1714','EV-天龙-1771','EV-天龙-1779','EV-天龙-1741','EV-天龙-1759','EV-天龙-1795']:
    print(k, heads.get(k, 'MISSING'))
print('--- checks ---')
refs = set(re.findall(r'EV-天龙-\d{4}', t))
b3 = set(re.findall(r'### (EV-天龙-\d{4})', open('批次B/B3-天龙第31-40回.md', encoding='utf-8').read()))
print('dangling:', sorted(refs - set(heads) - b3))
