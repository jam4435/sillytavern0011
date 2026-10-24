"""Inventory legacy event cards and bind quotations to immutable novel coordinates.

Legacy files are read-only. Generated receipts distinguish exact source matching
from semantic acceptance; no fuzzy match is promoted to a verified quotation.
"""
from __future__ import annotations

import argparse
import bisect
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent
BOOKS = {"天龙": "天龙八部", "射雕": "射雕英雄传", "神雕": "神雕侠侣",
         "倚天": "倚天屠龙记", "笑傲": "笑傲江湖", "鹿鼎": "鹿鼎记"}
FIELDS = ["原文位置", "原文摘录", "发生时间", "地点", "涉及人物", "关系变化", "事件经过",
          "前因", "后果", "线索性质", "跨书引用", "与现有条目差分", "待核"]
CARD = re.compile(r"^###\s+(EV-[^\s·]+)\s*[·・]?\s*(.*?)\s*$", re.M)


def dump(p: Path, value):
    """Write a deterministic UTF-8 JSON artifact."""
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(p: Path):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def quotes(text):
    """Read complete outer quotation groups, retaining nested quotation marks."""
    depth, begin, groups = 0, 0, []
    for i, ch in enumerate(text):
        if ch == "“":
            if depth == 0:
                begin = i + 1
            depth += 1
        elif ch == "”" and depth:
            depth -= 1
            if depth == 0:
                groups.append(text[begin:i])
    if depth:
        return [], "unbalanced_quotes"
    if not groups:
        return [], "no_quoted_excerpt"
    return groups, None


class Corpus:
    """Exact substring index over the six UTF-8 source novels."""
    def __init__(self):
        self.texts, self.offsets, self.chapters = {}, {}, {}
        self.hashes = {}
        for book in BOOKS.values():
            p = SOURCE / "原文UTF8" / (book + ".txt")
            text = p.read_text(encoding="utf-8")
            self.texts[book] = text
            self.offsets[book] = [0] + [m.end() for m in re.finditer("\n", text)]
            self.hashes[book] = sha(p)
        for line in (SOURCE / "章节索引.tsv").read_text(encoding="utf-8").splitlines():
            book, seq, chapter, title, bounds, chars = line.split("|")
            lo, hi = map(int, bounds.split("-"))
            self.chapters.setdefault(book, []).append(dict(book=book, seq=int(seq),
                chapter=chapter, title=title, start=lo, end=hi, chars=int(chars)))

    def chapter(self, book, line):
        return next((c for c in self.chapters[book] if c["start"] <= line <= c["end"]), None)

    def matches(self, book, needle):
        text, offsets, found, start = self.texts[book], self.offsets[book], [], 0
        while len(found) < 100:
            pos = text.find(needle, start)
            if pos < 0:
                break
            lo, hi = bisect.bisect_right(offsets, pos), bisect.bisect_right(offsets, pos + len(needle) - 1)
            found.append(dict(book=book, start=lo, end=hi, offset=pos, text=text[pos:pos + len(needle)]))
            start = pos + max(1, len(needle))
        return found


def parse_cards(path):
    text = path.read_text(encoding="utf-8-sig")
    headers = list(CARD.finditer(text))
    for i, h in enumerate(headers):
        body = text[h.end():headers[i + 1].start() if i + 1 < len(headers) else len(text)]
        fields = dict(re.findall(r"^-\s*([^:\n：]+)[:：]\s*(.*)$", body, re.M))
        prefix = h[1].split("-")[1]
        yield dict(uid=path.relative_to(SOURCE).as_posix() + "#" + h[1], legacy_id=h[1],
                   title=h[2], file=path.relative_to(SOURCE).as_posix(), book=BOOKS.get(prefix),
                   fields={f: fields[f] for f in FIELDS if f in fields})


