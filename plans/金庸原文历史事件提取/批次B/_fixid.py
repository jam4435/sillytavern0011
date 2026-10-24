p = '批次B/B4-天龙第41-50回.md'
t = open(p, encoding='utf-8').read()
n = t.count('EV-天龙-9003') + t.count('EV-天龙-9004')
t = t.replace('EV-天龙-9003', 'EV-天龙-1704').replace('EV-天龙-9004', 'EV-天龙-1714')
open(p, 'w', encoding='utf-8').write(t)
print('replaced', n)
