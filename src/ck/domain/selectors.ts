import { ageOnDate, daysUntilDeadline } from './date';
import type { GameState, RelationshipDimension } from './schema';

export function relationshipValue(state: GameState, fromId: string, toId: string, dimension: RelationshipDimension): number {
  return state.relationshipModifiers
    .filter(modifier => modifier.fromId === fromId && modifier.toId === toId && modifier.dimension === dimension)
    .filter(modifier => modifier.expiresAt === null || modifier.expiresAt >= state.currentDate)
    .reduce((sum, modifier) => sum + modifier.delta, 0);
}

export function isPromiseEffective(state: GameState, promiseId: string): boolean {
  const promise = state.promises[promiseId];
  return Boolean(promise && (promise.status === 'fulfilled' || (promise.status === 'active' && promise.dueDate >= state.currentDate)));
}

export function activeSupports(state: GameState): GameState['supportCommitments'][string][] {
  return Object.values(state.supportCommitments).filter(commitment => {
    if (commitment.status !== 'active' || commitment.expiresAt < state.currentDate) return false;
    return commitment.conditionPromiseIds.every(id => isPromiseEffective(state, id));
  });
}

export function supportCount(state: GameState): number {
  return new Set(activeSupports(state).map(commitment => commitment.supporterId)).size;
}

export function deadlineDays(state: GameState): number {
  return daysUntilDeadline(state);
}

export function characterAge(state: GameState, characterId: string): number {
  const character = state.characters[characterId];
  return character ? ageOnDate(character.birthDate, state.currentDate) : -1;
}

export function countyForLocation(state: GameState, locationId: string): string | null {
  return state.locations[locationId]?.countyId ?? null;
}

export function findCountyPath(state: GameState, fromCountyId: string, toCountyId: string): string[] | null {
  if (fromCountyId === toCountyId) return [fromCountyId];
  const queue: string[][] = [[fromCountyId]];
  const seen = new Set([fromCountyId]);
  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) break;
    const current = path[path.length - 1];
    const county = state.counties[current];
    if (!county) continue;
    for (const next of county.adjacentCountyIds) {
      if (seen.has(next)) continue;
      const candidate = [...path, next];
      if (next === toCountyId) return candidate;
      seen.add(next);
      queue.push(candidate);
    }
  }
  return null;
}

export type SceneProjection = {
  date: string;
  sceneId: string;
  locationId: string;
  activeCharacterIds: string[];
  characters: Array<{ id: string; name: string; traits: string[]; goals: string[]; opinionOfPlayer: number }>;
  publicFacts: Array<{ subjectId: string; predicate: string; value: unknown; certainty: string }>;
  resources: GameState['resources'];
  scenario: Pick<GameState['scenario'], 'phase' | 'deadline' | 'requiredSupport'> & { currentSupport: number };
};

export function projectScene(state: GameState, sceneId: string, locationId: string, requestedCharacterIds: string[]): SceneProjection {
  const localIds = requestedCharacterIds
    .filter(id => state.characters[id]?.alive && state.characters[id].locationId === locationId)
    .slice(0, 3);
  const visibleFacts = Object.values(state.knowledge).filter(fact => {
    if (fact.visibility === 'public') return true;
    return state.characters[state.playerCharacterId]?.knowledgeIds.includes(fact.id) ?? false;
  });
  return {
    date: state.currentDate,
    sceneId,
    locationId,
    activeCharacterIds: localIds,
    characters: localIds.map(id => ({
      id,
      name: state.characters[id].nameKey,
      traits: state.characters[id].traits,
      goals: state.characters[id].goals,
      opinionOfPlayer: relationshipValue(state, id, state.playerCharacterId, 'opinion'),
    })),
    publicFacts: visibleFacts.map(({ subjectId, predicate, value, certainty }) => ({ subjectId, predicate, value, certainty })),
    resources: state.resources,
    scenario: { phase: state.scenario.phase, deadline: state.scenario.deadline, requiredSupport: state.scenario.requiredSupport, currentSupport: supportCount(state) },
  };
}

export function livingBloodHeirs(state: GameState, deceasedId: string): string[] {
  const graph = new Map<string, Set<string>>();
  const link = (left: string, right: string) => {
    graph.set(left, new Set([...(graph.get(left) ?? []), right]));
    graph.set(right, new Set([...(graph.get(right) ?? []), left]));
  };
  for (const character of Object.values(state.characters)) for (const parentId of character.parentIds) link(character.id, parentId);
  const connected = new Set<string>();
  const queue = [deceasedId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || connected.has(current)) continue;
    connected.add(current);
    for (const next of graph.get(current) ?? []) if (!connected.has(next)) queue.push(next);
  }
  return [...connected]
    .filter(id => id !== deceasedId && state.characters[id]?.alive)
    .sort((a, b) => characterAge(state, b) - characterAge(state, a));
}
