"""Validate the smaller Tianlong trial and the unchanged work queue before resuming."""
from collections import Counter
import json

from pipeline import HERE, Corpus, dump, sha
from orchestrate import anchor_for, decode, jsonl, prompt_for, usage_total, validate
from export_results import assemble
from supervise import assert_freeze


def main():
    """Require exact coverage, card ownership, raw-output acceptance and retained history."""
    assert not any((HERE / name).exists() for name in ['.controller.lock', '.supervisor.lock'])
    audit = HERE / 'handoff' / 'max-tokens-天龙-007-01'
    split = json.loads((audit / 'split.json').read_text(encoding='utf-8'))
    tasks = json.loads((HERE / 'queue.json').read_text(encoding='utf-8'))
    before = json.loads((audit / 'queue-before.json').read_text(encoding='utf-8'))
    ids = {c['id'] for c in split['children']}
    assert [t for t in tasks if t['id'] not in ids] == [t for t in before if t['id'] != split['parent']['id']]
    assert not any(t['status'] in ['failed', 'running', 'needs_repair'] for t in tasks)
    for path, digest in {**split['historical_receipts'], **split['parent_files']}.items():
        assert sha(HERE / path) == digest, path
    children = [t for t in tasks if t['id'] in ids]
    assert [n for c in children for n in range(c['start'], c['end'] + 1)] == list(range(2615, 2859))
    assert Counter(uid for c in children for uid in c['legacy_uids']) == Counter(split['parent']['legacy_uids'])
    cards = {c['uid']: c for c in jsonl(HERE / 'inventory/cards.jsonl') if c['uid'] in split['parent']['legacy_uids']}
    for c in children:
        assert all(c['start'] <= anchor_for(cards[uid]) <= c['end'] for uid in c['legacy_uids'])
    task = next(t for t in children if t['id'] == '天龙-007-01a')
    assert task['status'] == 'reviewed' and task['attempts'] == 1
    assert all(t == original for t, original in zip(children[1:], split['children'][1:]))
    corpus = Corpus()
    _, allowed = prompt_for(task, corpus, cards)
    call_id = 'review-天龙-007-01a-a1'
    events = jsonl(HERE / 'runs' / (call_id + '.events.jsonl'))
    headers = [e['data'] for e in events if e['type'] == 'request/header']
    assert len(headers) == 1 and headers[0]['toolCount'] == 0
    assert headers[0]['config'] == dict(provider='buddy', model='deepseek-v4.1-flash', reasoningEffort='low', maxTokens=32768)
    assert len({e['sessionId'] for e in events}) == 1
    assert len([e for e in events if e['type'] == 'step/start']) == 1
    assert [e['data']['reason']['kind'] for e in events if e['type'] == 'turn/end'] == ['completed']
    messages = [e for e in events if e['type'] == 'assistant/message']
    assert len(messages) == 1
    added = sum(messages[0]['data']['usage'].get(k, 0) for k in ['inputTokens', 'cacheReadTokens', 'outputTokens'])
    payload = decode((HERE / 'runs' / (call_id + '.stdout.txt')).read_text(encoding='utf-8'))
    checked = validate(task, payload, allowed, corpus)
    assert checked['validation_issues'] == []
    assert checked == json.loads((HERE / 'results' / (task['id'] + '.json')).read_text(encoding='utf-8'))
    assert usage_total()['total'] == split['usage']['total'] + added
    assert_freeze()
    progress = assemble()
    dump(audit / 'trial-acceptance.json', dict(checks_passed=True, coverage_exact=True, card_ownership_exact=True,
         other_tasks_unchanged=True, historical_receipts_unchanged=True, receipt=events,
         trial_tokens=added, usage=usage_total(), progress=progress))
    print(json.dumps(dict(checks_passed=True, trial_tokens=added, progress=progress), ensure_ascii=False))


if __name__ == '__main__':
    main()
