
import re, collections, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
lines = open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\原文UTF8\天龙八部.txt", encoding="utf-8").read().split("\n")
cues = ["三十年前","当年","那时","从前","记得","师父","雁门","带头大哥","契丹","慕容","康敏","马夫人","段正淳","阮星竹","秦红棉","甘宝宝","王夫人","灵鹫","乌老大","丁春秋","星宿","童姥","玄慈","汪剑通","赵钱孙","谭公","单正","智光","萧远山"]
win = 40
rows=[]
for start in range(7422, 13649, win):
    seg = "\n".join(lines[start-1:start-1+win])
    c = sum(seg.count(k) for k in cues)
    rows.append((c, start, start+win-1))
rows.sort(reverse=True)
print("top windows (cue count, start, end):")
for c,s,e in rows[:40]:
    print(c, s, e)
print("total lines", 13648-7422+1)
