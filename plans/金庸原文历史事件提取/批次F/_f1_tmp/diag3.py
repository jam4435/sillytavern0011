import json
d=json.load(open('批次F/_f1_tmp/diag.json',encoding='utf-8'))
for o in d:
    if not o['ranges']: continue
    ok=True
    for s,l in zip(o['segs'],o['locs']):
        if not any(any(lo<=n<=hi for n in l) for lo,hi in o['ranges']): ok=False
    if not ok:
        print('====',o['id'],'|',o['pos'])
        for s,l in zip(o['segs'],o['locs']):
            inside=any(any(lo<=n<=hi for n in l) for lo,hi in o['ranges'])
            print('   ', 'OK ' if inside else 'OUT', s[:40], '->', l[:8], 'ranges', o['ranges'])
