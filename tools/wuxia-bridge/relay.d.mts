import type { Server } from 'socket.io';

export function attachWuxiaAutomationRelay(
  io: Server,
  options?: {
    namespace?: string;
    token?: string;
    allowedOrigins?: string;
    snapshotTimeoutMs?: number;
    turnTimeoutMs?: number;
    logger?: Pick<Console, 'info' | 'warn'>;
  },
): {
  namespace: ReturnType<Server['of']>;
  getStatus(): Record<string, unknown>;
  dispose(): void;
};
