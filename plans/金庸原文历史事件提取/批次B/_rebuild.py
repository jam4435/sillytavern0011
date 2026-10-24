import re
p = '批次B/B4-天龙第41-50回.md'
t = open(p, encoding='utf-8').read()

BLOCK = re.compile(r'### ((?:B3 的 )?EV-天龙-(\d{4})) · ([^\n]*)\n((?:(?!\n### ).)*?)(?=\n### |\n## |\n---\n)', re.S)
ms = list(BLOCK.finditer(t))
print('blocks', len(ms))
kept, dropped = [], []
for m in ms:
    head, num, title, body = m.group(1), m.group(2), m.group(3), m.group(4)
    (dropped if head.startswith('B3 的') else kept).append((num, title, body))
print('kept', len(kept), 'dropped', len(dropped))
for n, ti, _ in dropped: print('  DROP', n, ti[:36])

old2new = {}
lines = []
for i, (num, title, body) in enumerate(kept):
    new = '%04d' % (1701 + i)
    old2new[num] = new
    lines.append('### EV-天龙-%s · %s\n%s' % (new, title, body))

# remap references inside bodies using placeholders
def remap(text):
    return re.sub(r'EV-天龙-(\d{4})', lambda m: '@@' + old2new.get(m.group(1), m.group(1)) + '@@', text)
body_all = '\n'.join(lines)
body_all = re.sub(r'(?<!\n### )EV-天龙-(\d{4})', lambda m: '@@' + old2new.get(m.group(1), m.group(1)) + '@@', body_all)
body_all = body_all.replace('@@@@', '@@')
body_all = re.sub(r'@@(\d{4})@@', lambda m: 'EV-天龙-' + m.group(1), body_all)

# reassemble: preamble + new card section + tail
pre_end = t.index('### ')
first_card_old = ms[0].start()
tail_start = ms[-1].end()
preamble = t[:first_card_old]
tail = t[tail_start:]
out = preamble + body_all + tail
open(p, 'w', encoding='utf-8').write(out)
print('written; cards', len(kept))
