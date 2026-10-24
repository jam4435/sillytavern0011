
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
rows = json.load(open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\\现有条目索引.json", encoding="utf-8"))
kws = "康敏,马夫人,马大元,白世镜,阮星竹,秦红棉,刀白凤,丁春秋,苏星河,聋哑,函谷八友,薛慕华,易筋经,智光,赵钱孙,谭婆,耶律,重元,石敬瑭,燕云,打草谷,青狼,玄悲,游坦之,冰蚕,慧净,金锁片".split(",")
for kw in kws:
    hit = [r for r in rows if kw in (r.get("key") or "") or kw in (r.get("cast") or "") or kw in (r.get("summary") or "") or kw in (r.get("detailHead") or "")]
    print(f"=== {kw}: {len(hit)}")
    for h in hit[:5]:
        print("   ", h.get("key"), "|", h.get("loc"), "|", (h.get("summary") or "")[:80])
