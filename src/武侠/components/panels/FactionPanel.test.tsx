import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterProfile, FactionTaskMap } from '../../types';
import { FactionPanel } from './FactionPanel';

const mockStats: CharacterProfile = {
  name: '墨逸',
  gender: '男',
  appearance: '剑眉星目',
  birthYear: 1200,
  status: '健康',
  realm: '三流-中期',
  cultivation: 350,
  location: '大宋/终南山/重阳宫',
  identities: { 全真教: '三代亲传弟子' },
  martialArts: {
    玄门守一诀: {
      type: '内功',
      description: '全真吐纳基础。',
      rank: '粗浅',
      mastery: '略有小成',
      traits: {},
      unlockedTraits: {},
      canUpgrade: false,
      upgradeCost: 50,
      nextMastery: '融会贯通',
    },
  },
  initialAttributes: {
    臂力: 10,
    根骨: 10,
    机敏: 10,
    悟性: 10,
    洞察: 10,
    风姿: 10,
    福缘: 0,
  },
  attributes: {
    hp: 500,
    mp: 300,
    臂力: 10,
    根骨: 10,
    机敏: 10,
    洞察: 10,
  },
  biography: '',
  network: {},
  factions: {
    全真教: {
      体系类型: '宗门',
      身份: '三代亲传弟子',
      师承: '丘处机',
      贡献: 150,
      状态: '在籍',
    },
  },
};

const mockTasks: FactionTaskMap = {
  终南豺狼谷除狼患: {
    所属势力: '全真教',
    任务详情: '剿除山谷恶狼，护持山门清宁。',
    任务地点: '大宋/终南山/豺狼谷',
    任务执行情况: '已完成',
    任务奖励: {
      贡献增量: 30,
      修为增量: 50,
      获得物品: {
        铜钱: { 类型: '杂物', 品阶: '凡品', 物品描述: '流通铜钱。', 数量: 200 },
      },
    },
  },
};

describe('FactionPanel Component', () => {
  it('已加入势力的玩家默认展示【我的势力】视图', () => {
    const handleSendMessage = vi.fn(async () => '');
    const handleClaimTask = vi.fn(async () => {});

    render(
      <FactionPanel
        stats={mockStats}
        currentLocation="大宋/终南山/重阳宫"
        tasks={mockTasks}
        onSendMessage={handleSendMessage}
        onClaimTask={handleClaimTask}
      />,
    );

    // 顶部横幅
    expect(screen.getAllByText('全真教')[0]).toBeInTheDocument();
    expect(screen.getByText('三代亲传弟子')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument(); // 贡献值

    // 武学技能树
    expect(screen.getByText('传承武学技能树')).toBeInTheDocument();

    // 差事列表卡片
    expect(screen.getByText('终南豺狼谷除狼患')).toBeInTheDocument();
    expect(screen.getByText('交付差事 / 领取奖励')).toBeInTheDocument();
  });

  it('点击交付差事能够触发领奖回调', async () => {
    const handleSendMessage = vi.fn(async () => '');
    const handleClaimTask = vi.fn(async () => {});

    render(
      <FactionPanel
        stats={mockStats}
        currentLocation="大宋/终南山/重阳宫"
        tasks={mockTasks}
        onSendMessage={handleSendMessage}
        onClaimTask={handleClaimTask}
      />,
    );

    const claimBtn = screen.getByText('交付差事 / 领取奖励');
    fireEvent.click(claimBtn);

    await waitFor(() => {
      expect(handleClaimTask).toHaveBeenCalledWith('终南豺狼谷除狼患', mockTasks['终南豺狼谷除狼患']);
    });
  });

  it('散修玩家默认展示【天下势力鉴赏】视图', () => {
    const rogueStats: CharacterProfile = {
      ...mockStats,
      factions: undefined,
      identities: {},
    };

    const handleSendMessage = vi.fn(async () => '');
    const handleClaimTask = vi.fn(async () => {});

    render(
      <FactionPanel
        stats={rogueStats}
        currentLocation="大宋/终南山/重阳宫"
        tasks={{}}
        onSendMessage={handleSendMessage}
        onClaimTask={handleClaimTask}
      />,
    );

    // 默认展示天下势力鉴赏
    expect(screen.getByText('天下势力鉴赏')).toBeInTheDocument();
    expect(screen.getByText('势力综述与底蕴')).toBeInTheDocument();
  });
});
