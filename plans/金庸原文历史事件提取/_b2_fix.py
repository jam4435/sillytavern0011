
import io, sys
p = r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\\批次B\\B2-天龙第18-30回.md"
t = open(p, encoding="utf-8").read()
a = "“那也不单因为他踢我妈妈，还因他累得我受了冤枉。我……我生平最受不得给人冤枉。”"
b = "“我……我生平最受不得给人冤枉。”"
c = "“宗真对这兄弟自是十分感激，立他为皇太弟，那是说日后传位于他，以酬恩德。耶律宗真辽史称为兴宗，但他逝世之后，皇位并不传给皇太弟重元，仍是传给自己的儿子洪基。”"
d = "“立他为皇太弟，那是说日后传位于他，以酬恩德。”……“但他逝世之后，皇位并不传给皇太弟重元，仍是传给自己的儿子洪基。”"
assert a in t, "A missing"
t = t.replace(a, b)
assert c in t, "C missing"
t = t.replace(c, d)
open(p, "w", encoding="utf-8").write(t)
print("ok")
