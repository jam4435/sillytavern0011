
import re, glob, os
tot=0; official=0
for md in sorted(glob.glob("批次*/*.md")):
    n=len(re.findall(r"^### EV-", open(md,encoding="utf-8").read(), re.M))
    tot+=n
    if not os.path.basename(md).startswith("_"): official+=n
print("official cards:", official, "| including work files:", tot)
