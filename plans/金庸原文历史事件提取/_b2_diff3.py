
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
rows = json.load(open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\\现有条目索引.json", encoding="utf-8"))
for kw in "聚贤庄,游氏,耶律,玄悲,菩提院,止清,少林寺,萧远山,慕容博,阿朱,金锁,段正淳,甘宝宝,钟万仇,王夫人,木婉清,段延庆,无崖子,逍遥,化功,神木王鼎,星宿,摘星子,冰蚕".split(","):
    hit = [r for r in rows if kw in (r.get("key") or "") or kw in (r.get("cast") or "") or kw in (r.get("summary") or "")]
    print(kw, len(hit), "|", "; ".join(sorted({h["key"] for h in hit})[:6]))
