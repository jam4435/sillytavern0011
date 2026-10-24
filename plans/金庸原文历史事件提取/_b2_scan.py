
import json, collections
d = json.load(open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\旧事线索扫描.json", encoding="utf-8"))
rows = d if isinstance(d, list) else d.get("rows") or d.get("items") or []
print(type(d), len(rows))
sub = [r for r in rows if r.get("book","").startswith("天龙") and 7422 <= r["line"] <= 13648]
print("in-range:", len(sub))
c = collections.Counter(r["chapter"] for r in sub)
print(sorted(c.items(), key=lambda x: str(x[0])))
print("markers:", collections.Counter(m for r in sub for m in r["markers"]).most_common(20))
print(json.dumps(sub[0], ensure_ascii=False)[:600])
