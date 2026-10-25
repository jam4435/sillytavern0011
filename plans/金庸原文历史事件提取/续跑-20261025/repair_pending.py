"""Repair evidence locators between complete extraction waves.

Unique exact anchors receive corrected line numbers. Other rejected anchors can
be reselected by the fixed model from local source lines and must still pass the
original exact validator. Original outputs and accepted events are preserved.
"""
import json
import os
from pipeline import HERE, Corpus, dump, sha
from orchestrate import decode, jsonl, prompt_for, validate, usage_total


def corrected_reference(ref, allowed, corpus):
    """Find a unique verbatim anchor in the corpus and require supplied evidence."""
    matches = corpus.matches(ref['book'], ref['anchor'])
    if len(matches) != 1 or matches[0]['start'] != matches[0]['end']:
        raise ValueError('anchor must have one single-line exact match')
    line = matches[0]['start']
    if (ref['book'], line) not in allowed:
        raise ValueError('exact match outside supplied evidence')
    return {**ref, 'line': line}


def check_repair_ownership():
    """Permit offline repair or the owning supervisor between completed calls."""
    if (HERE/'.controller.lock').exists():
        raise ValueError('model call controller is still running')
    supervisor = HERE/'.supervisor.lock'
    if supervisor.exists() and supervisor.read_text(encoding='utf-8').strip() != str(os.getpid()):
        raise ValueError('another supervisor owns the queue')


def main():
    check_repair_ownership()
    tasks = json.loads((HERE/'queue.json').read_text(encoding='utf-8'))
    if any(t['status']=='running' for t in tasks):
        raise ValueError('running task prevents evidence repair')
    corpus = Corpus()
    cards = {c['uid']:c for c in jsonl(HERE/'inventory/cards.jsonl')}
    before_usage = usage_total()
    staged = []
    for task in tasks:
        if task['status'] != 'needs_repair':
            continue
        if corpus.hashes[task['book']] != task['source_sha256']:
            raise ValueError('source changed')
        call_id = f'review-{task["id"]}-a{task["attempts"]}'
        raw = HERE/'runs'/(call_id+'.stdout.txt')
        result_path = HERE/'results'/(task['id']+'.json')
        old = json.loads(result_path.read_text(encoding='utf-8'))
        payload = decode(raw.read_text(encoding='utf-8'))
        _, allowed = prompt_for(task,corpus,cards)
        changes = []
        repair_calls = []
        structured=any(i.get('error')!='anchor not present verbatim on source line' or 'new_event' not in i
                       for i in old['validation_issues'])
        if structured:
            from structured_repair import repair
            repair_id=f'structure-{call_id}'
            payload,patch=repair(task,payload,old['validation_issues'],allowed,corpus,cards,repair_id)
            changes.append(dict(method='model_repaired_rejected_entries',patch=patch))
            repair_calls.append(repair_id)
        for issue in ([] if structured else old['validation_issues']):
            if issue.get('error') != 'anchor not present verbatim on source line' or 'new_event' not in issue:
                raise ValueError('repair supports new-event misplaced exact anchors only')
            event = payload['new_events'][issue['new_event']-1]
            rejected=[]
            for i,ref in enumerate(event['evidence']):
                source_line = corpus.texts[ref['book']].splitlines()[ref['line']-1]
                if ref['anchor'] in source_line:
                    continue
                try:
                    fixed = corrected_reference(ref,allowed,corpus)
                except ValueError:
                    rejected.append(i)
                    continue
                event['evidence'][i] = fixed
                changes.append(dict(new_event=issue['new_event'],before=ref,after=fixed,
                    source_line=corpus.texts[fixed['book']].splitlines()[fixed['line']-1]))
            if rejected:
                from evidence_reselection import reselect
                repair_id=f'evidence-{call_id}-event{issue["new_event"]}'
                fixed_event,selected=reselect(task,issue['new_event'],event,rejected,allowed,corpus,repair_id)
                payload['new_events'][issue['new_event']-1]=fixed_event
                changes.extend(dict(new_event=issue['new_event'],method='model_reselected',**x) for x in selected)
                repair_calls.append(repair_id)
        checked = validate(task,payload,allowed,corpus)
        if checked['validation_issues'] or not changes:
            raise ValueError('repair did not clear evidence issues')
        previous = {e['id']:e for e in old['events']}
        current = {e['id']:e for e in checked['events']}
        if any(current.get(k)!=v for k,v in previous.items()):
            raise ValueError('previous accepted events changed')
        if not structured and len(current) != len(previous)+len(old['validation_issues']):
            raise ValueError('unexpected restored event count')
        audit = HERE/'handoff/evidence-repairs'/call_id
        if audit.exists():
            raise ValueError('repair audit already exists')
        staged.append((task,raw,result_path,payload,checked,changes,audit,repair_calls))
    # Stage every backup before replacing any queue result.
    for task,raw,path,payload,checked,changes,audit,repair_calls in staged:
        audit.mkdir(parents=True)
        (audit/'queue-before.json').write_bytes((HERE/'queue.json').read_bytes())
        (audit/'result-before.json').write_bytes(path.read_bytes())
        dump(audit/'payload.json',payload)
        dump(audit/'repair.json',dict(task_id=task['id'],raw_sha256=sha(raw),changes=changes,
             usage_before=before_usage,usage_after=usage_total(),repair_calls=repair_calls,validation_issues=checked['validation_issues'],
             semantic_scope=('Rejected entries semantically repaired by the required model; all accepted events unchanged.'
                             if any(c.get('method')=='model_repaired_rejected_entries' for c in changes)
                             else 'Evidence locators only; original model assertions remain subject to review.')))
    for task,raw,path,payload,checked,changes,audit,repair_calls in staged:
        dump(path,checked)
        task.update(status='reviewed',event_count=len(checked['events']),issue_count=0)
    if staged:
        dump(HERE/'queue.json',tasks)
    print(json.dumps(dict(repaired=[x[0]['id'] for x in staged],usage=usage_total()),ensure_ascii=False))


if __name__ == '__main__':
    lock=HERE/'.supervisor.lock'
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    os.write(fd,str(os.getpid()).encode());os.close(fd)
    try:
        main()
    finally:
        lock.unlink()
