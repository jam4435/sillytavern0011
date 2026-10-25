"""Advance the bounded dsh queues and keep a durable progress page after every job."""
from __future__ import annotations
import json
import os
import time
import traceback
import argparse
from pathlib import Path
from pipeline import HERE, dump
from orchestrate import run, usage_total, TOTAL_TOKEN_LIMIT
from export_results import assemble
from differ import prepare_diff, run_diff
import deduplicate
from repair_pending import main as repair_evidence
from parallel_source import run_wave

PRIORITY=['鹿鼎记','倚天屠龙记','笑傲江湖','天龙八部','射雕英雄传','神雕侠侣']


def read_queue(name):
    p=HERE/name
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else []


def state(status, phase, **details):
    dump(HERE/'supervisor-state.json',dict(pid=os.getpid(),status=status,phase=phase,
         updated_at=time.strftime('%Y-%m-%dT%H:%M:%S%z'),usage=usage_total(),**details))


def assert_freeze():
    from pipeline import SOURCE,sha
    for record in json.loads((HERE/'inventory/files.json').read_text(encoding='utf-8')):
        if sha(SOURCE/record['file'])!=record['sha256']:
            raise ValueError('legacy input changed: '+record['file'])


def main(parallel_books=1, source_waves=None):
    if not 1 <= parallel_books <= 6:
        raise ValueError('parallel book count must be 1..6')
    if source_waves is not None and source_waves < 1:
        raise ValueError('source wave limit must be positive')
    lock=HERE/'.supervisor.lock'
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    os.write(fd,str(os.getpid()).encode());os.close(fd)
    phase='source'
    waves=0
    try:
        assert_freeze()
        while True:
            if (HERE/'PAUSE').exists():
                state('paused','source',reason='PAUSE marker');return
            if usage_total()['total']+90000>TOTAL_TOKEN_LIMIT:
                state('stopped','source',reason='aggregate_token_limit');return
            tasks=read_queue('queue.json')
            failed=[t['id'] for t in tasks if t['status'] in ['running','failed']]
            if failed:
                state('needs_attention','source',failed=failed);return
            if any(t['status']=='needs_repair' for t in tasks):
                repair_evidence()
                assemble()
                tasks=read_queue('queue.json')
            book=next((book for book in PRIORITY if any(t['status']=='pending' and t['book']==book for t in tasks)),None)
            if book is None:
                break
            if parallel_books > 1:
                state('running','source',parallel_books=parallel_books,books=PRIORITY)
                run_wave(PRIORITY,parallel_books)
            else:
                state('running','source',book=book)
                run(1,[book])
            assemble()
            waves+=1
            if source_waves is not None and waves>=source_waves:
                state('paused','source',reason='bounded source wave completed');return
        if any(t['status']=='needs_repair' for t in read_queue('queue.json')):
            state('needs_attention','source',reason='source evidence repairs required before full completion')
            return
        phase='diff'
        prepare_diff()
        while any(j['status']=='pending' for j in read_queue('diff-queue.json')):
            if (HERE/'PAUSE').exists():
                state('paused',phase,reason='PAUSE marker');return
            if usage_total()['total']+90000>TOTAL_TOKEN_LIMIT:
                state('stopped',phase,reason='aggregate_token_limit');return
            if any(j['status'] in ['failed','running'] for j in read_queue('diff-queue.json')):
                state('needs_attention',phase,reason='comparison job failed');return
            state('running',phase)
            run_diff(1);assemble()
        phase='dedup'
        deduplicate.prepare()
        while any(j['status']=='pending' for j in read_queue('dedup-queue.json')):
            if (HERE/'PAUSE').exists():
                state('paused',phase,reason='PAUSE marker');return
            if usage_total()['total']+90000>TOTAL_TOKEN_LIMIT:
                state('stopped',phase,reason='aggregate_token_limit');return
            if any(j['status'] in ['failed','running'] for j in read_queue('dedup-queue.json')):
                state('needs_attention',phase,reason='dedup job failed');return
            state('running',phase)
            deduplicate.run(1);deduplicate.export_groups()
        deduplicate.export_groups()
        assert_freeze()
        summary=assemble()
        state('review_queues_finished',phase,summary=summary,
              note='Inspect unresolved questions, retrieval limits, and dedup conflicts before final acceptance.')
    except Exception as error:
        dump(HERE/'supervisor-error.json',dict(error=str(error),traceback=traceback.format_exc()))
        state('needs_attention',phase,error=str(error))
        raise
    finally:
        assemble()
        lock.unlink()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--parallel-books',type=int,choices=range(1,7),default=1)
    parser.add_argument('--source-waves',type=int,help='Stop after this many source waves for validation.')
    args=parser.parse_args()
    main(args.parallel_books,args.source_waves)
