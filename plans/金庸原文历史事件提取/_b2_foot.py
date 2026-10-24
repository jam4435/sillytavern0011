
base = r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取"
p = base + r"\批次B\B2-天龙第18-30回.md"
t = open(p, encoding="utf-8").read().rstrip("\n")
add = open(base + r"\批次B\_foot.md", encoding="utf-8").read()
open(p,"w",encoding="utf-8").write(t + add)
print("ok")
