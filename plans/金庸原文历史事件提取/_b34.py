
import re, glob, os, collections
for md in ["批次B/B3-天龙第31-40回.md","批次B/B4-天龙第41-50回.md"]:
    t=open(md,encoding="utf-8").read()
    cards=len(re.findall(r"^### EV-",t,re.M))
    d=collections.Counter()
    for m in re.finditer(r"^- 与现有条目差分: (.+)",t,re.M):
        v=m.group(1)
        for k in ["完全缺失","只有回忆或揭密场景","只有最终结果","部分已有","已完整记录","证据不足"]:
            if v.startswith(k): d[k]+=1; break
        else: d["其它"]+=1
    print(os.path.basename(md), "cards",cards, dict(d))
