"""Restore omitted book segments in review IDs without changing semantic decisions.

Only an exact shortened spelling derived from a supplied full UID is accepted.
The complete UID set and all evidence must pass the original validator before
the failed result is accepted. Missing or duplicate reviews remain rejected.
"""
import json
import re
from pipeline import HERE, Corpus, dump, sha
from orchestrate import decode, jsonl, prompt_for, validate, usage_total
from repair_pending import check_repair_ownership

ERROR='legacy review missing, duplicate, or unknown uid'


def restore_ids(reviews, expected):
    """Return review copies only when supplied full IDs determine a bijection."""
    if not isinstance(reviews,list) or len(reviews)!=len(expected) or len(set(expected))!=len(expected):
        raise ValueError('review counts must match unique supplied IDs')
    result=[];changes=[]
    for review in reviews:
        uid=review.get('uid')
        if uid in expected:
            result.append(dict(review));continue
        candidates=[]
        for full in expected:
            path,marker=full.rsplit('#',1)
            match=re.fullmatch(r'EV-[^-]+-(\d+)',marker)
            if match and uid==path+'#EV-'+match[1]:
                candidates.append(full)
        if len(candidates)!=1:
            raise ValueError('short ID must name exactly one supplied full ID')
        result.append({**review,'uid':candidates[0]})
        changes.append(dict(before=uid,after=candidates[0]))
    if sorted(r['uid'] for r in result)!=sorted(expected):
        raise ValueError('reviews must cover every supplied ID exactly once')
    return result,changes


def main():
    check_repair_ownership()
    tasks=json.loads((HERE/'queue.json').read_text(encoding='utf-8'))
    if any(t['status']=='running' for t in tasks):
        raise ValueError('running task prevents review ID repair')
    corpus=Corpus();cards={c['uid']:c for c in jsonl(HERE/'inventory/cards.jsonl')}
    before=usage_total();staged=[]
    for task in tasks:
        if task['status']!='failed' or task.get('error')!=ERROR:
            continue
        if corpus.hashes[task['book']]!=task['source_sha256']:
            raise ValueError('source changed')
        call_id=f'review-{task["id"]}-a{task["attempts"]}'
        raw=HERE/'runs'/(call_id+'.stdout.txt')
        payload=decode(raw.read_text(encoding='utf-8'))
        payload['reviews'],changes=restore_ids(payload.get('reviews'),task['legacy_uids'])
        if not changes:
            raise ValueError('failed task has no shortened IDs to repair')
        _,allowed=prompt_for(task,corpus,cards)
        checked=validate(task,payload,allowed,corpus)
        if checked['validation_issues']:
            raise ValueError(checked['validation_issues'])
        result=HERE/'results'/(task['id']+'.json')
        if result.exists():
            raise ValueError('failed task already has a result; inspect before replacing it')
        audit=HERE/'handoff/review-id-repairs'/call_id
        if audit.exists():
            raise ValueError('repair audit already exists')
        staged.append((task,checked,payload,changes,raw,result,audit))
    for task,checked,payload,changes,raw,result,audit in staged:
        audit.mkdir(parents=True)
        (audit/'queue-before.json').write_bytes((HERE/'queue.json').read_bytes())
        dump(audit/'payload.json',payload)
        dump(audit/'repair.json',dict(task_id=task['id'],changes=changes,
             raw_sha256=sha(raw),usage_before=before,validation_issues=[],
             scope='Only supplied review identifiers restored; semantic decisions unchanged.'))
    for task,checked,payload,changes,raw,result,audit in staged:
        dump(result,checked)
        task.update(status='reviewed',event_count=len(checked['events']),issue_count=0)
        del task['error']
    if staged:dump(HERE/'queue.json',tasks)
    assert usage_total()==before
    print(json.dumps(dict(repaired=[s[0]['id'] for s in staged],usage=before),ensure_ascii=False))


if __name__=='__main__':
    main()
