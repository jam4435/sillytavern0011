"""Revalidate both chapter-34 child calls before resuming the controller."""
import json

from pipeline import HERE, Corpus, dump, sha
from orchestrate import decode, jsonl, prompt_for, usage_total, validate
from export_results import assemble
from supervise import assert_freeze


def main():
    """Require accepted child output, unchanged history, and matching accounting."""
    assert not (HERE / '.controller.lock').exists()
    assert not (HERE / '.supervisor.lock').exists()
    tasks = json.loads((HERE / 'queue.json').read_text(encoding='utf-8'))
    assert not any(t['status'] in ['failed', 'running', 'needs_repair'] for t in tasks)
    audit = HERE / 'handoff' / 'max-tokens-鹿鼎-034-01'
    split = json.loads((audit / 'split.json').read_text(encoding='utf-8'))
    second_split = json.loads((HERE / 'handoff' / 'max-tokens-鹿鼎-034-01b' / 'split.json').read_text(encoding='utf-8'))
    for snapshot in [split, second_split]:
        for path, digest in {**snapshot['historical_receipts'], **snapshot['parent_files']}.items():
            assert sha(HERE / path) == digest, path
    corpus = Corpus()
    receipts = []
    failed_events = jsonl(HERE / 'runs' / 'review-鹿鼎-034-01b-a1.events.jsonl')
    assert [e['data']['reason']['kind'] for e in failed_events if e['type'] == 'turn/end'] == ['max-tokens']
    added_tokens = sum(e['data']['usage'].get(k, 0) for e in failed_events
                       if e['type'] == 'assistant/message'
                       for k in ['inputTokens', 'cacheReadTokens', 'outputTokens'])
    children = [split['children'][0], *second_split['children']]
    assert [n for c in children for n in range(c['start'], c['end'] + 1)] == list(range(15263, 15497))
    before_tasks = json.loads((audit / 'queue-before.json').read_text(encoding='utf-8'))
    assert [t for t in before_tasks if t['id'] != '鹿鼎-034-01'] == [
        t for t in tasks if t['id'] not in {c['id'] for c in children}]
    for child in children:
        task = next(t for t in tasks if t['id'] == child['id'])
        assert task['status'] == 'reviewed'
        assert task['attempts'] == 1
        assert corpus.hashes[task['book']] == task['source_sha256']
        prompt, allowed = prompt_for(child, corpus, {})
        call_id = 'review-' + task['id'] + '-a1'
        events = jsonl(HERE / 'runs' / (call_id + '.events.jsonl'))
        header = [e['data'] for e in events if e['type'] == 'request/header']
        assert len(header) == 1
        assert header[0]['config'] == dict(provider='buddy', model='deepseek-v4.1-flash',
                                          reasoningEffort='low', maxTokens=32768)
        assert header[0]['toolCount'] == 0
        assert len([e for e in events if e['type'] == 'step/start']) == 1
        assert [e['data']['reason']['kind'] for e in events if e['type'] == 'turn/end'] == ['completed']
        messages = [e for e in events if e['type'] == 'assistant/message']
        assert len(messages) == 1
        usage = messages[0]['data']['usage']
        added_tokens += sum(usage.get(k, 0) for k in ['inputTokens', 'cacheReadTokens', 'outputTokens'])
        payload = decode((HERE / 'runs' / (call_id + '.stdout.txt')).read_text(encoding='utf-8'))
        checked = validate(task, payload, allowed, corpus)
        assert checked['validation_issues'] == []
        assert checked == json.loads((HERE / 'results' / (task['id'] + '.json')).read_text(encoding='utf-8'))
        receipts.append(dict(call_id=call_id, events=events, event_count=len(checked['events'])))
    assert len({r['events'][0]['sessionId'] for r in receipts}) == 3
    assert usage_total()['total'] == split['usage']['total'] + added_tokens
    assert_freeze()
    progress = assemble()
    report = dict(checks_passed=True, historical_receipts_unchanged=True, receipts=receipts,
                  child_tokens_including_failed=added_tokens, failed_child_receipt=failed_events,
                  coverage_exact=True, usage=usage_total(), progress=progress)
    dump(audit / 'child-acceptance.json', report)
    print(json.dumps(dict(checks_passed=True, child_tokens=added_tokens,
                          usage=usage_total(), progress=progress), ensure_ascii=False))


if __name__ == '__main__':
    main()
