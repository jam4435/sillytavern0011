import type { SummaryApiConfig, SummaryApiMode, SummarySettings } from './settingsManager';

const CUSTOM_GENERATE_URL = '/api/backends/chat-completions/generate';
const STATUS_URL = '/api/backends/chat-completions/status';
const DEFAULT_TIMEOUT_MS = 360000;
const DEFAULT_CUSTOM_MAX_TOKENS = 4096;

interface SummaryRequestOptions {
  prompt: string;
  settings: SummarySettings;
  timeoutMs?: number;
}

export interface ConfiguredTextRequestSettings {
  apiMode: SummaryApiMode;
  apiConfig: SummaryApiConfig;
  stream?: boolean;
}

export interface ConfiguredTextRequestOptions {
  prompt: string;
  settings: ConfiguredTextRequestSettings;
  timeoutMs?: number;
  shouldStream?: boolean;
  generationIdPrefix?: string;
}

interface SummaryCustomApi {
  apiurl?: string;
  key?: string;
  model?: string;
  source?: string;
}

interface SillyTavernApiLike {
  getRequestHeaders: () => Record<string, string>;
}

interface StatusRequestAttempt {
  label: string;
  body: Record<string, string>;
}

function buildGenerationId(prefix = 'wuxia-summary'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeModelName(model: string | undefined): string {
  return typeof model === 'string' ? model.replace(/^models\//, '').trim() : '';
}

function normalizeSource(source: string | undefined): string {
  return (source || 'openai').trim() || 'openai';
}

function isCustomSource(source: string | undefined): boolean {
  return normalizeSource(source) === 'custom';
}

function getGenerateRawFn(): typeof generateRaw | null {
  return typeof generateRaw === 'function' ? generateRaw : null;
}

function getStopGenerationByIdFn(): typeof stopGenerationById | null {
  return typeof stopGenerationById === 'function' ? stopGenerationById : null;
}

function getSillyTavernApi(): SillyTavernApiLike | null {
  const parentWindow = typeof window.parent !== 'undefined'
    ? (window.parent as Window & { SillyTavern?: SillyTavernApiLike })
    : null;
  const localSillyTavern = typeof SillyTavern !== 'undefined'
    ? (SillyTavern as SillyTavernApiLike)
    : null;

  return localSillyTavern || parentWindow?.SillyTavern || null;
}

function parseStreamingChunk(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return '';
  }

  const payload = trimmed.slice(5).trim();
  if (!payload || payload === '[DONE]') {
    return '';
  }

  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string }; text?: string }>;
      content?: string;
    };
    return parsed.choices?.[0]?.delta?.content
      || parsed.choices?.[0]?.message?.content
      || parsed.choices?.[0]?.text
      || parsed.content
      || '';
  } catch {
    return '';
  }
}

function extractResponseContent(rawText: string, parsedData: unknown): string {
  const data = parsedData as {
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    content?: string;
  } | null;

  if (data?.choices?.[0]?.message?.content) {
    return data.choices[0].message.content.trim();
  }
  if (data?.choices?.[0]?.text) {
    return data.choices[0].text.trim();
  }
  if (typeof data?.content === 'string') {
    return data.content.trim();
  }

  return rawText.split(/\r?\n/).map(parseStreamingChunk).join('').trim();
}

function extractTextResponse(response: string | GenerateToolCallResult): string {
  if (typeof response === 'string' && response.trim()) {
    return response.trim();
  }
  throw new Error('AI 返回为空或不是文本内容');
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybeError = error as { name?: string; message?: string };
  return maybeError.name === 'AbortError' || /aborted|abort/i.test(maybeError.message || '');
}

export function validateSummaryApiConfig(
  apiConfig: SummaryApiConfig,
  { requireModel = true }: { requireModel?: boolean } = {},
): string {
  if (!apiConfig.key.trim()) {
    return '覆盖 API 配置时必须填写 API Key。';
  }
  if (requireModel && !apiConfig.model.trim()) {
    return '覆盖 API 配置时必须填写 Model。';
  }
  if (isCustomSource(apiConfig.source) && !apiConfig.apiurl.trim()) {
    return '自定义 OpenAI 兼容渠道必须填写 API URL。';
  }
  return '';
}

