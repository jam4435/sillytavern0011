import re
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
t2 = t.replace('B3 的 ', '')
cards = [(m.group(1), m.group(2), m.group(0)[:60]) for m in re.finditer(r'### (EV-天龙-(\d{4}))[^\n]*\n.*?(?=\n### |\n---)', t2, re.S)]
print('cards', len(cards))
refs = re.findall(r'(EV-天龙-\d{4})(?:（([^）]{0,30})）)?', t2)
nohint = [r for r in refs if not r[1]]
print('refs', len(refs), 'no-hint', len(nohint))
print('sample no-hint', nohint[:8])