def bind_card(card, corpus):
    fields = card["fields"]
    groups, error = quotes(fields.get("原文摘录", ""))
    issues = [error] if error else []
    evidence = []
    position = fields.get("原文位置", "")
    stated_books = [b for b in BOOKS.values() if "《" + b + "》" in position]
    allowed = list(dict.fromkeys([card["book"]] + stated_books))
    segments = []
    for group in groups:
        # Natural pauses in dialogue are literal punctuation, not omitted text.
        if any(corpus.matches(b, group) for b in allowed if b):
            segments.append(group)
        else:
            segments.extend(s.strip() for s in re.split(r"……|\.{6}", group) if s.strip())
    hit_match = re.search(r"命中行\s*(\d+)", position)
    hit = int(hit_match[1]) if hit_match else None
    numbers = [int(x) for x in re.findall(r"(?:行|[-–—~至、])\s*(\d{1,6})", position)]
    for index, segment in enumerate(segments):
        found = [m for b in allowed if b for m in corpus.matches(b, segment)]
        chosen = None
        if len(found) == 1:
            chosen = found[0]
        elif found:
            # A repeated short excerpt is safe only if its declared coordinate is exact.
            candidates = [m for m in found if m["start"] <= hit <= m["end"]] if index == 0 and hit else []
            if len(candidates) == 1:
                chosen = candidates[0]
            else:
                candidates = [m for m in found if m["start"] in numbers]
                if len(candidates) == 1:
                    chosen = candidates[0]
        if chosen:
            c = corpus.chapter(chosen["book"], chosen["start"])
            evidence.append({**chosen, "chapter": c["seq"] if c else None,
                             "source_sha256": corpus.hashes[chosen["book"]]})
        else:
            issues.append("excerpt_not_found" if not found else "ambiguous_excerpt")
            evidence.append(dict(requested=segment, match_count=len(found), candidates=found[:8]))
    missing = [f for f in FIELDS if not fields.get(f)]
    if missing:
        issues.append("missing_fields:" + ",".join(missing))
    complete = bool(segments) and not issues
    return {**card, "evidence": evidence, "mechanical_status": "exact" if complete else "needs_review",
            "mechanical_issues": issues, "legacy_hit_line": hit,
            "hit_line_changed": bool(complete and hit != evidence[0]["start"]),
            "semantic_status": "not_reviewed", "diff_status": "legacy_claim_not_verified"}


def inventory():
    corpus = Corpus()
    all_cards, selected, files = [], [], []
    for folder in sorted(SOURCE.glob("批次*")):
        if not folder.is_dir():
            continue
        for p in sorted(folder.glob("*.md")):
            cards = list(parse_cards(p))
            primary = bool(re.match(r"[A-G]\d+-", p.name))
            salvage = (folder.name == "批次E" and p.name == "_body.md") or (
                folder.name == "批次F" and bool(re.fullmatch(r"_f2_p[123]\.md", p.name)))
            files.append(dict(file=p.relative_to(SOURCE).as_posix(), sha256=sha(p),
                              bytes=p.stat().st_size, cards=len(cards), selected=primary or salvage))
            all_cards.extend(cards)
            if primary or salvage:
                selected.extend(bind_card(c, corpus) for c in cards)
    id_counts = Counter(c["legacy_id"] for c in selected)
    fingerprints = Counter((c["book"], c["title"], c["fields"].get("事件经过")) for c in selected)
    for c in selected:
        c["duplicate_id"] = id_counts[c["legacy_id"]] > 1
        c["exact_duplicate_content"] = fingerprints[(c["book"], c["title"], c["fields"].get("事件经过"))] > 1
    dump(HERE / "inventory/files.json", files)
    dump(HERE / "inventory/corpus.json", dict(hashes=corpus.hashes, chapters=corpus.chapters))
    out = HERE / "inventory/cards.jsonl"
    out.write_text("".join(json.dumps(c, ensure_ascii=False) + "\n" for c in selected), encoding="utf-8")
    stats = dict(source_cards=len(all_cards), selected_cards=len(selected),
                 selected_files=sum(f["selected"] for f in files),
                 exact=sum(c["mechanical_status"] == "exact" for c in selected),
                 needs_review=sum(c["mechanical_status"] != "exact" for c in selected),
                 hit_line_repairs=sum(c["hit_line_changed"] for c in selected),
                 duplicate_ids=[k for k, n in id_counts.items() if n > 1],
                 issues=dict(Counter(x for c in selected for x in c["mechanical_issues"])))
    dump(HERE / "inventory/summary.json", stats)
    by_file = {}
    for c in selected:
        by_file.setdefault(c["file"], []).append(c)
    for file, cards in by_file.items():
        lines = ["# 程序恢复副本：" + file, "", "原文件保持原状。exact 只表示摘录与原文精确匹配，不代表事实、去重或差分通过。", ""]
        for c in cards:
            lines.extend(["### " + c["legacy_id"] + " · " + c["title"],
                          "- 程序验收: " + c["mechanical_status"]])
            for f, value in c["fields"].items():
                if f == "原文位置" and c["mechanical_status"] == "exact":
                    value = "；".join(f'《{e["book"]}》第{e["chapter"]}回｜行 {e["start"]}-{e["end"]}（命中行 {e["start"]}）' for e in c["evidence"])
                lines.append("- " + f + ": " + value)
            if c["mechanical_issues"]:
                lines.append("- 程序待核: " + "; ".join(c["mechanical_issues"]))
            lines.append("")
        dest = HERE / "recovered" / file
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["inventory"])
    args = parser.parse_args()
    if args.command == "inventory":
        inventory()
