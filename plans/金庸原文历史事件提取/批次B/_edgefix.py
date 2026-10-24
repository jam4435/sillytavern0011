import re
p = '批次B/B4-天龙第41-50回.md'
t = open(p, encoding='utf-8').read()
ms = list(re.finditer(r'### (EV-天龙-(\d{4})) · ([^\n]*)\n((?:(?!\n### |\n## ).)*?)(?=\n### |\n## |\Z)', t, re.S))
T = {m.group(2): m.group(3) for m in ms}

def bg(s):
    s = re.sub(r'[^\u4e00-\u9fff]', '', s)
    return set(s[i:i+2] for i in range(len(s)-1))

def verified(eid, hint):
    if eid not in T:
        return False
    sc = len(bg(hint) & bg(T[eid]))
    if sc < 2:
        return False
    others = [n for n in T if n != eid and len(bg(hint) & bg(T[n])) >= sc]
    return not others

stats = {'keep': 0, 'prose': 0, 'bare': 0}

def fix_line(fld, val):
    out = []
    pos = 0
    for m in re.finditer(r'(EV-天龙-(\d{4}))(?:（([^）]{2,40})）)?', val):
        out.append(val[pos:m.start()])
        eid, hint = m.group(1), m.group(3) or ''
        if hint and verified(eid, hint):
            out.append(eid + '（' + hint + '）'); stats['keep'] += 1
        elif hint:
            out.append(hint); stats['prose'] += 1
        elif eid in T:
            out.append(eid); stats['bare'] += 1
        else:
            out.append(hint if hint else eid); stats['prose'] += 1
        pos = m.end()
    out.append(val[pos:])
    s = ''.join(out)
    s = re.sub(r'[、，]\s*[、，]', '、', s).strip('、， ')
    return '- %s: %s' % (fld, s if s else '原文未明')

lines = t.split('\n')
for i, ln in enumerate(lines):
    m = re.match(r'^- (前因|后果): (.+)$', ln)
    if m:
        lines[i] = fix_line(m.group(1), m.group(2))
open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print(stats)
