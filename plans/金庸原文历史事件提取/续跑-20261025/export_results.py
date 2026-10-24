"""Publish task-local progress and accepted evidence without changing legacy sources."""
from __future__ import annotations
import json
from collections import Counter, defaultdict
from pathlib import Path
from pipeline import HERE, Corpus, dump
from orchestrate import jsonl, usage_total


def assemble():
    corpus=Corpus()
    cards={c['uid']:c for c in jsonl(HERE/'inventory/cards.jsonl')}
    tasks=json.loads((HERE/'queue.json').read_text(encoding='utf-8'))
    reviews,events,links,questions={},{},[],[]
    for path in sorted((HERE/'results').glob('*.json')):
        result=json.loads(path.read_text(encoding='utf-8'))
        if 'task_id' not in result:
            continue
        for review in result['reviews']:
            reviews[review['uid']]=review
        for event in result['events']:
            events[event['id']]=event
        links.extend(result['cross_links'])
        questions.extend(dict(task=result['task_id'],question=q) for q in result['unresolved'])
        questions.extend(dict(task=result['task_id'],validation_issue=i) for i in result['validation_issues'])
    for uid,review in reviews.items():
        c=cards[uid]
        if review['verdict']!='supported' or c['mechanical_status']!='exact':
            continue
        f=c['fields']
        events['LEGACY:'+uid]=dict(id='LEGACY:'+uid,title=c['title'],when=f['发生时间'],place=f['地点'],
            people=[x.strip() for x in re_split_people(f['涉及人物']) if x.strip()],
            relationships=f['关系变化'],description=f['事件经过'],cause=f['前因'],effect=f['后果'],
            nature=f['线索性质'],uncertain=[f['待核']] if f['待核']!='无' else [],
            evidence=[dict(book=e['book'],line=e['start'],end_line=e['end'],
                quote=e['text'],source_sha256=e['source_sha256']) for e in c['evidence']],
            mechanical_status='exact',semantic_status='model_reviewed',diff_status='pending')
    differences={}
    for path in sorted((HERE/'diff-results').glob('*.json')):
        payload=json.loads(path.read_text(encoding='utf-8'))
        for item in payload['items']:
            differences[item['event_id']]=item
    for event_id,event in events.items():
        if event_id in differences:
            event['diff_status']=differences[event_id]['status']
            event['difference']=differences[event_id]
    (HERE/'deliverables').mkdir(exist_ok=True)
    (HERE/'deliverables/events.jsonl').write_text(''.join(json.dumps(e,ensure_ascii=False)+'\n' for e in events.values()),encoding='utf-8')
    dump(HERE/'deliverables/legacy-reviews.json',reviews)
    dump(HERE/'deliverables/cross-links.json',links)
    dump(HERE/'deliverables/unresolved.json',questions)
    dump(HERE/'deliverables/differences.json',differences)
    statuses=Counter(t['status'] for t in tasks)
    by_book={book:dict(Counter(t['status'] for t in tasks if t['book']==book)) for book in corpus.texts}
    summary=dict(statuses=dict(statuses),by_book=by_book,usage=usage_total(),events=len(events),
        reviewed_legacy=len(reviews),legacy_verdicts=dict(Counter(r['verdict'] for r in reviews.values())),
        rejected_or_pending_legacy=len(cards)-sum(
            (r['verdict']=='supported' and cards[uid]['mechanical_status']=='exact')
            or (r['verdict']=='corrected' and 'FIX:'+uid in events)
            for uid,r in reviews.items()),
        source_stage_complete=all(t['status']=='reviewed' for t in tasks),
        diff_reviewed_events=len(differences),
        diff_stage_complete=bool(events) and all(i in differences for i in events),cross_book_dedup_complete=False)
    dump(HERE/'deliverables/progress.json',summary)
    rows=['# 续跑进度与资料入口','','本页由程序生成。模型审阅、机械引文校验、差分和跨书去重分别记录。','',
          '| 作品 | 已审阅窗口 | 待执行 | 待修/失败 |','|---|---:|---:|---:|']
    for book,counts in by_book.items():
        rows.append(f'| {book} | {counts.get("reviewed",0)} | {counts.get("pending",0)} | {counts.get("failed",0)+counts.get("needs_repair",0)} |')
    rows+=['',f'累计已记录 tokens：{summary["usage"]["total"]:,}；进入事件资料表：{len(events)}；已审旧卡：{len(reviews)}。',
           '', '原文全覆盖：'+('本轮窗口全部审阅' if summary['source_stage_complete'] else '未完成'),
           '','完整正文差分、跨批跨书去重：未完成。仅引文通过的旧卡仍在 recovered/ 中，不冒充已验收事件。','',
           '- `events.jsonl`：经过本轮模型审阅且引文精确定位的事件。',
           '- `legacy-reviews.json`：保留、修正、排除、证据不足的逐卡回执。',
           '- `cross-links.json`：跨章与跨书待核线索。',
           '- `unresolved.json`：语义疑问和程序拒收原因。','']
    (HERE/'deliverables/进度.md').write_text('\n'.join(rows),encoding='utf-8')
    return summary


def re_split_people(text):
    import re
    return re.split('[、，,；;]',text)


if __name__=='__main__':
    print(json.dumps(assemble(),ensure_ascii=False))
