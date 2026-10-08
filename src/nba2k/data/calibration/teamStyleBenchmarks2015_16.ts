import type { StructuredTeamTactics } from '../../engine/types';

/**
 * 2015-16 粗粒度球队风格参照，只供测试。
 * 这些标签本身不是精确战术录像，因此测试只检查整体相似度，不要求逐队硬匹配。
 */
export const TEAM_STYLE_BENCHMARKS_2015_16: Record<string, StructuredTeamTactics> = {
  GSW: { offense: '动态进攻', pace: '快', defense: '换防', helpIntensity: 68, rebound: '优先退防' },
  HOU: { offense: '五外', pace: '快', defense: '换防', helpIntensity: 55, rebound: '优先退防' },
  POR: { offense: '挡拆', pace: '快', defense: '人盯人', helpIntensity: 48, rebound: '均衡' },
  OKC: { offense: '挡拆', pace: '快', defense: '人盯人', helpIntensity: 55, rebound: '冲抢' },
  SAS: { offense: '动态进攻', pace: '标准', defense: '人盯人', helpIntensity: 72, rebound: '均衡' },
  CLE: { offense: '四外一内', pace: '标准', defense: '人盯人', helpIntensity: 58, rebound: '均衡' },
  LAC: { offense: '挡拆', pace: '快', defense: '人盯人', helpIntensity: 60, rebound: '均衡' },
  MEM: { offense: '低位', pace: '慢', defense: '人盯人', helpIntensity: 70, rebound: '冲抢' },
  CHI: { offense: '基础', pace: '慢', defense: '人盯人', helpIntensity: 67, rebound: '冲抢' },
  MIA: { offense: '四外一内', pace: '慢', defense: '人盯人', helpIntensity: 65, rebound: '均衡' },
  NYK: { offense: '低位', pace: '标准', defense: '人盯人', helpIntensity: 48, rebound: '均衡' },
  LAL: { offense: '低位', pace: '标准', defense: '人盯人', helpIntensity: 45, rebound: '均衡' },
};
