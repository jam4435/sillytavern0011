"""Review bounded event pairs before merging historical facts across books or batches."""
from __future__ import annotations
import json
import os
import re
from collections import defaultdict
from itertools import combinations
from pipeline import HERE, dump


def grams(text):
    text=re.sub(r'[^\u4e00-\u9fff]','',text)
    return {text[i:i+3] for i in range(max(0,len(text)-2))}


def prepare():
    """Nominate pairs from shared exact evidence and source-backed names, without auto-merging."""
    from orchestrate import jsonl
    events=jsonl(HERE/'deliverables/events.jsonl')
    by_id={e['id']:e for e in events}
    indexes=defaultdict(list)
    titles={e['id']:grams(e['title']) for e in events}
    names={e['id']:set(e['people']) for e in events}
    for event in events:
        for person in event['people']:
            if len(person)>=2:
                indexes['person:'+person].append(event['id'])
        for ref in event['evidence']:
            indexes[f'evidence:{ref["book"]}:{ref["line"]}'].append(event['id'])
    pairs=set()
    for key, ids in indexes.items():
        for a,b in combinations(sorted(set(ids)),2):
            ga,gb=titles[a],titles[b]
            similarity=len(ga&gb)/max(1,len(ga|gb))
            if key.startswith('evidence:') or similarity>=0.2 or (len(names[a]&names[b])>=2 and similarity>=0.08):
                pairs.add((a,b))
    path=HERE/'dedup-queue.json'
    queue=json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
    known={tuple(pair) for job in queue for pair in job['pairs']}
    pending=sorted(pairs-known)
    for i in range(0,len(pending),6):
        batch=pending[i:i+6]
        ids={eid for pair in batch for eid in pair}
        queue.append(dict(id=f'dedup-{len(queue)+1:05d}',status='pending',pairs=batch,
            events={eid:by_id[eid] for eid in sorted(ids)}))
    dump(path,queue)
    print(json.dumps(dict(phase='dedup',pairs=len(pairs),jobs=len(queue)),ensure_ascii=False))


def run(limit):
    from orchestrate import usage_total,TOTAL_TOKEN_LIMIT,decode
    from dsh_calls import call
    lock=HERE/'.controller.lock'
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    os.write(fd,str(os.getpid()).encode());os.close(fd)
    try:
        path=HERE/'dedup-queue.json'
        queue=json.loads(path.read_text(encoding='utf-8'))
        for job in [j for j in queue if j['status']=='pending'][:limit]:
            if usage_total()['total']+90000>TOTAL_TOKEN_LIMIT:
                dump(HERE/'STOP.json',dict(reason='aggregate_token_limit',usage=usage_total()))
                break
            prompt='''只输出 JSON。逐对判断两个事件是否是同一个“真正过去发生的历史事实”。所有事件已附给定原文证据，禁止外部知识。
同一事实被多章或多书重复讲述，可判 same。不同时间的动作、同一过程不同因果节点、过去事实和现在揭密行为，判 distinct。缺乏事件身份或人物同一性的原文直证时判 uncertain，不能只凭相同人名或常见梗概强行合并。
返回 {"pairs":[{"a":"ID","b":"ID","verdict":"same|distinct|uncertain","reason":"指向给定来源的具体依据"}]}。必须且仅返回输入所有 pairs；不改写事件、不造新证据、不调用工具。\n'''+json.dumps({k:job[k] for k in ['pairs','events']},ensure_ascii=False)
            if len(prompt)>52000:
                raise ValueError('dedup prompt over bounded limit')
            job['status']='running';dump(path,queue)
            (HERE/'runs'/(job['id']+'.prompt.txt')).write_text(prompt+'\n',encoding='utf-8')
            print(json.dumps(dict(start=job['id'],phase='dedup',pairs=len(job['pairs'])),ensure_ascii=False),flush=True)
            try:
                result=call(prompt,timeout=300,call_id=job['id'])
                (HERE/'runs'/(job['id']+'.stdout.txt')).write_text(result.text+'\n',encoding='utf-8')
                (HERE/'runs'/(job['id']+'.stderr.txt')).write_text(result.stderr+'\n',encoding='utf-8')
                if not result.success:
                    raise ValueError('dsh dedup failed; inspect structured call receipt')
                payload=decode(result.text)
                expected=sorted(tuple(p) for p in job['pairs'])
                if sorted((p.get('a',''),p.get('b','')) for p in payload['pairs'])!=expected:
                    raise ValueError('dedup must return every nominated pair exactly once')
                if any(p['verdict'] not in ['same','distinct','uncertain'] or not p.get('reason') for p in payload['pairs']):
                    raise ValueError('dedup requires known verdict and evidence reason')
                dump(HERE/'dedup-results'/(job['id']+'.json'),payload)
                job['status']='reviewed'
                print(json.dumps(dict(done=job['id'],phase='dedup',usage=usage_total()),ensure_ascii=False),flush=True)
            except Exception as error:
                job.update(status='failed',error=str(error))
                dump(HERE/'STOP.json',dict(reason='dedup_failed',job_id=job['id'],error=str(error)))
                break
            finally:
                dump(path,queue)
    finally:
        lock.unlink()


def export_groups():
    """Retain all source variants; contradictory equivalence groups stay unresolved."""
    from orchestrate import jsonl
    events=jsonl(HERE/'deliverables/events.jsonl')
    parent={e['id']:e['id'] for e in events}
    decisions=[]
    for path in sorted((HERE/'dedup-results').glob('*.json')):
        decisions.extend(json.loads(path.read_text(encoding='utf-8'))['pairs'])
    def find(eid):
        while parent[eid]!=eid:
            parent[eid]=parent[parent[eid]]
            eid=parent[eid]
        return eid
    for p in decisions:
        if p['verdict']=='same':
            a,b=find(p['a']),find(p['b'])
            parent[max(a,b)]=min(a,b)
    conflicts={find(p['a']) for p in decisions if p['verdict']=='distinct' and find(p['a'])==find(p['b'])}
    groups=defaultdict(list)
    for event in events:
        groups[find(event['id'])].append(event['id'])
    dump(HERE/'deliverables/dedup-groups.json',[
        dict(canonical_id=key,members=ids,status='conflict_requires_review' if key in conflicts else 'model_equivalent' if len(ids)>1 else 'single_record')
        for key,ids in sorted(groups.items())])
    dump(HERE/'deliverables/dedup-decisions.json',decisions)


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command',choices=['prepare','run','export'])
    p.add_argument('--limit',type=int,default=1)
    args=p.parse_args()
    if args.command=='prepare':prepare()
    elif args.command=='run':run(args.limit)
    else:export_groups()
