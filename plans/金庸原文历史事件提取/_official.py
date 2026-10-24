
import re, glob, os
tot=0
rows=[]
for md in sorted(glob.glob("批次*/*.md")):
    b=os.path.basename(md)
    if b.startswith("_"): continue
    n=len(re.findall(r"^### EV-", open(md,encoding="utf-8").read(), re.M))
    rows.append((b,n)); tot+=n
for r in rows: print(r[0], r[1])
print("TOTAL OFFICIAL:", tot)
