"""Read complete baseline entries and prepare bounded, traceable difference reviews."""
from __future__ import annotations
import json
import re
import os
import argparse
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
        if len(selected)>=8:
            break
        if chars+size>14000:
            continue
        selected.append(dict(id=entry['id'],sha256=entry['sha256'],record=entry['record'],matched_terms=hits))
        chars+=size
    return dict(terms=terms,baseline_count=len(baseline),matched_count=len(ranked),
        supplied_count=len(selected),truncated=len(selected)<len(ranked),candidates=selected)


def prepare_diff():
    """Build short full-body comparison batches for source-accepted events."""
    from orchestrate import jsonl
    from export_results import assemble
    assemble()
    baseline=jsonl(HERE/'baseline/entries.jsonl')
    events=jsonl(HERE/'deliverables/events.jsonl')
    queue_path=HERE/'diff-queue.json'
    queue=json.loads(queue_path.read_text(encoding='utf-8')) if queue_path.exists() else []
    known={e['id'] for job in queue for e in job['events']}
    jobs=[]
    current=dict(events=[],retrievals={},candidates={})
    def flush():
        nonlocal current
        if not current['events']:
            return
        current['id']=f'diff-{len(queue)+len(jobs)+1:05d}'
        current['status']='pending'
        jobs.append(current)
        current=dict(events=[],retrievals={},candidates={})
    for event in events:
        if event['id'] in known:
            continue
        retrieved=retrieve(event,baseline)
        proposed={**current['candidates'],**{c['id']:c for c in retrieved['candidates']}}
        size=len(json.dumps(proposed,ensure_ascii=False))+len(json.dumps(current['events']+[event],ensure_ascii=False))
        if current['events'] and (len(current['events'])>=6 or size>35000):
            flush()
        current['events'].append(event)
        current['retrievals'][event['id']]={k:v for k,v in retrieved.items() if k!='candidates'}
        current['retrievals'][event['id']]['candidate_ids']=[c['id'] for c in retrieved['candidates']]
        current['candidates'].update({c['id']:c for c in retrieved['candidates']})
    flush()
    dump(queue_path,queue+jobs)
    print(json.dumps(dict(new_diff_jobs=len(jobs),total_diff_jobs=len(queue)+len(jobs)),ensure_ascii=False))


def run_diff(limit):
    """Run traceable comparisons; an absent keyword is never a global absence proof."""
    from orchestrate import usage_total, TOTAL_TOKEN_LIMIT, decode, jsonl
    from dsh_calls import call
    lock=HERE/'.controller.lock'
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    os.write(fd,str(os.getpid()).encode());os.close(fd)
    try:
        path=HERE/'diff-queue.json'
        jobs=json.loads(path.read_text(encoding='utf-8'))
        for job in [j for j in jobs if j['status']=='pending'][:limit]:
            if usage_total()['total']+90000>TOTAL_TOKEN_LIMIT:
                dump(HERE/'STOP.json',dict(reason='aggregate_token_limit',usage=usage_total()))
                break
            prompt='''只输出 JSON。你在做已核验原文事件与现有世界书/预加入事件的差分。现有条目的完整原始正文都在 candidates 中，必须读正文，不凭文件名判断。只用给定材料。
每个 events 事件返回一项：{"items":[{"event_id":"给定ID","status":"已完整记录|部分已有|只有回忆或揭密场景|只有最终结果|未检出匹配|证据不足","matched_ids":["确实记载同一历史节点的候选id"],"reason":"指出现有正文记了什么、缺了什么，或为何不能确定","missing_nodes":["缺失节点"],"quality_notes":["原存档失实或与原文冲突；没有则空"]}]}。
禁止把“现有条目提到了同一个人物”当成记载同一历史事件。区别人物现在讲述与当年真正行为。候选已包含结局不代表前因过程已有。跨章或跨书叙述若确是同一历史事实可判匹配。
matched_ids 只能选该事件 retrievals 中 candidate_ids 内的ID。没有匹配可写“未检出匹配”，不得改成“完全缺失”；这是程序检索候选，可能有别名漏检或截断，不能据此断言全库不存在。候选不足以判定则“证据不足”。所有输入事件必须且仅返回一项。不要给计划、工具调用或代码围栏。\n'''+json.dumps({k:job[k] for k in ['events','retrievals','candidates']},ensure_ascii=False)
            if len(prompt)>52000:
                raise ValueError('diff prompt over bounded limit')
            job['status']='running';dump(path,jobs)
            call_id=job['id']
            (HERE/'runs'/(call_id+'.prompt.txt')).write_text(prompt+'\n',encoding='utf-8')
            print(json.dumps(dict(start=job['id'],phase='diff',events=len(job['events']),prompt_chars=len(prompt)),ensure_ascii=False),flush=True)
            try:
                result=call(prompt,timeout=300,call_id=call_id)
                (HERE/'runs'/(call_id+'.stdout.txt')).write_text(result.text+'\n',encoding='utf-8')
                (HERE/'runs'/(call_id+'.stderr.txt')).write_text(result.stderr+'\n',encoding='utf-8')
                if not result.success:
                    raise ValueError('dsh comparison failed; inspect structured call receipt')
                payload=decode(result.text)
                if not isinstance(payload.get('items'),list) or sorted(i.get('event_id','') for i in payload['items'])!=sorted(e['id'] for e in job['events']):
                    raise ValueError('comparison result does not cover every event exactly once')
                for item in payload['items']:
                    if item['status'] not in ['已完整记录','部分已有','只有回忆或揭密场景','只有最终结果','未检出匹配','证据不足']:
                        raise ValueError('invalid or overconfident comparison status')
                    available=job['retrievals'][item['event_id']]['candidate_ids']
                    if not isinstance(item['matched_ids'],list) or any(x not in available for x in item['matched_ids']):
                        raise ValueError('unknown comparison reference')
                    if item['status'] in ['已完整记录','部分已有','只有回忆或揭密场景','只有最终结果'] and not item['matched_ids']:
                        raise ValueError('positive match requires an actual original document')
                    item['retrieval_scope']=job['retrievals'][item['event_id']]
                    item['matched_documents']=[dict(id=i,sha256=job['candidates'][i]['sha256']) for i in item['matched_ids']]
                dump(HERE/'diff-results'/(job['id']+'.json'),payload)
                job['status']='reviewed'
                print(json.dumps(dict(done=job['id'],phase='diff',usage=usage_total()),ensure_ascii=False),flush=True)
            except Exception as error:
                job.update(status='failed',error=str(error))
                dump(HERE/'STOP.json',dict(reason='diff_failed',job_id=job['id'],error=str(error)))
                print(json.dumps(dict(failed=job['id'],error=str(error)),ensure_ascii=False),flush=True)
                break
            finally:
                dump(path,jobs)
    finally:
        lock.unlink()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',nargs='?',choices=['baseline','prepare','run'],default='baseline')
    parser.add_argument('--limit',type=int,default=1)
    args=parser.parse_args()
    if args.command=='baseline':build_baseline()
    elif args.command=='prepare':prepare_diff()
    else:run_diff(args.limit)
