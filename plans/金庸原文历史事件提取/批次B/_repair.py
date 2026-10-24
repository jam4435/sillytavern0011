import re
p = '批次B/B4-天龙第41-50回.md'
t = open(p, encoding='utf-8').read()
CARD = re.compile(r'### (EV-天龙-(\d{4})) ([^\n]*)\n.*?(?=\n### |\n---)', re.S)

inv = {'1262': '1702', '1278': '1703', '1284': '1704', '1285': '1705', '1281': '1707', '1283': '1767'}
for b, d in inv.items():
    t = t.replace('B3 的 EV-天龙-' + b, 'EV-天龙-' + d)

cards = [(m.start(), m.end(), m.group(2), m.group(3)) for m in CARD.finditer(t)]
print('cards after invert', len(cards))
nums = [int(c[2]) for c in cards]
print('sequential?', nums == list(range(1701, 1701 + len(nums))), nums[0], nums[-1])

dupmap = {1702: '1262', 1703: '1278', 1704: '1284', 1705: '1285', 1707: '1281', 1767: '1283'}
found = [n for n in dupmap if int(n) in nums]
print('dups present', found)

for n, b in dupmap.items():
    t = t.replace('EV-天龙-%04d' % n, '@@B3:%s@@' % b)

cards = [(m.start(), m.end(), m.group(2), m.group(3)) for m in CARD.finditer(t)]
for s, e, n, title in reversed(cards):
    if n.startswith('@@'):
        t = t[:s] + t[e:]
        print('removed card', n, title[:28])

cards = [(m.start(), m.end(), m.group(2), m.group(3)) for m in CARD.finditer(t)]
mapping = {n: '%04d' % (1701 + i) for i, (s, e, n, _) in enumerate(cards)}
t = re.sub(r'EV-天龙-(\d{4})', lambda m: 'EV-天龙-' + mapping.get(m.group(1), m.group(1)), t)
t = re.sub(r'@@B3:(\d{4})@@', lambda m: 'B3 的 EV-天龙-' + m.group(1), t)
open(p, 'w', encoding='utf-8').write(t)
print('final cards', len(cards), 'last id 18%02d' % (len(cards) - 1))