function buildGenerateRawConfig({
  prompt,
  generationId,
  customApi,
  shouldStream,
}: {
  prompt: string;
  generationId: string;
  customApi: SummaryCustomApi | null;
  shouldStream: boolean;
}): GenerateRawConfig {
  const config: GenerateRawConfig = {
    generation_id: generationId,
    should_silence: true,
    should_stream: shouldStream,
    ordered_prompts: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    overrides: {
      world_info_before: '',
      world_info_after: '',
      persona_description: '',
      char_description: '',
      char_personality: '',
      scenario: '',
      dialogue_examples: '',
      chat_history: {
        with_depth_entries: false,
        author_note: '',
        prompts: [],
      },
    },
    max_chat_history: 0,
  };

  if (customApi) {
    config.custom_api = customApi;
  }

  return config;
}

function buildCustomGenerateBody({
  prompt,
  apiConfig,
  shouldStream,
}: {
  prompt: string;
  apiConfig: SummaryApiConfig;
  shouldStream: boolean;
}): Record<string, unknown> {
  return {
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    model: normalizeModelName(apiConfig.model),
    max_tokens: DEFAULT_CUSTOM_MAX_TOKENS,
    temperature: 0.7,
    top_p: 0.95,
    stream: shouldStream,
    chat_completion_source: 'custom',
    group_names: [],
    include_reasoning: false,
    reasoning_effort: 'medium',
    enable_web_search: false,
    request_images: false,
    custom_prompt_post_processing: 'strict',
    reverse_proxy: apiConfig.apiurl,
    proxy_password: '',
    custom_url: apiConfig.apiurl,
    custom_include_headers: apiConfig.key ? `Authorization: Bearer ${apiConfig.key}` : '',
  };
}

