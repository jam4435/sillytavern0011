import { useCallback, useState } from 'react';
import { ActivePanel, GameMode, GameState, WorldTime } from '../types';

// 默认世界时间（根据初始化变量：1199年8月15日11时）
const DEFAULT_WORLD_TIME: WorldTime = {
  year: 1199,
  month: 8,
  day: 15,
  hour: 11
};

// 默认游戏状态
export const DEFAULT_GAME_STATE: GameState = {
  currentLocation: '临安府/牛家村',
  gameTime: '己未年 八月 十五 午时',
  worldTime: DEFAULT_WORLD_TIME,
  mode: GameMode.DIALOGUE,
  stats: {
    name: '少侠',
    gender: '男',
    appearance: '剑眉星目，器宇不凡，身形修长，稳健如松',
    birthYear: 100,
    status: '健康',
    realm: '凡胎肉身',
    cultivation: 0,
    location: '大宋/临安府/牛家村',
    identities: {},
    martialArts: {},
    initialAttributes: {
      brawn: 10,
      root: 10,
      agility: 10,
      savvy: 10,
      insight: 10,
      charisma: 10,
      luck: 10
    },
    attributes: {
      hp: 100,
      mp: 50,
      brawn: 10,
      root: 10,
      agility: 10,
      savvy: 10,
      insight: 10
    },
    biography: '',
    network: {}
  },
  inventory: [],
  events: [],
  social: []
};

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>(DEFAULT_GAME_STATE);
  const [activePanel, setActivePanel] = useState<ActivePanel>(ActivePanel.NONE);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentMaintext, setCurrentMaintext] = useState<string>('');
  const [currentOptions, setCurrentOptions] = useState<string[]>([]);

  const updateGameState = useCallback((newData: Partial<GameState>) => {
    setGameState(prev => ({ ...prev, ...newData }));
  }, []);

  const closeModal = useCallback(() => {
    setActivePanel(ActivePanel.NONE);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleNavClick = useCallback((panel: ActivePanel) => {
    setActivePanel(panel);
    setIsSidebarOpen(false);
  }, []);

  return {
    gameState,
    setGameState,
    updateGameState,
    activePanel,
    setActivePanel,
    closeModal,
    isSidebarOpen,
    toggleSidebar,
    closeSidebar,
    handleNavClick,
    currentMaintext,
    setCurrentMaintext,
    currentOptions,
    setCurrentOptions,
  };
}
