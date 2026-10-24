"""Read complete baseline entries and prepare bounded, traceable difference reviews."""
from __future__ import annotations
import json
import re
from collections import Counter
from pathlib import Path

from pipeline import HERE, SOURCE, dump, sha

PROJECT = SOURCE.parents[1]


def build_baseline():
    """Index complete original event records; summaries are never the comparison source."""
    locations = [PROJECT/'世界书/金庸群侠传1/世界书',
                 PROJECT/'信息/武侠卡的预加入内容/预加入事件']
    records, errors, skipped = [], [], []
    for root in locations:
        for p in sorted(root.rglob('*')):
            if p.suffix not in ['.yaml','.json'] or not p.is_file():
                continue
            text = p.read_text(encoding='utf-8-sig')
            try:
                value = json.loads(text)
            except json.JSONDecodeError:
                try:
                    import yaml
                    value = yaml.safe_load(text)
                except Exception as error:
                    errors.append(dict(path=str(p),error=str(error)))
                    continue
            if not isinstance(value,dict):
                # Background prose can also contain a previously recorded history.
                value={'原始文档文本':text}
                doc_type='background'
            else:
                doc_type='event' if '事件类型' in value or '事件详情' in value else 'other_record'
            records.append(dict(id=p.relative_to(PROJECT).as_posix(),key=p.stem,
                path=str(p),sha256=sha(p),document_type=doc_type,record=value,
                search_text=json.dumps(value,ensure_ascii=False,separators=(',',':'))))
    (HERE/'baseline').mkdir(exist_ok=True)
    (HERE/'baseline/entries.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in records),encoding='utf-8')
    dump(HERE/'baseline/summary.json',dict(records=len(records),read_errors=errors, skipped=skipped,
        document_types=dict(Counter(r['document_type'] for r in records)),
        duplicate_keys={k:n for k,n in Counter(r['key'] for r in records).items() if n>1}))
    if errors:
        raise ValueError('baseline contains unreadable records; inspect baseline/summary.json')
    print(json.dumps(dict(baseline_records=len(records),read_errors=len(errors)),ensure_ascii=False))


def terms_for(event):
    terms=[]
    for person in event.get('people',[]):
        for name in re.split(r'[（(、，,/]|即|又名|又称|原名|绰号',person):
            name=name.strip(' ）)')
            if 2<=len(name)<=12 and not any(x in name for x in ['未知','原文','师父','弟子','众人']):
                terms.append(name)
    # Title characters supplement names; they do not establish event equivalence.
    title=re.sub(r'[^\u4e00-\u9fff]','',event['title'])
    terms.extend(title[i:i+3] for i in range(max(0,len(title)-2)))
    return list(dict.fromkeys(terms))


def retrieve(event,baseline):
    terms=terms_for(event)
    ranked=[]
    for entry in baseline:
        hits=[t for t in terms if t in entry['search_text']]
        if hits:
            ranked.append((sum(5 if t in event.get('people',[]) else 1 for t in hits),entry,hits))
    ranked.sort(key=lambda x:(-x[0],x[1]['id']))
    # Always retain the complete body of a chosen candidate. Budget overflow is explicit.
    selected,chars=[],0
    for score,entry,hits in ranked:
        size=len(entry['search_text'])
        if chars+size>24000 or len(selected)>=24:
            break
        selected.append(dict(id=entry['id'],sha256=entry['sha256'],record=entry['record'],matched_terms=hits))
        chars+=size
    return dict(terms=terms,baseline_count=len(baseline),matched_count=len(ranked),
        supplied_count=len(selected),truncated=len(selected)<len(ranked),candidates=selected)


if __name__=='__main__':
    build_baseline()
