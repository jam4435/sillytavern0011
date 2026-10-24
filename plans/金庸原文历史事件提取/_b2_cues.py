
import re, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
lines = open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\原文UTF8\天龙八部.txt", encoding="utf-8").read().split("\n")
strong = ["三十年前","二十年前","二十四年前","当年","那时","从前","小时候","幼时","少年时","年轻时","记得","临终","遗书","遗言","师父说","我爹","我娘","亲生","身世","旧事","旧怨","旧仇","往事","原来","假死","出家","拜师","学艺","传授","继位","篡","叛乱","契丹","雁门","带头大哥","杀父","我父","先父","师祖","祖师","当年我"]
step=0
out=[]
for i in range(7422, 13649):
    t = lines[i-1]
    if any(k in t for k in strong):
        out.append((i,t))
print("total cue lines:", len(out))
# print compact: line no + first 90 chars
for i,t in out:
    print(i, t.strip()[:90])
