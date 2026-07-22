#!/usr/bin/env node
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import { WUXIA_RELAY_DEFAULT_HOST, WUXIA_RELAY_DEFAULT_PORT, WUXIA_SOCKET_NAMESPACE } from './protocol.mjs';
import { attachWuxiaAutomationRelay } from './relay.mjs';

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError('WUXIA_RELAY_PORT 必须是 0-65535 范围内的整数。');
  }
  return port;
}

export async function startWuxiaRelayServer(options = {}) {
  const host = String(options.host ?? process.env.WUXIA_RELAY_HOST ?? WUXIA_RELAY_DEFAULT_HOST).trim();
  const port = normalizePort(options.port ?? process.env.WUXIA_RELAY_PORT ?? WUXIA_RELAY_DEFAULT_PORT);
  const logger = options.logger ?? console;
  const httpServer = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, service: 'wuxia-relay' }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    maxHttpBufferSize: 16 * 1024 * 1024,
  });
  const relay = attachWuxiaAutomationRelay(io, {
    token: options.token ?? process.env.WUXIA_BRIDGE_TOKEN,
    allowedOrigins: options.allowedOrigins ?? process.env.WUXIA_BRIDGE_ALLOWED_ORIGINS,
    logger,
  });

  try {
    await new Promise((resolve, reject) => {
      const onError = error => {
        httpServer.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off('error', onError);
        resolve();
      };
      httpServer.once('error', onError);
      httpServer.once('listening', onListening);
      httpServer.listen(port, host);
    });
  } catch (error) {
    relay.dispose();
    io.close();
    throw error;
  }

  const address = httpServer.address();
  const listeningPort = typeof address === 'object' && address ? address.port : port;
  let closed = false;

  return {
    host,
    port: listeningPort,
    url: `http://${host}:${listeningPort}${WUXIA_SOCKET_NAMESPACE}`,
    io,
    relay,
    async close() {
      if (closed) return;
      closed = true;
      relay.dispose();
      await new Promise(resolve => io.close(resolve));
    },
  };
}

async function runStandaloneServer() {
  try {
    const server = await startWuxiaRelayServer();
    console.info(`[wuxia-relay] 已启动 ${server.url}`);
    console.info('[wuxia-relay] 仅转发 status/snapshot/runTurn，不会发送 iframe 刷新事件。');

    let closing = false;
    const close = async signal => {
      if (closing) return;
      closing = true;
      console.info(`[wuxia-relay] 收到 ${signal}，正在关闭。`);
      await server.close();
    };
    process.once('SIGINT', () => void close('SIGINT'));
    process.once('SIGTERM', () => void close('SIGTERM'));
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : '';
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      code === 'EADDRINUSE'
        ? `[wuxia-relay] 端口已被占用。请停止占用进程，或设置 WUXIA_RELAY_PORT 后重试。\n${detail}`
        : `[wuxia-relay] 启动失败：${detail}`,
    );
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entryPath) {
  await runStandaloneServer();
}
