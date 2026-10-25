"""Repair uniquely exact misplaced evidence lines while the controller is stopped.

Only evidence line numbers change. Original outputs, accepted events, and usage
are preserved; rewritten or ambiguous anchors require a separate review.
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
        for issue in old['validation_issues']:
            if issue.get('error') != 'anchor not present verbatim on source line' or 'new_event' not in issue:
                raise ValueError('repair supports new-event misplaced exact anchors only')
            event = payload['new_events'][issue['new_event']-1]
            for i,ref in enumerate(event['evidence']):
                source_line = corpus.texts[ref['book']].splitlines()[ref['line']-1]
                if ref['anchor'] in source_line:
                    continue
                fixed = corrected_reference(ref,allowed,corpus)
                event['evidence'][i] = fixed
                changes.append(dict(new_event=issue['new_event'],before=ref,after=fixed,
                    source_line=corpus.texts[fixed['book']].splitlines()[fixed['line']-1]))
        checked = validate(task,payload,allowed,corpus)
        if checked['validation_issues'] or not changes:
            raise ValueError('repair did not clear evidence issues')
        previous = {e['id']:e for e in old['events']}
        current = {e['id']:e for e in checked['events']}
        if any(current.get(k)!=v for k,v in previous.items()):
            raise ValueError('previous accepted events changed')
        if len(current) != len(previous)+len(old['validation_issues']):
            raise ValueError('unexpected restored event count')
        audit = HERE/'handoff/evidence-repairs'/call_id
        if audit.exists():
            raise ValueError('repair audit already exists')
        staged.append((task,raw,result_path,payload,checked,changes,audit))
    # Stage every backup before replacing any queue result.
    for task,raw,path,payload,checked,changes,audit in staged:
        audit.mkdir(parents=True)
        (audit/'queue-before.json').write_bytes((HERE/'queue.json').read_bytes())
        (audit/'result-before.json').write_bytes(path.read_bytes())
        dump(audit/'payload.json',payload)
        dump(audit/'repair.json',dict(task_id=task['id'],raw_sha256=sha(raw),changes=changes,
             usage_before=before_usage,validation_issues=checked['validation_issues'],
             semantic_scope='Only coordinates repaired; original model assertions remain subject to review.'))
    for task,raw,path,payload,checked,changes,audit in staged:
        dump(path,checked)
        task.update(status='reviewed',event_count=len(checked['events']),issue_count=0)
    if staged:
        dump(HERE/'queue.json',tasks)
    assert usage_total() == before_usage
    print(json.dumps(dict(repaired=[x[0]['id'] for x in staged],usage=before_usage),ensure_ascii=False))


if __name__ == '__main__':
    main()
