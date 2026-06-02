const DEFAULT_TIMEOUT_MS = 360000;
const CUSTOM_GENERATE_URL = '/api/backends/chat-completions/generate';
const DEFAULT_CUSTOM_MAX_TOKENS = 4096;

const customGenerationControllers = new Map();

function getGenerateRawFn() {
  if (typeof generateRaw === 'function') {
    return generateRaw;
  }
  return null;
}

function getStopGenerationByIdFn() {
  if (typeof stopGenerationById === 'function') {
    return stopGenerationById;
  }
  return null;
}

function getSillyTavernApi() {
  const parentWin = typeof window.parent !== 'undefined' ? window.parent : window;
  return (typeof SillyTavern !== 'undefined' ? SillyTavern : parentWin.SillyTavern) || null;
}

function buildGenerationId() {
  return `wi-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeModelName(model) {
  return typeof model === 'string' ? model.replace(/^models\//, '').trim() : '';
}

function normalizeCustomApi(customApi) {
  const normalizedModel = normalizeModelName(customApi?.model);
  if (!normalizedModel) {
    return null;
  }

  const source = (customApi?.source || 'openai').trim() || 'openai';
  if (source === 'custom') {
    if (!customApi?.apiurl) {
      return null;
    }

    return {
      apiurl: customApi.apiurl,
      key: customApi.key || '',
      model: normalizedModel,
      source: 'custom',
    };
  }

  return {
    key: customApi?.key || '',
    model: normalizedModel,
    source,
  };
}

function buildGenerateConfig({ prompt, generationId, customApi, shouldStream }) {
  const config = {
    generation_id: generationId,
    should_silence: true,
    should_stream: Boolean(shouldStream),
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

  if (!customApi) {
    return config;
  }

  config.custom_api = customApi;
  return config;
}

function normalizeMaxOutputTokens(value) {
  const parsed = Number.parseInt(`${value ?? DEFAULT_CUSTOM_MAX_TOKENS}`, 10);
  return Number.isFinite(parsed) ? Math.min(64000, Math.max(256, parsed)) : DEFAULT_CUSTOM_MAX_TOKENS;
}

function buildCustomGenerateBody({ prompt, customApi, shouldStream, maxOutputTokens }) {
  return {
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    model: normalizeModelName(customApi?.model),
    max_tokens: normalizeMaxOutputTokens(maxOutputTokens),
    temperature: 0.7,
    top_p: 0.95,
    stream: Boolean(shouldStream),
    chat_completion_source: 'custom',
    group_names: [],
    include_reasoning: false,
    reasoning_effort: 'medium',
    enable_web_search: false,
    request_images: false,
    custom_prompt_post_processing: 'strict',
    reverse_proxy: customApi?.apiurl || '',
    proxy_password: '',
    custom_url: customApi?.apiurl || '',
    custom_include_headers: customApi?.key ? `Authorization: Bearer ${customApi.key}` : '',
  };
}

function installSkipWIANHooks(shouldForceSkipWIAN = true) {
  if (!shouldForceSkipWIAN) {
    return () => {};
  }

  const eventOnFn = typeof eventOn === 'function' ? eventOn : typeof window !== 'undefined' ? window.eventOn : null;
  const events =
    typeof tavern_events !== 'undefined' ? tavern_events : typeof window !== 'undefined' ? window.tavern_events : null;

  if (typeof eventOnFn !== 'function' || !events) {
    return () => {};
  }

  const unsubs = [];
  const applySkipWIAN = (type, option, dryRun) => {
    if (!option || typeof option !== 'object') {
      return;
    }
    option.skipWIAN = true;
    console.info('[世界书 AI] 已强制设置 skipWIAN', {
      generationType: type,
      dryRun: Boolean(dryRun),
      skipWIAN: option.skipWIAN,
    });
  };

  if (events.GENERATION_STARTED) {
    const unsub = eventOnFn(events.GENERATION_STARTED, applySkipWIAN);
    if (typeof unsub === 'function') {
      unsubs.push(unsub);
    }
  }

  if (events.GENERATION_AFTER_COMMANDS) {
    const unsub = eventOnFn(events.GENERATION_AFTER_COMMANDS, applySkipWIAN);
    if (typeof unsub === 'function') {
      unsubs.push(unsub);
    }
  }

  return () => {
    unsubs.forEach(unsub => {
      try {
        unsub();
      } catch {
        // no-op
      }
    });
  };
}

function formatErrorDetails(error) {
  if (!error) {
    return '未知错误';
  }

  const lines = [];
  if (error.name) lines.push(`错误类型: ${error.name}`);
  if (error.message) lines.push(`错误信息: ${error.message}`);
  if (error.stack) lines.push(`错误堆栈:\n${error.stack}`);
  return lines.join('\n');
}

function summarizeCustomApiForLog(customApi) {
  if (!customApi) {
    return null;
  }

  return {
    source: customApi.source || 'openai',
    apiurl: customApi.apiurl || '',
    hasApiUrl: Boolean(customApi.apiurl),
    hasKey: Boolean(customApi.key),
    hasCustomHeaders: Boolean(customApi.key),
    model: customApi.model || '',
  };
}

function isAbortError(error) {
  return error?.name === 'AbortError' || /aborted|abort/i.test(error?.message || '');
}

function parseStreamingChunk(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return '';
  }

  const payload = trimmed.slice(5).trim();
  if (!payload || payload === '[DONE]') {
    return '';
  }

  try {
    const parsed = JSON.parse(payload);
    return parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.message?.content || parsed?.content || '';
  } catch {
    return '';
  }
}

function extractResponseContent(rawText, parsedData) {
  if (parsedData?.choices?.[0]?.message?.content) {
    return parsedData.choices[0].message.content.trim();
  }
  if (parsedData?.choices?.[0]?.text) {
    return parsedData.choices[0].text.trim();
  }
  if (typeof parsedData?.content === 'string') {
    return parsedData.content.trim();
  }

  const streamingText = rawText.split(/\r?\n/).map(parseStreamingChunk).join('').trim();
  if (streamingText) {
    return streamingText;
  }

  return '';
}

async function requestCustomChatCompletion({ prompt, customApi, shouldStream, generationId, timeoutMs, maxOutputTokens }) {
  const stApi = getSillyTavernApi();
  if (!stApi || typeof stApi.getRequestHeaders !== 'function') {
    throw new Error('当前环境没有可用的 SillyTavern.getRequestHeaders()');
  }

  const controller = new AbortController();
  customGenerationControllers.set(generationId, controller);

  let timeoutHandle = null;
  try {
    timeoutHandle = setTimeout(() => controller.abort('timeout'), timeoutMs);

    const requestBody = buildCustomGenerateBody({ prompt, customApi, shouldStream, maxOutputTokens });
    console.info('[世界书 AI] custom 直调请求体', {
      generationId,
      requestBody: {
        ...requestBody,
        custom_include_headers: requestBody.custom_include_headers ? '[redacted]' : '',
      },
    });

    const response = await fetch(CUSTOM_GENERATE_URL, {
      method: 'POST',
      headers: { ...stApi.getRequestHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const rawText = await response.text();
    if (!response.ok) {
      const message = rawText?.trim() || response.statusText || `HTTP ${response.status}`;
      throw new Error(message);
    }

    let parsedData = null;
    try {
      parsedData = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsedData = null;
    }

    const content = extractResponseContent(rawText, parsedData);
    if (!content) {
      const fallbackMessage = parsedData?.error?.message || rawText || 'API 返回内容为空';
      throw new Error(fallbackMessage);
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
    customGenerationControllers.delete(generationId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function cancelLlmGeneration(generationId) {
  const controller = customGenerationControllers.get(generationId);
  if (controller) {
    controller.abort('user');
    customGenerationControllers.delete(generationId);
    return true;
  }

  const stopFn = getStopGenerationByIdFn();
  if (!generationId || typeof stopFn !== 'function') {
    return false;
  }
  return stopFn(generationId);
}

export async function requestLlmText(options = {}) {
  const {
    prompt = '',
    customApi = null,
    promptSettings = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onGenerationStart,
    shouldStream = false,
    maxOutputTokens = DEFAULT_CUSTOM_MAX_TOKENS,
  } = options;

  void promptSettings;

  const normalizedCustomApi = normalizeCustomApi(customApi);
  const isDirectCustom = normalizedCustomApi?.source === 'custom';
  const invoke = isDirectCustom ? null : getGenerateRawFn();

  console.groupCollapsed('[世界书 AI] 发起生成请求');
  console.info('[世界书 AI] 调用环境', {
    调用模式: isDirectCustom ? 'custom-fetch' : 'generateRaw',
    generateRaw类型: typeof generateRaw,
    generate类型: typeof generate,
    stopGenerationById类型: typeof stopGenerationById,
  });
  console.info('[世界书 AI] 调用参数', {
    prompt长度: typeof prompt === 'string' ? prompt.length : null,
    超时毫秒: timeoutMs,
    是否流式: Boolean(shouldStream),
    是否自定义API: Boolean(normalizedCustomApi),
    自定义API: summarizeCustomApiForLog(normalizedCustomApi),
  });

  if (!isDirectCustom && typeof invoke !== 'function') {
    console.warn('[世界书 AI] 当前环境没有可用的 generateRaw()');
    console.groupEnd();
    throw new Error('当前环境没有可用的 generateRaw()');
  }

  const generationId = buildGenerationId();
  const stopFn = getStopGenerationByIdFn();
  const requestConfig = buildGenerateConfig({
    prompt,
    generationId,
    customApi: normalizedCustomApi,
    shouldStream,
  });
  const removeSkipWIANHooks = isDirectCustom ? () => {} : installSkipWIANHooks();

  onGenerationStart?.(generationId);

  console.info('[世界书 AI] 最终请求配置', {
    generationId,
    调用模式: isDirectCustom ? 'custom-fetch' : 'generateRaw',
    是否使用orderedPrompts: Array.isArray(requestConfig.ordered_prompts),
    orderedPrompts数量: Array.isArray(requestConfig.ordered_prompts) ? requestConfig.ordered_prompts.length : 0,
    是否包含userInput: Object.prototype.hasOwnProperty.call(requestConfig, 'user_input'),
    orderedPrompts角色: Array.isArray(requestConfig.ordered_prompts)
      ? requestConfig.ordered_prompts.map(item => (typeof item === 'string' ? item : item?.role || 'unknown'))
      : [],
    是否流式: requestConfig.should_stream,
    normalizedCustomApi: summarizeCustomApiForLog(normalizedCustomApi),
    custom_api: summarizeCustomApiForLog(requestConfig.custom_api),
    overrides: requestConfig.overrides,
    最大聊天历史: requestConfig.max_chat_history,
  });

  let timeoutHandle = null;

  try {
    let response;
    if (isDirectCustom) {
      response = await requestCustomChatCompletion({
        prompt,
        customApi: normalizedCustomApi,
        shouldStream,
        generationId,
        timeoutMs,
        maxOutputTokens,
      });
    } else {
      response = await Promise.race([
        Promise.resolve(invoke(requestConfig)),
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            console.warn('[世界书 AI] 请求超时，尝试 stopGenerationById', { generationId });
            if (typeof stopFn === 'function') {
              stopFn(generationId);
            }
            reject(new Error(`AI 请求超时（${Math.ceil(timeoutMs / 1000)}s）`));
          }, timeoutMs);
        }),
      ]);
    }

    console.info('[世界书 AI] 已收到模型返回', {
      返回值类型: typeof response,
      返回长度: typeof response === 'string' ? response.length : null,
      返回预览: typeof response === 'string' ? response.slice(0, 200) : response,
    });

    if (typeof response !== 'string' || !response.trim()) {
      throw new Error('AI 返回为空');
    }

    return response.trim();
  } catch (error) {
    console.error('[世界书 AI] 生成请求失败', {
      generationId,
      customApiSummary: summarizeCustomApiForLog(normalizedCustomApi),
      requestCustomApi: summarizeCustomApiForLog(requestConfig.custom_api),
      shouldStream: requestConfig.should_stream,
      callMode: isDirectCustom ? 'custom-fetch' : 'generateRaw',
      错误详情: formatErrorDetails(error),
    });
    throw error;
  } finally {
    removeSkipWIANHooks();
    console.groupEnd();
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
