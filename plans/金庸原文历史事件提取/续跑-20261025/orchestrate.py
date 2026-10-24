"""Resumable, bounded dsh jobs for source coverage and legacy semantic review.

Each shard is a fresh one-request Session. The controller owns retrieval,
coordinates, quotations, receipts, and all writes; the model has no tools.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

from pipeline import HERE, SOURCE, BOOKS, Corpus, dump, sha
from dsh_calls import call

VERSION = 'source-review-v1'
MAX_SOURCE_CHARS = 16000
MAX_PROMPT_CHARS = 52000
TOTAL_TOKEN_LIMIT = 15000000


def jsonl(path):
    return [json.loads(s) for s in path.read_text(encoding='utf-8').splitlines() if s.strip()]


def anchor_for(card):
    for e in card['evidence']:
        if e.get('book') == card['book'] and 'start' in e:
            return e['start']
    return card['legacy_hit_line']


def prepare():
    """Partition every source chapter; old read claims do not count as coverage."""
    if (HERE/'queue.json').exists():
        raise ValueError('queue already exists; do not overwrite persisted progress')
    corpus = Corpus()
    cards = jsonl(HERE / 'inventory/cards.jsonl')
    tasks = []
    for short, book in BOOKS.items():
        lines = corpus.texts[book].splitlines()
        for chapter in corpus.chapters[book]:
            lo, part = chapter['start'], 1
            while lo <= chapter['end']:
                hi, length = lo - 1, 0
                while hi < chapter['end']:
                    nxt = len(lines[hi]) + 12
                    if hi >= lo and length + nxt > MAX_SOURCE_CHARS:
                        break
                    length += nxt
                    hi += 1
                assigned = [c['uid'] for c in cards if c['book'] == book and anchor_for(c)
                            and lo <= anchor_for(c) <= hi]
                tasks.append(dict(id=f'{short}-{chapter["seq"]:03d}-{part:02d}', book=book,
                    chapter=chapter['seq'], title=chapter['title'], start=lo, end=hi,
                    legacy_uids=assigned, source_sha256=corpus.hashes[book], phase='source_review',
                    status='pending', prompt_version=VERSION))
                lo, part = hi + 1, part + 1
    assigned = {uid for t in tasks for uid in t['legacy_uids']}
    dump(HERE / 'queue.json', tasks)
    dump(HERE / 'inventory/unassigned-cards.json', [c['uid'] for c in cards if c['uid'] not in assigned])
    dump(HERE / 'policy.json', dict(provider='buddy', model='deepseek-v4.1-flash', reasoningEffort='low',
        max_source_chars=MAX_SOURCE_CHARS, max_prompt_chars=MAX_PROMPT_CHARS,
        max_output_tokens=32768, max_steps=1, automatic_retries=0,
        aggregate_token_limit=TOTAL_TOKEN_LIMIT, original_files_read_only=True,
        missing_entry_claim='retrieval-only; never globally proven by keyword absence'))
    print(json.dumps(dict(tasks=len(tasks), legacy_cards=len(cards), assigned_cards=len(assigned),
        unassigned_cards=len(cards)-len(assigned), source_chars=sum(len(t) for t in corpus.texts.values())), ensure_ascii=False))


def prompt_for(task, corpus, card_map):
    lines = corpus.texts[task['book']].splitlines()
    text = '\n'.join(f'{n}\t{lines[n-1]}' for n in range(task['start'], task['end'] + 1))
    legacy, supplement = [], {}
    # Adjacent context is supplied explicitly, rather than inherited from a Session.
    for numbers in [range(max(1,task['start']-12),task['start']),
                    range(task['end']+1,min(len(lines),task['end']+12)+1)]:
        used=0
        for n in numbers:
            if used+len(lines[n-1])>1800:
                break
            supplement[f'{task["book"]}:{n}']=lines[n-1]
            used+=len(lines[n-1])
    for uid in task['legacy_uids']:
        c = card_map[uid]
        legacy.append(dict(uid=uid, title=c['title'], fields={k:v for k,v in c['fields'].items()
            if k not in ['原文位置', '原文摘录', '与现有条目差分']}, mechanical=c['mechanical_status']))
        for e in c['evidence']:
            if 'book' not in e:
                continue
            source_lines = corpus.texts[e['book']].splitlines()
            for n in range(max(1, e['start']-1), min(len(source_lines), e['end']+1)+1):
                if e['book'] == task['book'] and task['start'] <= n <= task['end']:
                    continue
                supplement[f'{e["book"]}:{n}'] = source_lines[n-1]
    allowed = {(task['book'], n) for n in range(task['start'], task['end']+1)}
    allowed.update((key.split(':')[0], int(key.split(':')[1])) for key in supplement)
    instructions = '''你在做六部金庸小说的“过去历史事件”资料提取与旧卡验收。只读以下给定原文，不调用工具，不讨论计划。一次返回 JSON。
要逐行阅读主文本完整范围，不可只检索人名。提取人物关系起源、早年经历、身世、师承门派、秘籍传承、隐秘阴谋、政治往事、爱情婚姻等具体过去事件。叙事当下打斗/讲述/揭密行为本身不是过去事件；可把讲述当证据。原文不足写未知或待核，禁止外部常识和从记忆补剧情。用户所举人物不限制范围。
先验收给定旧卡，再补漏：旧卡中的泛背景、纯规则、当下场景、错误因果必须识别；不要为追求数量把同一动作拆成多张。不要重复已有旧卡。复杂历史的独立因果节点应分开。证据存在不等于卡片每个断言都有支持。
【返回规则】只输出一个 JSON 对象，无 Markdown。顶层字段：
{"task_id":"给定ID","coverage":{"start":整数,"end":整数,"complete":true},"reviews":[{"uid":"旧卡uid","verdict":"supported|corrected|not_historical|insufficient","reason":"简短具体依据","event":null或事件对象}],"new_events":[事件对象],"cross_links":[{"topic":"跨书/跨章关系","people":["原文人物"],"detail":"当前证据与待查方向，不断言未核对的另一书事实"}],"unresolved":["具体疑问"]}
每张给定旧卡必须有且仅有一个 review。supported 表示给定原文支持事件经过和核心因果，并未证明差分；corrected 必须返回完整修正事件；not_historical 表示不属于过去事件；insufficient 表示给定材料不足，不能猜。
如果旧卡 mechanical 是 needs_review，即使事实无误也必须用 corrected 并返回完整事件及精确证据锚，让程序重新生成引文；不能只回 supported。
事件对象字段必须完整：{"title":"具体动作","when":"原文相对时间或未知，不编精确年份","place":"原文地点或未知","people":["原文称谓"],"relationships":"实际关系变化或无","description":"具体事件经过，保留必要因果","cause":"原文依据或未知","effect":"原文依据或未知","nature":"客观叙述|人物自述|传闻|揭密|推断","evidence":[{"book":"书名","line":整数,"anchor":"该行内连续逐字原文4至40字"}],"uncertain":["限制或疑点"]}
禁止自行生成原文摘录字段：你只选行号和短定位锚，程序会从原文生成引文并验证。至少一处证据，不得伪造锚。只能引用下方主文本或补充文本内的书名与行号。每条证据须确实支持该事件。单行含多个往事时依内容判断。
不要生成世界书 YAML、人物档案或精确公历年份。不要判定现有世界书是否缺失（后续另有完整正文差分步骤）。不要声称通读本窗口之外的章节。'''
    prompt = instructions + '\n【任务】' + json.dumps(task, ensure_ascii=False) + '\n【待验收旧卡】' + json.dumps(legacy, ensure_ascii=False) + '\n【补充原文，键为书名:行号】' + json.dumps(supplement, ensure_ascii=False) + f'\n【主原文：《{task["book"]}》第{task["chapter"]}回；每行以真实行号开头】\n' + text
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ValueError(f'prompt exceeds bounded limit: {len(prompt)}')
    return prompt, allowed


def decode(text):
    text = text.strip()
    if text.startswith('```'):
        text = text.split('\n', 1)[1].rsplit('```', 1)[0].strip()
    return json.loads(text)


def materialize_event(event, allowed, corpus, event_id):
    """Generate citations from exact source bytes; reject invented anchors or coordinates."""
    required = ['title','when','place','people','relationships','description','cause','effect','nature','evidence','uncertain']
    if any(k not in event for k in required):
        raise ValueError('event missing required fields')
    if not isinstance(event['people'], list) or not event['people'] or not isinstance(event['uncertain'], list):
        raise ValueError('event people/uncertain must be arrays, with at least one person')
    if any(not isinstance(event[k], str) or not event[k].strip() for k in required if k not in ['people','evidence','uncertain']):
        raise ValueError('empty or non-string event field')
    if not isinstance(event['evidence'], list) or not 1 <= len(event['evidence']) <= 8:
        raise ValueError('event requires one to eight evidence references')
    evidence = []
    for ref in event['evidence']:
        book, n, anchor = ref['book'], ref['line'], ref['anchor']
        if type(n) is not int or (book, n) not in allowed:
            raise ValueError('evidence outside supplied material')
        if not isinstance(anchor, str) or not 4 <= len(anchor) <= 40:
            raise ValueError('anchor length outside 4..40')
        line = corpus.texts[book].splitlines()[n-1]
        pos = line.find(anchor)
        if pos < 0:
            raise ValueError('anchor not present verbatim on source line')
        # The model never writes the quotation: this is an exact source slice.
        start = max(0, pos-25)
        excerpt = line[start:min(len(line), max(pos+len(anchor), start+120))]
        evidence.append(dict(book=book, line=n, column_start=start+1,
            column_end=start+len(excerpt), anchor=anchor, quote=excerpt,
            source_sha256=corpus.hashes[book], chapter=(corpus.chapter(book,n) or {}).get('seq')))
    return {**event, 'id':event_id, 'evidence':evidence, 'mechanical_status':'exact',
            'semantic_status':'model_reviewed', 'diff_status':'pending'}


def validate(task, payload, allowed, corpus):
    if payload.get('task_id') != task['id']:
        raise ValueError('task id mismatch')
    if payload.get('coverage') != dict(start=task['start'], end=task['end'], complete=True):
        raise ValueError('source coverage incomplete')
    reviews = payload.get('reviews')
    if not isinstance(reviews, list) or sorted(r.get('uid','') for r in reviews) != sorted(task['legacy_uids']):
        raise ValueError('legacy review missing, duplicate, or unknown uid')
    events, outcomes, issues = [], [], []
    for r in reviews:
        if r.get('verdict') not in ['supported','corrected','not_historical','insufficient']:
            raise ValueError('unknown legacy verdict')
        if not isinstance(r.get('reason'), str) or not r['reason'].strip():
            raise ValueError('review requires reason')
        if r['verdict'] == 'corrected':
            try:
                events.append(materialize_event(r['event'], allowed, corpus, 'FIX:'+r['uid']))
            except (KeyError, ValueError, TypeError) as error:
                issues.append(dict(uid=r['uid'], error=str(error)))
                r = {**r, 'verdict':'insufficient', 'validation_error':str(error)}
        outcomes.append(r)
    if not isinstance(payload.get('new_events'), list):
        raise ValueError('new_events must be an array')
    for i, e in enumerate(payload['new_events'], 1):
        try:
            events.append(materialize_event(e, allowed, corpus, f'NEW:{task["id"]}:{i:03d}'))
        except (KeyError, ValueError, TypeError) as error:
            issues.append(dict(new_event=i, title=e.get('title'), error=str(error)))
    return dict(task_id=task['id'], coverage=payload['coverage'], reviews=outcomes, events=events,
        cross_links=payload.get('cross_links',[]), unresolved=payload.get('unresolved',[]),
        validation_issues=issues, semantic_acceptance='model_reviewed_not_independent_audit')


def usage_total():
    totals = dict(inputTokens=0, cacheReadTokens=0, outputTokens=0)
    for p in (HERE / 'runs').glob('*.events.jsonl'):
        for e in jsonl(p):
            if e['type'] == 'assistant/message':
                for k in totals:
                    totals[k] += e.get('data',{}).get('usage',{}).get(k,0)
    return {**totals, 'total':sum(totals.values())}


def run(limit, books=None):
    """Complete a bounded tranche; record and stop on provider or budget failure."""
    lock = HERE / '.controller.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.write(fd, str(os.getpid()).encode())
    os.close(fd)
    try:
        corpus = Corpus()
        cards = {c['uid']:c for c in jsonl(HERE / 'inventory/cards.jsonl')}
        tasks = json.loads((HERE / 'queue.json').read_text(encoding='utf-8'))
        chosen = [t for t in tasks if t['status']=='pending' and (not books or t['book'] in books)][:limit]
        for task in chosen:
            if usage_total()['total'] + 90000 > TOTAL_TOKEN_LIMIT:
                dump(HERE / 'STOP.json', dict(reason='aggregate_token_limit', usage=usage_total()))
                break
            if corpus.hashes[task['book']] != task['source_sha256']:
                raise ValueError('source novel changed; re-plan before resuming')
            prompt, allowed = prompt_for(task, corpus, cards)
            task['status'] = 'running'
            task['attempts'] = task.get('attempts',0) + 1
            job_id = 'review-' + task['id'] + '-a' + str(task['attempts'])
            dump(HERE / 'queue.json', tasks)
            (HERE / 'runs' / (job_id+'.prompt.txt')).write_text(prompt+'\n',encoding='utf-8')
            print(json.dumps(dict(start=task['id'],prompt_chars=len(prompt)),ensure_ascii=False), flush=True)
            try:
                result = call(prompt, timeout=300, call_id=job_id)
                (HERE / 'runs' / (job_id+'.stdout.txt')).write_text(result.text+'\n',encoding='utf-8')
                (HERE / 'runs' / (job_id+'.stderr.txt')).write_text(result.stderr+'\n',encoding='utf-8')
                if not result.success:
                    receipt_path=HERE/'runs'/(job_id+'.events.jsonl')
                    receipts=jsonl(receipt_path) if receipt_path.exists() else []
                    ending=next((e.get('data',{}).get('reason') for e in reversed(receipts) if e['type']=='turn/end'), None)
                    raise RuntimeError('dsh failed: '+json.dumps(ending or {'exit_code':result.exit_code},ensure_ascii=False))
                payload = decode(result.text)
                checked = validate(task, payload, allowed, corpus)
                dump(HERE / 'results' / (task['id']+'.json'),checked)
                task.update(status='reviewed' if not checked['validation_issues'] else 'needs_repair',
                    duration_ms=result.duration_ms, event_count=len(checked['events']),
                    issue_count=len(checked['validation_issues']))
                print(json.dumps(dict(done=task['id'],status=task['status'],events=len(checked['events']),
                    issues=len(checked['validation_issues']),usage=usage_total()),ensure_ascii=False),flush=True)
            except Exception as error:
                task.update(status='failed',error=str(error))
                dump(HERE / 'STOP.json',dict(reason='job_failed',task_id=task['id'],error=str(error),usage=usage_total()))
                print(json.dumps(dict(failed=task['id'],error=str(error)),ensure_ascii=False),flush=True)
                break
            finally:
                dump(HERE / 'queue.json',tasks)
    finally:
        lock.unlink()


def report():
    tasks=json.loads((HERE/'queue.json').read_text(encoding='utf-8'))
    from collections import Counter
    print(json.dumps(dict(statuses=dict(Counter(t['status'] for t in tasks)),usage=usage_total()),ensure_ascii=False))


def supplement_frontmatter():
    """Cover non-chapter text explicitly; existing completed windows remain immutable."""
    if (HERE/'.controller.lock').exists():
        raise ValueError('wait for the active controller before changing the source queue')
    corpus=Corpus()
    path=HERE/'queue.json'
    tasks=json.loads(path.read_text(encoding='utf-8'))
    existing={t['id'] for t in tasks}
    added=0
    for short,book in BOOKS.items():
        chapters=corpus.chapters[book]
        lines=corpus.texts[book].splitlines()
        spans=[(0,1,chapters[0]['start']-1,'卷首文本'),
               (999,chapters[-1]['end']+1,len(lines),'卷后文本')]
        for chapter,start,end,title in spans:
            part=1
            while start<=end:
                hi,size=start-1,0
                while hi<end:
                    if hi>=start and size+len(lines[hi])+12>MAX_SOURCE_CHARS:
                        break
                    size+=len(lines[hi])+12
                    hi+=1
                task_id=f'{short}-{chapter:03d}-{part:02d}'
                if task_id not in existing:
                    tasks.append(dict(id=task_id,book=book,chapter=chapter,title=title,start=start,end=hi,
                        legacy_uids=[],source_sha256=corpus.hashes[book],phase='source_review',status='pending',
                        prompt_version=VERSION))
                    added+=1
                start,part=hi+1,part+1
    dump(path,tasks)
    print(json.dumps(dict(added_frontmatter_windows=added,total_windows=len(tasks)),ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['prepare','run','status','supplement'])
    parser.add_argument('--limit',type=int,default=1)
    parser.add_argument('--books',nargs='*')
    args=parser.parse_args()
    if args.command=='prepare': prepare()
    elif args.command=='run': run(args.limit,args.books)
    elif args.command=='supplement':supplement_frontmatter()
    else: report()
