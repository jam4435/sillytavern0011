"""Independently check the first parallel wave's routing, overlap, usage and results."""
import json
from pipeline import HERE, Corpus, dump
from orchestrate import jsonl, decode, validate, prompt_for, usage_total
from supervise import assert_freeze


def main():
    if any((HERE/n).exists() for n in ['.controller.lock','.supervisor.lock']):
        raise ValueError('wait for the complete trial wave before acceptance')
    files=sorted((HERE/'handoff/parallel-waves').glob('*.json'))
    if len(files)!=1:
        raise ValueError('initial acceptance requires exactly one trial wave')
    wave=json.loads(files[0].read_text(encoding='utf-8'))
    tasks=json.loads((HERE/'queue.json').read_text(encoding='utf-8'))
    before=json.loads((HERE/'handoff/parallel-prelaunch.json').read_text(encoding='utf-8'))['queue']
    assert [t['id'] for t in before]==[t['id'] for t in tasks]
    for old,new in zip(before,tasks):
        if old['id'] not in wave['task_ids']:
            assert old==new
        for key in ['book','chapter','start','end','source_sha256','legacy_uids']:
            assert old[key]==new[key]
    corpus=Corpus()
    cards={c['uid']:c for c in jsonl(HERE/'inventory/cards.jsonl')}
    route=dict(provider='buddy',model='deepseek-v4.1-flash',reasoningEffort='low',maxTokens=32768)
    rows=[];sessions=set();edges=[];total=0
    for task_id in wave['task_ids']:
        task=next(t for t in tasks if t['id']==task_id)
        if task['status']!='reviewed':
            raise ValueError('trial task requires attention: '+task_id)
        call_id=f'review-{task_id}-a{task["attempts"]}'
        receipts=jsonl(HERE/'runs'/(call_id+'.events.jsonl'))
        ids={e['sessionId'] for e in receipts}
        assert len(ids)==1 and not sessions.intersection(ids)
        sessions.update(ids)
        headers=[e['data'] for e in receipts if e['type']=='request/header']
        assert headers==[dict(config=route,toolCount=0,toolNames=[])]
        assert sum(e['type']=='step/start' for e in receipts)==1
        messages=[e for e in receipts if e['type']=='assistant/message']
        ends=[e for e in receipts if e['type']=='turn/end']
        assert len(messages)==len(ends)==1 and ends[0]['data']['reason']==dict(kind='completed')
        usage=messages[0]['data']['usage']
        count=sum(usage.get(k,0) for k in ['inputTokens','cacheReadTokens','outputTokens'])
        total+=count
        start=next(e['time'] for e in receipts if e['type']=='request/header')
        end=ends[0]['time'];edges.extend([(start,1),(end,-1)])
        payload_path=HERE/'handoff/evidence-repairs'/call_id/'payload.json'
        if payload_path.exists():payload=json.loads(payload_path.read_text(encoding='utf-8'))
        else:payload=decode((HERE/'runs'/(call_id+'.stdout.txt')).read_text(encoding='utf-8'))
        _,allowed=prompt_for(task,corpus,cards)
        checked=validate(task,payload,allowed,corpus)
        saved=json.loads((HERE/'results'/(task_id+'.json')).read_text(encoding='utf-8'))
        assert checked==saved and not checked['validation_issues']
        rows.append(dict(task_id=task_id,book=task['book'],session_id=next(iter(ids)),
                         route=route,usage=usage,events=len(checked['events']),validation_issues=[]))
    peak=active=0
    for _,delta in sorted(edges):
        active+=delta;peak=max(peak,active)
    assert len(rows)==len(sessions)==len({r['book'] for r in rows})==6
    assert peak==6
    current=usage_total()
    assert current['total']-wave['usage_before']['total']==total
    assert total<=wave['reserved_tokens']==540000
    assert not any(t['status'] in ['running','failed','needs_repair'] for t in tasks)
    assert_freeze()
    report=dict(accepted=True,peak_simultaneous_model_requests=peak,rows=rows,
                added_tokens=total,usage=current,original_data_hashes='unchanged',
                queue_coverage_preserved=True,unselected_tasks_unchanged=True)
    dump(HERE/'handoff/parallel-trial-acceptance.json',report)
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    main()
