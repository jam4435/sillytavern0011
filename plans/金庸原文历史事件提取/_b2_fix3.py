
base = r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取"
p = base + r"\批次B\B2-天龙第18-30回.md"
t = open(p, encoding="utf-8").read()
old754 = "- 线索性质: 客观叙述（兼揭密，此段为叙述者交代星宿派内情）\n- 跨书引用: 无\n- 待核: 该弟子的姓名，原文未明"
new754 = "- 线索性质: 客观叙述（兼揭密，此段为叙述者交代星宿派内情）\n- 跨书引用: 无\n- 与现有条目差分: 完全缺失（2354 条无一条记丁春秋曾以石屋囚徒之法处死亲传弟子，亦无一条解释「化功大法为何不再传人」）\n- 待核: 该弟子的姓名，原文未明"
assert old754 in t, "754 not found"
t = t.replace(old754, new754)
# clean duplicated separators anywhere
while "---\n\n---" in t:
    t = t.replace("---\n\n---", "---")
open(p,"w",encoding="utf-8").write(t)
print("ok")
