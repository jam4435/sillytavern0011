
import re, sys, os
LQ="\u201c"; RQ="\u201d"; ELL="\u2026\u2026"
md = sys.argv[1]
nov = open(sys.argv[2], encoding="utf-8").read().split("\n")
t = open(md, encoding="utf-8").read()
blocks = re.findall(r"### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---|\Z)", t, re.S)
prob = []
for eid, body in blocks:
    pos = re.search(r"^- \u539f\u6587\u4f4d\u7f6e: (.+)$", body, re.M)
    ex  = re.search(r"^- \u539f\u6587\u6458\u5f55: (.+)$", body, re.M)
    if not pos or not ex: continue
    nums = [int(x) for x in re.findall(r"\d{2,6}", pos.group(1))]
    quotes = re.findall(LQ + r"([^" + RQ + r"]+)" + RQ, ex.group(1))
    if not nums or not quotes: continue
    ok = False
    for q in quotes:
        segs = [p for p in q.split(ELL) if len(p) >= 8] or [q]
        s = segs[0]
        for n in nums:
            if 1 <= n <= len(nov) and s in nov[n-1]:
                ok = True; break
        if ok: break
    if not ok:
        prob.append(eid)
print("LINE-CHECK", os.path.basename(md), "cards", len(blocks), "suspect", len(prob))
for p in prob[:12]: print("  SUSPECT", p)
