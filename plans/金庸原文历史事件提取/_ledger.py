
import re, glob, os, subprocess, sys
files = [f for f in sorted(glob.glob("批次*/*.md")) if not os.path.basename(f).startswith("_")]
novmap = {"天龙":"天龙八部","射雕":"射雕英雄传","神雕":"神雕侠侣","倚天":"倚天屠龙记","笑傲":"笑傲江湖","鹿鼎":"鹿鼎记"}
for f in files:
    t = open(f, encoding="utf-8").read()
    cards = len(re.findall(r"^### EV-", t, re.M))
    novels = set()
    for k in novmap:
        if k in os.path.basename(f) or k in t[:2000]:
            novels.add(novmap[k])
    print(os.path.basename(f), "cards=", cards)
