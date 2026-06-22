export const DIRECT_VARIABLE_WRITE_DONE_EVENT = 'wuxia:directVariableWriteDone';

export type DirectVariableWriteSource = 'event-script' | 'variable-editor' | 'frontend' | 'restore';
export type DirectVariableWriteOperation = 'insert' | 'update' | 'delete' | 'assign' | 'replace';

export interface DirectVariableWriteMetadata {
  source: DirectVariableWriteSource;
  operation: DirectVariableWriteOperation;
  reason: string;
}

export interface DirectVariableWriteDoneDetail extends DirectVariableWriteMetadata {
  version: 1;
  writeId: string;
}

const createDirectVariableWriteId = (): string => {
  try {
    if (typeof crypto?.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export async function runDirectChatVariableWrite<TResult>(
  metadata: DirectVariableWriteMetadata,
  writer: () => TResult | Promise<TResult>,
): Promise<TResult> {
  const result = await writer();
  const eventDetail: DirectVariableWriteDoneDetail = {
    version: 1,
    writeId: createDirectVariableWriteId(),
    source: metadata.source,
    operation: metadata.operation,
    reason: metadata.reason,
  };

  await eventEmit(DIRECT_VARIABLE_WRITE_DONE_EVENT, eventDetail);

  return result;
}
