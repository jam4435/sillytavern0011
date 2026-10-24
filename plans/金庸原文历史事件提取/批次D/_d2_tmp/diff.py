
# -*- coding: utf-8 -*-
import json, io, sys
d = json.load(open('现有条目索引.json', encoding='utf-8'))
rows = d
kws = sys.argv[1].split(',')
out = io.open('批次D/_d2_tmp/diff_out.txt', 'w', encoding='utf-8')
n = 0
for r in rows:
    blob = (r.get('key','') + '|' + r.get('cast','') + '|' + r.get('summary','') + '|' + r.get('detailHead',''))
    hit = [k for k in kws if k in blob]
    if hit:
        n += 1
        out.write('[%d] key=%s\n  src=%s cast=%s loc=%s\n  summary=%s\n  detail=%s\n' % (n, r.get('key'), r.get('src'), r.get('cast'), r.get('loc'), r.get('summary'), r.get('detailHead')[:220]))
out.write('TOTAL HIT %d / %d\n' % (n, len(rows)))
out.close()
print('hits', n)
