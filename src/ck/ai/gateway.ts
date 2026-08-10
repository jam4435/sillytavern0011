import { z } from 'zod';
import { actionDefinitions, executeAction, makeAction } from '../domain/engine';
import { projectScene } from '../domain/selectors';
import type { ActionCall, GameState } from '../domain/schema';

const DecisionSchema = z.object({
  speakerId: z.string(),
  intent: z.string(),
  actionCalls: z.array(z.object({ actionId: z.string(), actorId: z.string(), targetIds: z.array(z.string()), params: z.record(z.string(), z.unknown()) }).strict()).max(4),
  narrationBrief: z.string(),
}).strict();

export type DirectorResult = { state: GameState; narration: string; committedCalls: ActionCall[]; rejected: string[]; usedFallback: boolean };

function modelAvailable(): boolean {
  return typeof generateRaw === 'function' || typeof generate === 'function';
}

function describeActionContract(): string {
  return actionDefinitions.map(item => `${item.id}: ${item.description}`).join('\n');
}

async function callModel(config: GenerateConfig & { ordered_prompts?: GenerateRawConfig['ordered_prompts'] }): Promise<string | GenerateToolCallResult> {
  if (typeof generateRaw === 'function') return generateRaw(config as GenerateRawConfig);
  return generate(config);
}

