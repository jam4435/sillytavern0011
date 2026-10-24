import re, json, sys
LQ="\u201c"; RQ="\u201d"; ELL="\u2026\u2026"
nov = open('原文UTF8/笑傲江湖.txt', encoding='utf-8').read().split("\n")
t = open('批次F/F1-笑傲第1-20回.md', encoding='utf-8').read()
blocks = re.findall(r"### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---|\Z)", t, re.S)
out=[]
for eid, body in blocks:
    pos = re.search(r"^- 原文位置: (.+)$", body, re.M).group(1)
    ex = re.search(r"^- 原文摘录: (.+)$", body, re.M).group(1)
    quotes = re.findall(LQ + r"([^" + RQ + r"]+)" + RQ, ex)
    segs=[]
    for q in quotes:
        segs += [p for p in q.split(ELL) if len(p) >= 8] or [q]
    hit = re.findall(r"命中行\s*([\d,、\s]+)", pos)
    hitnums=[int(x) for x in re.findall(r"\d{2,6}", hit[0])] if hit else []
    rng = re.findall(r"行\s*(\d{2,6})\s*[-~至]\s*(\d{2,6})", pos)
    ranges=[(int(a),int(b)) for a,b in rng]
    locs=[]
    for s in segs:
        found=[i+1 for i,l in enumerate(nov) if s in l]
        locs.append(found)
    out.append(dict(id=eid, pos=pos, segs=segs, hit=hitnums, ranges=ranges, locs=locs))
json.dump(out, open('批次F/_f1_tmp/diag.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
bad=[o for o in out if any(not l for l in o['locs'])]
print('cards', len(out), 'segments-not-found cards', len(bad))
for o in bad:
    print('----', o['id'], '|', o['pos'])
    for s,l in zip(o['segs'], o['locs']):
        if not l: print('   MISS:', s)
