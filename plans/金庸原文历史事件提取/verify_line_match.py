
import re, sys, os
# 严格行号一致性检查（两级判据）
#   ① 摘录首段必须出现在「命中行」所指的行上
#   ② 摘录所有 "……" 片段都必须落在「｜行 起-止」主范围内
# 用法: python verify_line_match.py <md文件> <小说UTF8.txt>
LQ="\u201c"; RQ="\u201d"; ELL="\u2026\u2026"
md = sys.argv[1]
nov = open(sys.argv[2], encoding="utf-8").read().split("\n")
t = open(md, encoding="utf-8").read()
blocks = re.findall(r"### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---|\Z)", t, re.S)
bad1, bad2 = [], []
for eid, body in blocks:
    pos = re.search(r"^- \u539f\u6587\u4f4d\u7f6e: (.+)$", body, re.M)
    ex  = re.search(r"^- \u539f\u6587\u6458\u5f55: (.+)$", body, re.M)
    if not pos or not ex: continue
    postxt = pos.group(1)
    quotes = re.findall(LQ + r"([^" + RQ + r"]+)" + RQ, ex.group(1))
    if not quotes: continue
    segs = []
    for q in quotes:
        segs += [p for p in q.split(ELL) if len(p) >= 8] or [q]
    if not segs: continue
    # 命中行
    hit = re.findall(r"\u547d\u4e2d\u884c\s*([\d,\u3001\s]+)", postxt)
    hitnums = []
    for h in hit:
        hitnums += [int(x) for x in re.findall(r"\d{2,6}", h)]
    # 主范围
    rng = re.findall(r"\u884c\s*(\d{2,6})\s*[-~\u81f3]\s*(\d{2,6})", postxt)
    ranges = [(int(a), int(b)) for a, b in rng]
    if not ranges and hitnums:
        ranges = [(min(hitnums), max(hitnums))]
    # ①
    if hitnums:
        first = segs[0]
        if not any(1 <= n <= len(nov) and first in nov[n-1] for n in hitnums):
            bad1.append(eid)
    # ②
    if ranges:
        ok = True
        for s in segs:
            if not any(lo <= n <= hi and s in nov[n-1]
                       for lo, hi in ranges for n in range(max(1, lo), min(len(nov), hi)+1)):
                ok = False; break
        if not ok: bad2.append(eid)
print("LINE-CHECK", os.path.basename(md), "cards", len(blocks),
      "| hit-line suspect", len(bad1), "| range suspect", len(bad2))
for x in bad1[:8]: print("  HIT", x)
for x in bad2[:8]: print("  RANGE", x)
