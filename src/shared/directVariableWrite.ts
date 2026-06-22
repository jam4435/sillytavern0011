export const DIRECT_VARIABLE_WRITE_DONE_EVENT = 'wuxia:directVariableWriteDone';

export type DirectVariableWriteSource = 'variable-editor' | 'event-script';
export type DirectVariableWriteOperation = 'insert' | 'update' | 'delete' | 'assign' | 'apply-leaf-changes';

export interface DirectVariableWriteMetadata<TDetail = unknown> {
  source: DirectVariableWriteSource;
  operation: DirectVariableWriteOperation;
  detail: TDetail;
}

export interface DirectVariableWriteDoneDetail<TDetail = unknown> extends DirectVariableWriteMetadata<TDetail> {
  variables: Record<string, unknown>;
  statData: Record<string, unknown>;
}

export interface DirectVariableWriteResult<TDetail = unknown> {
  variables: Record<string, unknown>;
  statData: Record<string, unknown>;
  eventDetail: DirectVariableWriteDoneDetail<TDetail>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T,>(value: T): T => {
  if (value === undefined) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

const getDirectChatStatData = (variables: Record<string, unknown>): Record<string, unknown> =>
  isRecord(variables.stat_data) ? cloneJson(variables.stat_data) : {};

export async function runDirectChatVariableWrite<TDetail>(
  metadata: DirectVariableWriteMetadata<TDetail>,
  writer: () => Record<string, unknown> | Promise<Record<string, unknown>>,
): Promise<DirectVariableWriteResult<TDetail>> {
  const savedVariables = await writer();
  const variables = isRecord(savedVariables) ? savedVariables : {};
  const statData = getDirectChatStatData(variables);
  const eventDetail: DirectVariableWriteDoneDetail<TDetail> = {
    source: metadata.source,
    operation: metadata.operation,
    detail: cloneJson(metadata.detail),
    variables: cloneJson(variables),
    statData,
  };

  await eventEmit(DIRECT_VARIABLE_WRITE_DONE_EVENT, eventDetail);

  return {
    variables,
    statData,
    eventDetail,
  };
}
