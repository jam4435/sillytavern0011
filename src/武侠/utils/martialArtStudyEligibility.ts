import type { InitialAttributes, InventoryItem, MartialArtRequirementValue } from '../types';
import { checkMartialArtPrerequisites } from './martialArtsDatabase';

const INITIAL_ATTRIBUTE_KEYS = ['臂力', '根骨', '机敏', '悟性', '洞察', '风姿', '福缘'] as const;

export type MartialArtStudyAttribute = (typeof INITIAL_ATTRIBUTE_KEYS)[number];

export interface MartialArtRequirementStatus {
  attribute: MartialArtStudyAttribute;
  current: number;
  requirement: MartialArtRequirementValue;
  requirementText: string;
  deficitText: string;
  met: boolean;
  deficit: number;
}

export interface MartialArtStudyEligibility {
  canStudy: boolean;
  alreadyLearned: boolean;
  requirementStatuses: MartialArtRequirementStatus[];
  reasons: string[];
}

interface QuoteMartialArtStudyInput {
  item: InventoryItem;
  initialAttributes?: InitialAttributes;
  traits?: Record<string, string>;
  knownMartialArts?: Record<string, unknown>;
}

function isInitialAttributeKey(value: string): value is MartialArtStudyAttribute {
  return (INITIAL_ATTRIBUTE_KEYS as readonly string[]).includes(value);
}

/**
 * 统一计算背包秘籍的“参悟资格”。
 *
 * 这里只负责解释资格，不执行学习写入：
 * - 数值门槛来自秘籍对应功法的 修炼限制
 * - 天赋/缺陷限制复用 martialArtsDatabase 的前置检查
 * - 已习得的功法不能重复参悟
 */
export function quoteMartialArtStudyEligibility({
  item,
  initialAttributes,
  traits,
  knownMartialArts,
}: QuoteMartialArtStudyInput): MartialArtStudyEligibility {
  if (item.type !== 'SECRET') {
    return {
      canStudy: false,
      alreadyLearned: false,
      requirementStatuses: [],
      reasons: ['该物品不是武学秘籍。'],
    };
  }

  const alreadyLearned = Boolean(knownMartialArts?.[item.name]);
  const reasons: string[] = [];
  const requirementStatuses: MartialArtRequirementStatus[] = [];

  if (alreadyLearned) {
    reasons.push(`已习得《${item.name}》，无需重复参悟。`);
  }

  for (const [attribute, rawRequired] of Object.entries(item.martialArtInfo?.requirements || {})) {
    if (!isInitialAttributeKey(attribute)) continue;

    let min: number | undefined;
    let max: number | undefined;
    if (typeof rawRequired === 'number' && Number.isFinite(rawRequired)) {
      min = rawRequired;
    } else if (rawRequired && typeof rawRequired === 'object' && !Array.isArray(rawRequired)) {
      min = rawRequired.min;
      max = rawRequired.max;
      if (
        (min === undefined && max === undefined) ||
        (min !== undefined && (!Number.isInteger(min) || min < 0 || min > 20)) ||
        (max !== undefined && (!Number.isInteger(max) || max < 0 || max > 20)) ||
        (min !== undefined && max !== undefined && min > max)
      ) {
        reasons.push(`${attribute}的修炼限制数据无效。`);
        continue;
      }
    } else {
      continue;
    }

    const current = initialAttributes?.[attribute];
    if (typeof current !== 'number' || !Number.isFinite(current)) {
      reasons.push(`无法读取${attribute}当前值。`);
      continue;
    }

    const requirementText = min !== undefined && max !== undefined
      ? `${min}–${max}`
      : min !== undefined
        ? String(min)
        : `≤ ${max}`;
    const deficit = min !== undefined && current < min
      ? min - current
      : max !== undefined && current > max
        ? current - max
        : 0;
    const met = deficit === 0;
    requirementStatuses.push({
      attribute,
      current,
      requirement: rawRequired,
      requirementText,
      deficitText: deficit === 0 ? '' : `${min !== undefined && current < min ? '尚缺' : '超出'} ${deficit}`,
      met,
      deficit,
    });

    if (!met && min !== undefined && current < min) {
      reasons.push(
        max !== undefined
          ? `${attribute}不足：当前 ${current}，要求 ${min}–${max}，尚缺 ${deficit}。`
          : `${attribute}不足：当前 ${current}，需要 ${min}，尚缺 ${deficit}。`,
      );
    } else if (!met && max !== undefined && current > max) {
      reasons.push(
        min !== undefined
          ? `${attribute}过高：当前 ${current}，要求 ${min}–${max}，超出 ${deficit}。`
          : `${attribute}过高：当前 ${current}，要求不高于 ${max}，超出 ${deficit}。`,
      );
    }
  }

  const prerequisite = checkMartialArtPrerequisites(item.name, traits);
  if (!prerequisite.canLearn && prerequisite.reason) {
    reasons.push(prerequisite.reason);
  }

  return {
    canStudy: !alreadyLearned && reasons.length === 0,
    alreadyLearned,
    requirementStatuses,
    reasons,
  };
}
