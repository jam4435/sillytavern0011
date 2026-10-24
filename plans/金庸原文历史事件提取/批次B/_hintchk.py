import re
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
heads = dict((m.group(1), m.group(2)) for m in re.finditer(r'### (EV-天龙-\d{4}) · ([^\n]*)', t))
print('== all refs with hints ==')
for m in re.finditer(r'(EV-天龙-\d{4})（([^）]{2,40})）', t):
    eid, hint = m.group(1), m.group(2)
    title = heads.get(eid)
    if title is None:
        print('  [B3/A1]', eid, '<-', hint[:34])
        continue
    ok = any(ch in title for ch in hint[:6])
    print(('  OK  ' if ok else '  ??  '), eid, '|', title[:30], '<-', hint[:30])
