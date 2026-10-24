
import re, os
pairs = {"A1":("批次A/A1-逍遥派三师兄妹.md","原文UTF8/天龙八部.txt"),
         "A2":("批次A/A2-无崖子师徒决裂与传承.md","原文UTF8/天龙八部.txt"),
         "A3":("批次A/A3-梅超风完整前史.md","SHOTIAO")}
for tag,(md,novp) in pairs.items():
    if novp == "SHOTIAO":
        nov = open("原文UTF8/射雕英雄传.txt",encoding="utf-8").read() + "\n" + open("原文UTF8/神雕侠侣.txt",encoding="utf-8").read()
    else:
        nov = open(novp,encoding="utf-8").read()
    t = open(md,encoding="utf-8").read()
    entries = re.findall(r"### (EV-[^\s·]+)[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
    bad = []
    for eid, body in entries:
        m = re.search(r"^- 原文摘录: “(.+?)”$", body, re.M)
        if not m: bad.append((eid,"NO")); continue
        parts=[p for p in m.group(1).split("……") if len(p)>=8]
        ok = all(p in nov for p in parts) if parts else (m.group(1) in nov)
        if not ok: bad.append((eid,"MISS"))
    print(tag, "总卡", len(entries), "不吻合", len(bad), [b[0] for b in bad][:12])
