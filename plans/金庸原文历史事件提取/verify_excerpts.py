
import re, sys, os
# 用法: python verify_excerpts.py <md文件> <小说UTF8文件...>
LQ="\u201c"; RQ="\u201d"; ELL="\u2026\u2026"
md = sys.argv[1]
nov_paths = sys.argv[2:]
nov_lines = []
for p in nov_paths:
    nov_lines.append(open(p, encoding="utf-8").read().split("\n"))
nov = "\n".join("\n".join(x) for x in nov_lines)
t = open(md, encoding="utf-8").read()
blocks = re.findall(r"### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---|\Z)", t, re.S)
bad = []
for eid, body in blocks:
    m = re.search(r"^- \u539f\u6587\u6458\u5f55: (.+)$", body, re.M)
    if not m:
        bad.append((eid, "NO_EXCERPT")); continue
    quotes = re.findall(LQ + r"([^" + RQ + r"]+)" + RQ, m.group(1))
    if not quotes:
        bad.append((eid, "NO_QUOTE")); continue
    for q in quotes:
        segs = [p for p in q.split(ELL) if len(p) >= 8] or [q]
        miss = [p for p in segs if p not in nov]
        if miss:
            bad.append((eid, miss[0][:60])); break
print("FILE", os.path.basename(md), "CARDS", len(blocks), "PASS", len(blocks)-len(bad), "FAIL", len(bad))
for b in bad: print("  FAIL", b[0], "|", b[1])
