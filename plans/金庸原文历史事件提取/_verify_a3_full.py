
import re, json
nov = open("原文UTF8/射雕英雄传.txt", encoding="utf-8").read()
t = open("批次A/A3-梅超风完整前史.md", encoding="utf-8").read()
entries = re.findall(r"### (EV-[^\s·]+)[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
bad = []
for eid, body in entries:
    m = re.search(r"^- 原文摘录: “(.+?)”$", body, re.M)
    if not m: 
        bad.append((eid, "NO_EXCERPT", "")); continue
    s = m.group(1)
    parts = [p for p in s.split("……") if len(p) >= 8]
    hit = all(p in nov for p in parts) if parts else (s in nov)
    if not hit:
        bad.append((eid, s[:100], ""))
print("总卡", len(entries), "不吻合", len(bad))
for b in bad: print(b[0], "|", b[1])
