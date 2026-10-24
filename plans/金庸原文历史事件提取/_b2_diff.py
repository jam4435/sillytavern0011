
import json, sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
rows = json.load(open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\现有条目索引.json", encoding="utf-8"))
kws = sys.argv[1].split(",")
for kw in kws:
    hit = [r for r in rows if kw in (r.get("key") or "") or kw in (r.get("cast") or "") or kw in (r.get("summary") or "") or kw in (r.get("detailHead") or "")]
    print(f"=== {kw} : {len(hit)} ===")
    for h in hit[:14]:
        print(f"  [{h.get('src')}] {h.get('key')} | {h.get('loc')} | {h.get('time')} | {h.get('cast')}")
        print(f"      {(h.get('summary') or '')[:150]}")
    if len(hit) > 14: print(f"  ...(+{len(hit)-14})")