async function requestCustomChatCompletion({
  prompt,
  apiConfig,
  shouldStream,
  timeoutMs,
}: {
  prompt: string;
  apiConfig: SummaryApiConfig;
  shouldStream: boolean;
  timeoutMs: number;
}): Promise<string> {
  const stApi = getSillyTavernApi();
  if (!stApi || typeof stApi.getRequestHeaders !== 'function') {
    throw new Error('当前环境没有可用的 SillyTavern.getRequestHeaders()');
  }

  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(() => controller.abort('timeout'), timeoutMs);

  try {
    const response = await fetch(CUSTOM_GENERATE_URL, {
      method: 'POST',
      headers: { ...stApi.getRequestHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(buildCustomGenerateBody({ prompt, apiConfig, shouldStream })),
      signal: controller.signal,
    });

    const rawText = await response.text();
    if (!response.ok) {
      const message = rawText.trim() || response.statusText || `HTTP ${response.status}`;
      throw new Error(message);
    }

    let parsedData: unknown = null;
    try {
      parsedData = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsedData = null;
    }

    const content = extractResponseContent(rawText, parsedData);
    if (!content) {
      throw new Error('API 返回内容为空');
    }
    return content;
  } catch (error) {
    if (isAbortError(error)) {
      if (controller.signal.reason === 'timeout') {
        throw new Error(`AI 请求超时（${Math.ceil(timeoutMs / 1000)}s）`);
      }
      throw new Error('已停止生成');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}

function resolveConfiguredCustomApi(settings: ConfiguredTextRequestSettings): SummaryCustomApi | null {
  if (settings.apiMode !== 'custom') {
    return null;
  }

  const apiConfig = settings.apiConfig;
  const validationMessage = validateSummaryApiConfig(apiConfig, { requireModel: true });
  if (validationMessage) {
    throw new Error(validationMessage);
  }

  const source = normalizeSource(apiConfig.source);
  const model = normalizeModelName(apiConfig.model);
  if (isCustomSource(source)) {
    return {
      apiurl: apiConfig.apiurl.trim(),
      key: apiConfig.key.trim(),
      model,
      source: 'custom',
    };
  }

  return {
    key: apiConfig.key.trim(),
    model,
    source,
  };
}

export async function requestConfiguredText({
  prompt,
  settings,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  shouldStream = Boolean(settings.stream),
  generationIdPrefix = 'wuxia-summary',
}: ConfiguredTextRequestOptions): Promise<string> {
  const customApi = resolveConfiguredCustomApi(settings);

  if (customApi?.source === 'custom') {
    return requestCustomChatCompletion({
      prompt,
      apiConfig: settings.apiConfig,
      shouldStream,
      timeoutMs,
    });
  }

  const invoke = getGenerateRawFn();
  if (typeof invoke !== 'function') {
    throw new Error('当前环境没有可用的 generateRaw()');
  }

  const generationId = buildGenerationId(generationIdPrefix);
  const stopGeneration = getStopGenerationByIdFn();
  let timeoutHandle: number | null = null;

  try {
    const response = await Promise.race([
      Promise.resolve(invoke(buildGenerateRawConfig({
        prompt,
        generationId,
        customApi,
        shouldStream,
      }))),
      new Promise<never>((_, reject) => {
        timeoutHandle = window.setTimeout(() => {
          stopGeneration?.(generationId);
          reject(new Error(`AI 请求超时（${Math.ceil(timeoutMs / 1000)}s）`));
        }, timeoutMs);
      }),
    ]);

    return extractTextResponse(response);
  } finally {
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  }
}

export async function requestSummaryText({
  prompt,
  settings,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: SummaryRequestOptions): Promise<string> {
  return requestConfiguredText({
    prompt,
    settings,
    timeoutMs,
    shouldStream: settings.stream,
    generationIdPrefix: 'wuxia-summary',
  });
}

function parseModelListPayload(data: unknown): string[] {
  const payload = data && typeof data === 'object' && !Array.isArray(data)
    ? data as { models?: unknown[]; data?: unknown[] }
    : null;
  const modelsList = Array.isArray(data)
    ? data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  return modelsList
    .map(model => {
      if (typeof model === 'string') {
        return model;
      }
      const item = model as { id?: string; name?: string; model?: string } | null;
      return item?.id || item?.name || item?.model || '';
    })
    .filter(Boolean);
}

function buildStatusApiRequestBodies(apiConfig: SummaryApiConfig): StatusRequestAttempt[] {
  const source = normalizeSource(apiConfig.source);
  if (isCustomSource(source)) {
    return [
      {
        label: 'custom-status',
        body: {
          reverse_proxy: apiConfig.apiurl,
          proxy_password: '',
          chat_completion_source: 'custom',
          custom_url: apiConfig.apiurl,
          custom_include_headers: apiConfig.key ? `Authorization: Bearer ${apiConfig.key}` : '',
        },
      },
    ];
  }

  return [
    {
      label: 'official-status-minimal',
      body: {
        chat_completion_source: source,
      },
    },
    {
      label: 'official-status-with-credentials',
      body: {
        chat_completion_source: source,
        source,
        model: apiConfig.model || '',
        key: apiConfig.key || '',
        api_key: apiConfig.key || '',
      },
    },
  ];
}

async function loadModelListViaStatusApi(apiConfig: SummaryApiConfig): Promise<string[]> {
  const stApi = getSillyTavernApi();
  if (!stApi || typeof stApi.getRequestHeaders !== 'function') {
    throw new Error('当前环境没有可用的 SillyTavern.getRequestHeaders()');
  }

  const attempts = buildStatusApiRequestBodies(apiConfig);
  const errors: string[] = [];

  for (const attempt of attempts) {
    const response = await fetch(STATUS_URL, {
      method: 'POST',
      headers: { ...stApi.getRequestHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(attempt.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      errors.push(`${attempt.label}: ${response.status} ${response.statusText} ${errorText}`.trim());
      continue;
    }

    const models = parseModelListPayload(await response.json());
    if (models.length > 0) {
      return models;
    }

    errors.push(`${attempt.label}: 状态接口未返回可解析模型列表`);
  }

  throw new Error(errors.join(' | ') || '状态接口未返回可用模型列表。');
}

export async function loadSummaryModelList(apiConfig: SummaryApiConfig): Promise<string[]> {
  const validationMessage = validateSummaryApiConfig(apiConfig, { requireModel: false });
  if (validationMessage) {
    throw new Error(validationMessage);
  }

  const source = normalizeSource(apiConfig.source);
  const modelListConfig: { apiurl: string; key?: string; source?: string } = {
    apiurl: isCustomSource(source) ? apiConfig.apiurl.trim() : '',
    key: apiConfig.key.trim(),
    source: isCustomSource(source) ? 'openai' : source,
  };

  if (typeof getModelList === 'function') {
    const rawResult = await getModelList(modelListConfig);
    const models = parseModelListPayload(rawResult);
    if (models.length > 0) {
      return models;
    }
  }

  return loadModelListViaStatusApi(apiConfig);
}
