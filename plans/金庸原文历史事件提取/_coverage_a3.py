
import re
nov = open("原文UTF8/射雕英雄传.txt", encoding="utf-8").read()
t = open("批次A/A3-梅超风完整前史.md", encoding="utf-8").read()
entries = re.findall(r"### (EV-[^\s·]+)[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
# 用 2-gram 覆盖率估计「有多少内容真的来自原文」
for eid, body in entries:
    m = re.search(r"^- 原文摘录: “(.+?)”$", body, re.M)
    if not m: continue
    s = re.sub(r"[“”…\s]", "", m.group(1))
    if len(s) < 10: continue
    grams = [s[i:i+6] for i in range(len(s)-5)]
    hit = sum(1 for g in grams if g in nov)
    cov = hit/len(grams)
    if cov < 0.85:
        print(eid, round(cov,2), "len", len(s))
