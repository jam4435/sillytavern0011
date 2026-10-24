import re
p = '批次B/B4-天龙第41-50回.md'
t = open(p, encoding='utf-8').read()
add = open('批次B/_add6.md', encoding='utf-8').read()

CARD = re.compile(r'### EV-天龙-(\d{4}) · ([^\n]*)\n((?:(?!\n### |\n## ).)*?)(?=\n### |\n## |\Z)', re.S)

def parse(text, start_pos=0):
    out = []
    for m in CARD.finditer(text):
        body = m.group(3)
        loc = re.search(r'^- 原文位置: .*?｜行 (\d+)', body, re.M)
        out.append({'title': m.group(2).strip(), 'body': body.rstrip('\n'), 'line': int(loc.group(1)) if loc else 0})
    return out

cur = parse(t)
new = parse(add)
print('current', len(cur), 'new', len(new))
allc = cur + new
allc.sort(key=lambda c: (c['line'], c['title']))
print('total', len(allc), 'first line', allc[0]['line'], 'last', allc[-1]['line'])

# locate card region in t
first = CARD.search(t).start()
last_m = list(CARD.finditer(t))[-1]
tail = t[last_m.end():]

head = t[:first]
blocks = []
for i, c in enumerate(allc):
    blocks.append('### EV-天龙-%04d · %s\n%s' % (1701 + i, c['title'], c['body']))

out = head + '\n\n'.join(blocks) + '\n' + tail
open(p, 'w', encoding='utf-8').write(out)
print('written')