async function callText(prompt: string, presetName: string, onStream?: (text: string) => void): Promise<string> {
  if (!modelAvailable()) return '';
  const generationId = `ck_text_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const listener = onStream && typeof eventOn === 'function' && typeof iframe_events !== 'undefined'
    ? eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, (text, receivedId) => {
        if (receivedId === generationId) onStream(text);
      })
    : null;
  try {
    const output = await callModel({
      user_input: prompt,
      preset_name: presetName,
      should_stream: true,
      should_silence: true,
      generation_id: generationId,
      max_chat_history: 0,
      ordered_prompts: ['user_input'],
    });
    return typeof output === 'string' ? output : JSON.stringify(output);
  } finally {
    listener?.stop();
  }
}

async function callDecision(prompt: string, presetName: string): Promise<z.infer<typeof DecisionSchema> | null> {
  if (!modelAvailable()) return null;
  const response = await callModel({
    user_input: prompt,
    preset_name: presetName,
    should_stream: false,
    should_silence: true,
    max_chat_history: 0,
    ordered_prompts: ['user_input'],
    json_schema: {
      name: 'ck_scene_decision',
      strict: true,
      value: {
        type: 'object',
        properties: {
          speakerId: { type: 'string' },
          intent: { type: 'string' },
          actionCalls: { type: 'array', maxItems: 4, items: { type: 'object', properties: { actionId: { type: 'string' }, actorId: { type: 'string' }, targetIds: { type: 'array', items: { type: 'string' } }, params: { type: 'object', additionalProperties: true } }, required: ['actionId', 'actorId', 'targetIds', 'params'], additionalProperties: false } },
          narrationBrief: { type: 'string' },
        },
        required: ['speakerId', 'intent', 'actionCalls', 'narrationBrief'],
        additionalProperties: false,
      },
    },
  });
  const raw = typeof response === 'string' ? response : JSON.stringify(response);
  try {
    const parsed = DecisionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function fallbackNarration(state: GameState, playerText: string, speakerIds: string[]): string {
  const names = speakerIds.map(id => state.characters[id]?.nameKey ?? id).join('、');
  return `${names || '在场众人'}听完了你的话。蜡烛在地图边缘摇晃；这项表态已按领地规则结算。\n\n「${playerText.slice(0, 120)}」`;
}

export async function runOrdinaryDialogue(state: GameState, sceneId: string, locationId: string, speakerIds: string[], playerText: string, onStream?: (text: string) => void): Promise<string> {
  const projection = projectScene(state, sceneId, locationId, speakerIds);
  const prompt = `你是中世纪领主 RPG 的场景导演。只能使用下列裁剪场景，不得推断远方秘密，也不得修改数据。\n场景：${JSON.stringify(projection)}\n玩家说：${playerText}\n用简体中文写 120—220 字对话，保持人物目标和时代语感。`;
  const generated = await callText(prompt, state.settings.models.sceneDirector.presetName, onStream);
  return generated || fallbackNarration(state, playerText, projection.activeCharacterIds);
}

export async function runConsequentialDialogue(state: GameState, sceneId: string, locationId: string, speakerIds: string[], playerText: string, onStream?: (text: string) => void): Promise<DirectorResult> {
  const projection = projectScene(state, sceneId, locationId, speakerIds);
  const decisionPrompt = `你是中世纪领主 RPG 的静默决策层。根据裁剪场景和玩家话语，替 NPC 作出至多 4 个注册行动。合法行动会自动生效，不能等待玩家确认。只能让 actor 调整 actor 自己对目标的态度，不能设绝对好感、凭空创造资源、指定战争胜者或查看未知秘密。\n可用行动：\n${describeActionContract()}\n场景：${JSON.stringify(projection)}\n玩家说：${playerText}\n如果没有合适硬变化，actionCalls 返回空数组。`;
  let decision = await callDecision(decisionPrompt, state.settings.models.sceneDirector.presetName);
  if (!decision) decision = await callDecision(`${decisionPrompt}\n上次输出非法。严格按 JSON schema 重试一次。`, state.settings.models.sceneDirector.presetName);
  let nextState = state;
  const committedCalls: ActionCall[] = [];
  const rejected: string[] = [];
  if (decision) {
    for (const [index, candidate] of decision.actionCalls.entries()) {
      const call = makeAction(nextState, candidate.actionId, candidate.actorId, candidate.targetIds, candidate.params, 'ai.scene_director', sceneId, `ai_${sceneId}_${state.revision}_${index}`);
      const result = executeAction(nextState, call);
      if (result.status === 'committed') {
        nextState = result.state;
        committedCalls.push(call);
      } else rejected.push(...result.errors.map(error => `${candidate.actionId}: ${error.message}`));
    }
  }
  const committedSummary = nextState.eventLog.slice(state.eventLog.length).map(item => ({ type: item.type, payload: item.payload }));
  const narrationPrompt = `你是中世纪领主 RPG 的叙事层。硬结果已经提交，绝不能改写、撤销或补充未提交变化。\n人物输入：${playerText}\n已提交事实：${JSON.stringify(committedSummary)}\n决策意图：${decision?.intent ?? '规则回退'}\n用简体中文写 160—280 字，清楚表达承诺、拒绝、代价或反提案。`;
  const narration = await callText(narrationPrompt, nextState.settings.models.sceneDirector.presetName, onStream);
  return { state: nextState, narration: narration || fallbackNarration(nextState, playerText, projection.activeCharacterIds), committedCalls, rejected, usedFallback: !decision || !narration };
}

export type WorldPlan = { summary: string; keyCharacterIds: string[]; signals: string[] };

export async function planWorldPulse(state: GameState): Promise<WorldPlan> {
  const pending = state.signals.filter(signal => !signal.consumed);
  const groupMap = new Map<string, typeof pending>();
  for (const signal of pending) {
    const key = `${signal.occurredAt}:${signal.type}`;
    groupMap.set(key, [...(groupMap.get(key) ?? []), signal]);
  }
  const grouped = [...groupMap.values()];
  const regularBudgets = pending
    .filter(signal => signal.type === 'regular_pulse')
    .map(signal => typeof signal.payload.decisionBudget === 'number' ? signal.payload.decisionBudget : 0);
  const keyBudget = Math.min(state.settings.models.keyCharacter.maxCallsPerPulse, Math.max(0, ...regularBudgets));
  const keyCharacterIds = [...new Set(pending.flatMap(signal => signal.scopeIds).filter(id => Boolean(state.characters[id])))]
    .slice(0, keyBudget);
  const compact = grouped.map(group => group.map(signal => ({ type: signal.type, kind: signal.kind, date: signal.occurredAt, scope: signal.scopeIds })));
  const fallback = { summary: pending.length ? `${pending.length} 项世界信号等待推演。` : '西欧局势暂时平静。', keyCharacterIds, signals: pending.map(signal => signal.id) };
  if (!modelAvailable() || pending.length === 0) return fallback;
  const prompt = `你是 1066 年西欧局势规划器。把同日同因果信号合批，只做局势摘要和关键人物建议，不直接改状态。常规脉冲不因重大信号重置。\n信号批次：${JSON.stringify(compact)}\n关键人物最多 ${state.settings.models.keyCharacter.maxCallsPerPulse} 名。用简体中文给出简短局势简报。`;
  const summary = await callText(prompt, state.settings.models.worldPlanner.presetName);
  return { ...fallback, summary: summary || fallback.summary };
}

export type WorldSimulationResult = { state: GameState; plan: WorldPlan; committedCalls: ActionCall[]; rejected: string[] };

function fallbackWorldCall(state: GameState, characterId: string, index: number): ActionCall | null {
  const targetId = state.playerCharacterId;
  if (!state.characters[characterId] || characterId === targetId) return null;
  const dimension = characterId === 'char_jean_dol' ? 'suspicion' : 'opinion';
  const delta = characterId === 'char_jean_dol' ? 2 : characterId === 'char_william' ? 1 : -1;
  return makeAction(state, 'relationship.adjust', characterId, [targetId], { dimension, delta, reasonCode: 'world_pulse_assessment' }, 'rules.world_fallback', `world_${state.currentDate}`, `world_fallback_${state.currentDate}_${characterId}_${index}`);
}

export async function runPendingWorldSimulation(state: GameState): Promise<WorldSimulationResult> {
  const plan = await planWorldPulse(state);
  if (plan.signals.length === 0) return { state, plan, committedCalls: [], rejected: [] };
  let nextState = state;
  const committedCalls: ActionCall[] = [];
  const rejected: string[] = [];
  for (const [index, characterId] of plan.keyCharacterIds.entries()) {
    const character = nextState.characters[characterId];
    if (!character?.alive) continue;
    let call: ActionCall | null = null;
    if (modelAvailable()) {
      const decision = await callDecision(`你是关键 NPC 决策层。只能替 ${characterId} 行动，不能替别人调整关系，也不能指定战争胜者。\n人物：${JSON.stringify({ id: character.id, traits: character.traits, goals: character.goals, locationId: character.locationId })}\n待处理世界信号：${JSON.stringify(nextState.signals.filter(signal => plan.signals.includes(signal.id)))}\n可用行动：\n${describeActionContract()}\n至多返回一个最重要行动。`, nextState.settings.models.keyCharacter.presetName);
      const candidate = decision?.actionCalls.find(item => item.actorId === characterId);
      if (candidate) call = makeAction(nextState, candidate.actionId, characterId, candidate.targetIds, candidate.params, 'ai.key_character', `world_${nextState.currentDate}`, `world_ai_${nextState.currentDate}_${characterId}_${index}`);
    }
    call ??= fallbackWorldCall(nextState, characterId, index);
    if (!call) continue;
    const result = executeAction(nextState, call);
    if (result.status === 'committed') {
      nextState = result.state;
      committedCalls.push(call);
    } else rejected.push(...result.errors.map(error => `${characterId}: ${error.message}`));
  }
  const consume = makeAction(nextState, 'world.consume_signals', nextState.playerCharacterId, [], { signalIds: plan.signals }, 'ai.world_planner', `world_${nextState.currentDate}`, `world_consume_${nextState.currentDate}_${plan.signals.join('_')}`);
  const consumed = executeAction(nextState, consume);
  if (consumed.status === 'committed') {
    nextState = consumed.state;
    committedCalls.push(consume);
  } else rejected.push(...consumed.errors.map(error => error.message));
  return { state: nextState, plan, committedCalls, rejected };
}
