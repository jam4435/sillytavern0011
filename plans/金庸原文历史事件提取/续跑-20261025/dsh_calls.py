"""Use the repository's dsh headless runner with the installed CodeBuddy adapter."""
from __future__ import annotations
import json
import os
import re
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
HARNESS = Path('F:/deepseek-harness')
sys.path.insert(0, str(HARNESS))
from scripts.run_task import run_task


def prepare_overlay(call_id):
    """Disable actual tool rows, then mount only the account provider and request cap."""
    base = (HARNESS / 'packages/bundle/base/cordis.patch.yml').read_text(encoding='utf-8')
    ids = re.findall(r'^    - id: (\S+)', base, re.M)
    disabled = [i for i in ids if i.startswith('tool-') or i in {
        'agent-instructions', 'skill-filesystem', 'plan-mode', 'session-title-llm',
        'session-telemetry-otel', 'session-log-deepseek', 'plugin-package-inventory-deepseek',
        'llm-retry'}]
    blocks = [f'- id: {i}\n  disabled: true' for i in disabled]
    blocks += ['- id: credentials\n  disabled: false\n  config:\n    watch: false',
               '- id: agent-default-model\n  config:\n    provider: buddy\n    model: deepseek-v4.1-flash\n    reasoningEffort: low',
               '- id: system-prompt\n  config:\n    personaPrefix: >-\n      你是原文历史事件资料核验员。只处理用户提供的材料；工具和外部知识不可用。只输出要求的 JSON。',
               '- insert:\n    - id: wuxia-provider\n      name: file:///C:/Users/DELL/.dsh/profiles/web/node_modules/dsh-providers-hub/lib/index.js\n'
               '    - id: wuxia-bounded-call\n      name: ' + (HERE / 'bounded-call.mjs').as_uri() + '\n      config:\n        maxTokens: 32768\n        eventLog: ' + json.dumps(str(HERE / 'runs' / (call_id + '.events.jsonl')), ensure_ascii=False)]
    (HERE / 'runs').mkdir(exist_ok=True)
    p = HERE / 'runs' / (call_id + '.patch.yml')
    p.write_text('\n\n'.join(blocks) + '\n', encoding='utf-8')
    return p


def call(prompt: str, timeout=240, call_id=None):
    """Start a fresh dsh Session; never adopt a previous extraction Session."""
    call_id = call_id or str(uuid.uuid4())
    overlay = prepare_overlay(call_id)
    # The existing runner transfers the long task via a temporary YAML file.
    # A model route is explicit; account credentials remain in the installed provider.
    result = run_task(prompt=prompt, provider='buddy', model='deepseek-v4.1-flash',
                      preset=str(overlay), cwd=HARNESS, harness_dir=HARNESS, timeout=timeout,
                      env={'DSH_OPENAI_GATEWAY_ENABLED': '0', 'PYTHONUTF8': '1'})
    return result


if __name__ == '__main__':
    result = call('只输出这个 JSON，不加代码围栏：{"ok":true,"route":"buddy/deepseek-v4.1-flash"}', timeout=150)
    (HERE / 'smoke.stdout.txt').write_text(result.text + '\n', encoding='utf-8')
    (HERE / 'smoke.stderr.txt').write_text(result.stderr + '\n', encoding='utf-8')
    print(json.dumps(dict(success=result.success, exit_code=result.exit_code,
                          duration_ms=result.duration_ms, text=result.text[-600:],
                          stderr_tail=result.stderr[-1500:]), ensure_ascii=False))
