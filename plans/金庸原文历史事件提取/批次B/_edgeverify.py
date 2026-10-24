import re
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
ms = list(re.finditer(r'### (EV-天龙-(\d{4})) · ([^\n]*)\n((?:(?!\n### |\n## ).)*?)(?=\n### |\n## |\Z)', t, re.S))
T = {m.group(2): m.group(3) for m in ms}
bad = 0
for m in ms:
    body = m.group(4)
    for fld in ['前因','后果']:
        mm = re.search(r'^- ' + fld + r': (.+)$', body, re.M)
        if not mm: continue
        for eid in re.findall(r'EV-天龙-(\d{4})', mm.group(1)):
            if eid not in T:
                print('DANGLING', m.group(2), fld, eid); bad += 1
            elif eid == m.group(2):
                print('SELF', m.group(2), fld); bad += 1
print('problems', bad)
print()
for m in ms[:8]:
    body = m.group(4)
    pre = re.search(r'^- 前因: (.+)$', body, re.M).group(1)
    con = re.search(r'^- 后果: (.+)$', body, re.M).group(1)
    def dec(s):
        return re.sub(r'EV-天龙-(\d{4})', lambda x: '%s「%s」' % (x.group(1), T[x.group(1)][:10]), s)
    print(m.group(2), T[m.group(2)][:22])
    print('   前:', dec(pre)[:95])
    print('   后:', dec(con)[:95])
