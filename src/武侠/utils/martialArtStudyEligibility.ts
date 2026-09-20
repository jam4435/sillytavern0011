import type { InitialAttributes, InventoryItem } from '../types';
import { checkMartialArtPrerequisites } from './martialArtsDatabase';

const INITIAL_ATTRIBUTE_KEYS = ['臂力', '根骨', '机敏', '悟性', '洞察', '风姿', '福缘'] as const;

export type MartialArtStudyAttribute = (typeof INITIAL_ATTRIBUTE_KEYS)[number];

export interface MartialArtRequirementStatus {
  attribute: MartialArtStudyAttribute;
  current: number;
  required: number;
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
    if (!isInitialAttributeKey(attribute) || typeof rawRequired !== 'number' || !Number.isFinite(rawRequired)) {
      continue;
    }

    const current = initialAttributes?.[attribute];
    if (typeof current !== 'number' || !Number.isFinite(current)) {
      reasons.push(`无法读取${attribute}当前值。`);
      continue;
    }

    const required = rawRequired;
    const deficit = Math.max(0, required - current);
    const met = deficit === 0;
    requirementStatuses.push({
      attribute,
      current,
      required,
      met,
      deficit,
    });

    if (!met) {
      reasons.push(`${attribute}不足：当前 ${current}，需要 ${required}，尚缺 ${deficit}。`);
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
