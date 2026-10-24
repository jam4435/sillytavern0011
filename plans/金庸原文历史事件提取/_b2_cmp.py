
import re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
t = open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\\批次B\\B2-天龙第18-30回.md", encoding="utf-8").read()
h = re.findall(r"^### (EV-\S+?)[ \u00b7\n]", t, re.M)
v = re.findall(r"### (EV-[^\s\u00b7]+)[^\n]*\n(.*?)(?=\n### |\n---)", t, re.S)
print("headings:", len(h), "unique:", len(set(h)))
print("verifier entries:", len(v))
vh = [x[0] for x in v]
print("missing in verifier:", sorted(set(h)-set(vh)))
print("dupes in verifier:", [x for x in set(vh) if vh.count(x)>1])
# find card bodies that contain a line starting with ---
for eid, body in v:
    if re.search(r"^---", body, re.M):
        print("dash inside:", eid)
