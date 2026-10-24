
base = r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取"
p = base + r"\批次B\B2-天龙第18-30回.md"
t = open(p, encoding="utf-8").read()
good = open(base + r"\批次B\_c730.md", encoding="utf-8").read()
head = "### EV-天龙-0730 · 阿朱、阿紫肩头各刺一个殷红「段」字\n"
start = t.index(head)
end = t.index("### EV-天龙-0731", start)
t = t[:start] + good + t[end:]
# remove stray "---" duplicates that resulted from the truncation
t = t.replace(good + "---\n\n---\n\n### EV-天龙-0731", good + "---\n\n### EV-天龙-0731")
open(p,"w",encoding="utf-8").write(t)
print("ok")
