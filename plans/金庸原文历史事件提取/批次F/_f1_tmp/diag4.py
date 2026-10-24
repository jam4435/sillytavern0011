import json
d=json.load(open('批次F/_f1_tmp/diag.json',encoding='utf-8'))
print('n',len(d))
print(d[0]['ranges'], d[0]['hit'], d[0]['id'])
n=0
for o in d:
    if not o['ranges']:
        n+=1
print('no ranges', n)
# replicate official script eval
LQ="\u201c"
cnt=0
for o in d:
    if not o['ranges']: continue
    ok=True
    for s,l in zip(o['segs'],o['locs']):
        if not any(any(lo<=x<=hi for x in l) for lo,hi in o['ranges']):
            ok=False;break
    if not ok:
        cnt+=1
        print('OUT', o['id'], o['pos'])
print('out count', cnt)
