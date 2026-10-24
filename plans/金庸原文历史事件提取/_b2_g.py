
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
lines = open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\\原文UTF8\\天龙八部.txt", encoding="utf-8").read().split("\n")
for kw in ["乌老大","三十六洞","七十二岛","灵鹫","童姥","李秋水","甘宝宝","王夫人","钟万仇","慕容博","假死","装死","雁门","带头大哥","萧远山","玄慈"]:
    hits=[i+1 for i,l in enumerate(lines) if kw in l and 7422<=i+1<=13648]
    print(kw, len(hits), hits[:12])
