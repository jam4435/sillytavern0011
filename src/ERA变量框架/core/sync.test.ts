import { describe, expect, it } from 'vitest';

import { collectReachableMessageKeys, pruneUnreachableEditLogs } from './sync';

const era = (mk: string) =>
  `<era_data>{"era-message-key"="${mk}","era-message-type"="assistant"}</era_data>\n正文`;

describe('ERA EditLog reachability cleanup', () => {
  it('keeps active and non-current swipe MKs, removing only truly unreachable logs', () => {
    const messages = [
      {
        message_id: 1,
        role: 'assistant',
        mes: era('mk-active'),
        message: era('mk-active'),
        swipe_id: 1,
        swipes: [era('mk-alt'), era('mk-active')],
      },
    ];
    const meta = {
      EditLogs: {
        'mk-active': [{ op: 'update' }],
        'mk-alt': [{ op: 'update' }],
        'mk-orphan': [{ op: 'update' }],
      },
    };

    const reachable = collectReachableMessageKeys(messages, ['mk-active']);
    expect([...reachable].sort()).toEqual(['mk-active', 'mk-alt']);

    expect(pruneUnreachableEditLogs(meta, messages, ['mk-active'])).toEqual(['mk-orphan']);
    expect(Object.keys(meta.EditLogs).sort()).toEqual(['mk-active', 'mk-alt']);
  });

  it('conservatively keeps SelectedMks even if the host message shape is incomplete', () => {
    const meta = {
      EditLogs: {
        'mk-selected': [],
        'mk-orphan': [],
      },
    };

    expect(pruneUnreachableEditLogs(meta, [], ['mk-selected'])).toEqual(['mk-orphan']);
    expect(Object.keys(meta.EditLogs)).toEqual(['mk-selected']);
  });
});
