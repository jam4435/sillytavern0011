import json
d=json.load(open('批次F/_f1_tmp/diag.json',encoding='utf-8'))
bad=[]
for o in d:
    if not o['hit']: continue
    first=o['segs'][0]
    ok=any(first in o['locs'][i][0:0] or True for i in [0])
    ok=any(h in o['locs'][0] for h in o['hit'])
    if not ok: bad.append(o)
print('hit-line bad', len(bad))
for o in bad:
    print('====', o['id'], '|', o['pos'])
    print('   seg0:', o['segs'][0][:70])
    print('   actual lines of seg0:', o['locs'][0][:12])
    for s,l in list(zip(o['segs'],o['locs']))[1:]:
        print('   seg:', s[:40], '->', l[:8])
