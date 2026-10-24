
import re, glob, os
rows=[]
for md in sorted(glob.glob("批次*/*.md")):
    t=open(md,encoding="utf-8").read()
    rows.append((md, len(re.findall(r"^### EV-", t, re.M)), len(t)))
for r in rows: print(r[0], "cards=",r[1], "chars=",r[2])
print("TOTAL cards", sum(r[1] for r in rows))
