
import re, random
nov = open("原文UTF8/射雕英雄传.txt", encoding="utf-8").read()
t = open("批次A/A3-梅超风完整前史.md", encoding="utf-8").read()
segs = re.findall(r'^- 原文摘录: “(.+?)”$', t, re.M)
random.seed(7)
sample = random.sample(segs, min(15, len(segs)))
ok = bad = 0
for s in sample:
    parts = [p for p in s.split("……") if len(p) >= 8]
    hit = all(p in nov for p in parts) if parts else (s in nov)
    if hit: ok += 1
    else:
        bad += 1
        print("MISS:", s[:60])
print("摘录总数", len(segs), "抽样", len(sample), "吻合", ok, "不吻合", bad)
