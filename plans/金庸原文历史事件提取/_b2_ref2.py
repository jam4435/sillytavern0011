
import io
p = r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\\批次B\\B2-天龙第18-30回.md"
t = open(p, encoding="utf-8").read()
t = t.replace("- 后果: EV-天龙-0707（八弟子被逐）、EV-天龙-0801（「聪辩先生」名号的由来）",
              "- 后果: EV-天龙-0707（八弟子被逐）、EV-天龙-0802（「聪辩先生」名号的含义）")
open(p,"w",encoding="utf-8").write(t)
print("ok")
