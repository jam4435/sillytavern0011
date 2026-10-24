
# -*- coding: utf-8 -*-
import re, io, sys
NOV = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read()
md = io.open('批次D/_test_body.md', encoding='utf-8').read()
entries = re.findall(r"### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---)", md, re.S)
LQ="\u201c"; RQ="\u201d"; ELL="\u2026\u2026"
for eid, body in entries:
    m = re.search(r"^- \u539f\u6587\u6458\u5f55: (.+)$", body, re.M)
    if not m: continue
    quotes = re.findall(LQ + r"([^" + RQ + r"]+)" + RQ, m.group(1))
    for q in quotes:
        segs = [p for p in q.split(ELL) if len(p) >= 8] or [q]
        for p in segs:
            if p in NOV: continue
            # find longest prefix present
            lo, hi = 0, len(p)
            while lo < hi:
                mid = (lo+hi+1)//2
                if p[:mid] in NOV: lo = mid
                else: hi = mid-1
            print(eid, '|', repr(p[max(0,lo-12):lo+18]))
            break
