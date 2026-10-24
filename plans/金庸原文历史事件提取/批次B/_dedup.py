import re
p = '批次B/B4-天龙第41-50回.md'
t = open(p, encoding='utf-8').read()

# cards already fully covered by B3 (chapter 40 section, EV-1262..1285)
dups = {'1702': '1262', '1703': '1278', '1704': '1284', '1705': '1285', '1707': '1281', '1767': '1283'}

# split into blocks by card header
pat = re.compile(r'### (EV-天龙-(\d{4}))[^\n]*\n.*?(?=\n### |\n---)', re.S)
blocks = [(m.start(), m.end(), m.group(2)) for m in pat.finditer(t)]
# delete from the end
for s, e, num in reversed(blocks):
    if num in dups:
        t = t[:s] + t[e:]
        print('removed', num)

# renumber remaining cards consecutively from 1701
nums = [m.group(2) for m in pat.finditer(t)]
mapping = {}
for i, n in enumerate(nums):
    mapping[n] = '%04d' % (1701 + i)
# also map deleted ids to B3 ids (as plain text, handled after)
t = re.sub(r'EV-天龙-(\d{4})', lambda m: 'EV-天龙-' + mapping.get(m.group(1), m.group(1)), t)
# fix dangling refs to deleted ids -> B3
for d, b in dups.items():
    t = t.replace('EV-天龙-' + d, 'B3 的 EV-天龙-' + b)
open(p, 'w', encoding='utf-8').write(t)
print('remaining', len(nums))
