"""Run one fresh dsh source window per book concurrently with a single queue writer.

Each wave reserves the existing 90,000-token allowance per call before launch.
All calls drain before reading aggregate receipts, repairing evidence, or starting
another wave. Failed calls are never retried automatically.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
import time
import uuid
from pipeline import HERE, Corpus, dump
from orchestrate import call, decode, jsonl, prompt_for, validate, usage_total, TOTAL_TOKEN_LIMIT

RESERVE_PER_CALL = 90000


def select_wave(tasks, books, concurrency, used, token_limit=TOTAL_TOKEN_LIMIT):
    """Choose at most one pending window per book within the shared reservation."""
    if type(concurrency) is not int or not 1 <= concurrency <= 6:
        raise ValueError('parallel book count must be 1..6')
    if len(set(books)) != len(books):
        raise ValueError('book priority must be unique')
    slots = min(concurrency, max(0,(token_limit-used)//RESERVE_PER_CALL))
    chosen = []
    for book in books:
        if len(chosen) >= slots:
            break
        # A book with an in-flight or rejected window cannot advance independently.
        if any(t['book']==book and t['status'] in ['running','failed','needs_repair'] for t in tasks):
            continue
        task = next((t for t in tasks if t['book']==book and t['status']=='pending'),None)
        if task is not None:
            chosen.append(task)
    return chosen


def execute(task, prompt, allowed, corpus, call_id):
    """Write only this call's raw files; return validated data for the queue owner."""
    result = call(prompt, timeout=300, call_id=call_id)
    (HERE/'runs'/(call_id+'.stdout.txt')).write_text(result.text+'\n',encoding='utf-8')
    (HERE/'runs'/(call_id+'.stderr.txt')).write_text(result.stderr+'\n',encoding='utf-8')
    if not result.success:
        path=HERE/'runs'/(call_id+'.events.jsonl')
        receipts=jsonl(path) if path.exists() else []
        ending=next((e.get('data',{}).get('reason') for e in reversed(receipts) if e['type']=='turn/end'),None)
        raise RuntimeError('dsh failed: '+json.dumps(ending or {'exit_code':result.exit_code},ensure_ascii=False))
    checked=validate(task,decode(result.text),allowed,corpus)
    return checked,result.duration_ms


def run_wave(books, concurrency):
    """Own the queue lock for a complete parallel wave; persist each completed result."""
    lock=HERE/'.controller.lock'
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    os.write(fd,str(os.getpid()).encode());os.close(fd)
    try:
        tasks=json.loads((HERE/'queue.json').read_text(encoding='utf-8'))
        if any(t['status'] in ['running','failed','needs_repair'] for t in tasks):
            raise ValueError('resolve rejected or in-flight windows before parallel launch')
        before=usage_total()
        chosen=select_wave(tasks,books,concurrency,before['total'])
        if not chosen:
            if any(t['status']=='pending' for t in tasks):
                dump(HERE/'STOP.json',dict(reason='aggregate_token_limit',usage=before))
            return
        corpus=Corpus()
        cards={c['uid']:c for c in jsonl(HERE/'inventory/cards.jsonl')}
        prepared=[]
        for task in chosen:
            if corpus.hashes[task['book']] != task['source_sha256']:
                raise ValueError('source novel changed; re-plan before resuming')
            prompt,allowed=prompt_for(task,corpus,cards)
            call_id=f'review-{task["id"]}-a{task.get("attempts",0)+1}'
            if any((HERE/'runs'/(call_id+suffix)).exists() for suffix in ['.prompt.txt','.stdout.txt','.events.jsonl']):
                raise ValueError('call ID already has artifacts: '+call_id)
            prepared.append((task,prompt,allowed,call_id))
        wave_id=time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8]
        audit=HERE/'handoff/parallel-waves'/(wave_id+'.json')
        record=dict(pid=os.getpid(),status='running',task_ids=[t['id'] for t in chosen],
                    usage_before=before,reserved_tokens=len(chosen)*RESERVE_PER_CALL,outcomes=[])
        dump(audit,record)
        for task,prompt,allowed,call_id in prepared:
            task.update(status='running',attempts=task.get('attempts',0)+1)
            (HERE/'runs'/(call_id+'.prompt.txt')).write_text(prompt+'\n',encoding='utf-8')
        dump(HERE/'queue.json',tasks)
        print(json.dumps(dict(wave=wave_id,start=record['task_ids'],reserved=record['reserved_tokens']),ensure_ascii=False),flush=True)
        # Workers cannot mutate the task objects; the owner alone records terminal states.
        with ThreadPoolExecutor(max_workers=len(prepared)) as pool:
            futures={pool.submit(execute,dict(task),prompt,allowed,corpus,call_id):task
                     for task,prompt,allowed,call_id in prepared}
            for future in as_completed(futures):
                task=futures[future]
                try:
                    checked,duration=future.result()
                    dump(HERE/'results'/(task['id']+'.json'),checked)
                    task.update(status='reviewed' if not checked['validation_issues'] else 'needs_repair',
                                duration_ms=duration,event_count=len(checked['events']),issue_count=len(checked['validation_issues']))
                except Exception as error:
                    task.update(status='failed',error=str(error))
                dump(HERE/'queue.json',tasks)
                outcome={k:task[k] for k in ['id','status','event_count','issue_count','error'] if k in task}
                record['outcomes'].append(outcome)
                dump(audit,record)
                print(json.dumps(dict(done=outcome),ensure_ascii=False),flush=True)
        record.update(status='finished',usage_after=usage_total())
        dump(audit,record)
        failures=[t for t in chosen if t['status']=='failed']
        if failures:
            dump(HERE/'STOP.json',dict(reason='parallel_jobs_failed',failed=failures,usage=record['usage_after']))
        print(json.dumps(dict(wave_done=wave_id,usage=record['usage_after']),ensure_ascii=False),flush=True)
    finally:
        lock.unlink()
