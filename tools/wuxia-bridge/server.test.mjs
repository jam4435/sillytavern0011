// @vitest-environment node
import { io as createClient } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WUXIA_EVENTS,
  WUXIA_METHODS,
  WUXIA_PROTOCOL_VERSION,
  WUXIA_RELAY_DEFAULT_PORT,
  WUXIA_RELAY_DEFAULT_URL,
  createRequestId,
} from './protocol.mjs';
import { startWuxiaRelayServer } from './server.mjs';

const silentLogger = { info() {}, warn() {} };

describe('standalone wuxia relay server', () => {
  const clients = [];
  let server;

  afterEach(async () => {
    clients.splice(0).forEach(client => client.disconnect());
    await server?.close();
    server = undefined;
  });

  async function connect(url, role = 'cli') {
    const client = createClient(url, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      auth: { role, protocolVersion: WUXIA_PROTOCOL_VERSION },
    });
    clients.push(client);
    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    return client;
  }

  it('uses a port independent from the Tavern Helper watch server', () => {
    expect(WUXIA_RELAY_DEFAULT_PORT).toBe(6622);
    expect(WUXIA_RELAY_DEFAULT_URL).toBe('http://127.0.0.1:6622/wuxia');
  });

  it('serves status without starting webpack or a Tavern bridge', async () => {
    server = await startWuxiaRelayServer({ port: 0, logger: silentLogger });
    const cli = await connect(server.url);
    const request = { id: createRequestId('server-test'), method: WUXIA_METHODS.STATUS, params: {} };
    const response = await cli.timeout(2_000).emitWithAck(WUXIA_EVENTS.CALL, request);

    expect(response).toMatchObject({
      id: request.id,
      ok: true,
      result: { serverOnline: true, bridgeConnected: false, readyBridgeCount: 0 },
    });
  });

  it('does not broadcast Tavern Helper iframe refresh events', async () => {
    server = await startWuxiaRelayServer({ port: 0, logger: silentLogger });
    const rootUrl = server.url.replace(/\/wuxia$/, '');
    const client = await connect(rootUrl);
    const received = [];
    ['iframe_updated', 'message_iframe_updated', 'script_iframe_updated'].forEach(eventName => {
      client.on(eventName, () => received.push(eventName));
    });

    await new Promise(resolve => setTimeout(resolve, 30));
    expect(received).toEqual([]);
  });
});
