import React, { useCallback, useEffect, useMemo } from 'react';
import ChatInput from './components/ChatInput';
import FullscreenButton from './components/FullscreenButton';
import GameContent from './components/GameContent';
import { Icons } from './components/Icons';
import Modal from './components/Modal';
import NewGameSetup from './components/NewGameSetup';
import {
  CharacterPanel,
  EventsPanel,
  InventoryPanel,
  MapPanel,
  MartialArtsPanel,
  SocialPanel
} from './components/panels';
import SettingsPanel from './components/SettingsPanel';
import SplashScreen from './components/SplashScreen';
import StartScreen from './components/StartScreen';
import StatusToast from './components/StatusToast';
import {
  useDebugLogs,
  useEventListeners,
  useGameState,
  useMessageHandler,
  usePageFlow,
  useSummaryDetection,
  useToast,
} from './hooks';
import { ActivePanel } from './types';
import { createOpeningStoryMessage, type NewGameFormData } from './utils/gameInitializer';
import { gameLogger, initLogger } from './utils/logger';
import { loadMartialArtsDatabase } from './utils/martialArtsDatabase';
import {
  applyRegexRules,
  applySettingsToDOM,
  DisplaySettings,
  loadSettings,
  saveSettings
} from './utils/settingsManager';
import {
  getLastMessageContent,
  hasSavedGame,
  parseOptions,
  readGameData
} from './utils/variableReader';

const App: React.FC = () => {
  // 使用自定义 hooks
  const { debugLogs, addDebugLog, clearDebugLogs } = useDebugLogs();
  const { toastState, showLoading, showError, dismissToast } = useToast();
  const {
    currentPage,
    setCurrentPage,
    savedGameExists,
    setSavedGameExists,
    isLoading,
    setIsLoading,
    handleStart,
    handleNewGame,
    handleSetupBack,
    goToGame,
  } = usePageFlow();
  const {
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
  } = useGameState();

  // 显示设置状态
  const [displaySettings, setDisplaySettings] = React.useState<DisplaySettings>(() => loadSettings());

  // 功法数据库加载状态
  const [isDatabaseReady, setIsDatabaseReady] = React.useState(false);

  // 使用消息处理 hook
  const { handleSendMessage } = useMessageHandler({
    setIsLoading,
    showLoading,
    showError,
    dismissToast,
    setCurrentMaintext,
    setCurrentOptions,
    addDebugLog,
    currentMaintext,
    currentOptions,
  });

  // 使用事件监听 hook
  useEventListeners({
    updateGameState,
    setCurrentMaintext,
    setCurrentOptions,
  });

  // 使用自动总结检测 hook
  useSummaryDetection({
    summarySettings: displaySettings.summarySettings,
    onSummaryComplete: (results) => {
      gameLogger.log('[App] 自动总结完成:', results);
      if (results.totalFailed > 0) {
        showError(`总结完成，但有 ${results.totalFailed} 个角色处理失败`);
      }
    },
    onSummaryError: (error) => {
      gameLogger.error('[App] 自动总结失败:', error);
      showError(`自动总结失败: ${error.message}`);
    },
  });

  // 检查是否存在存档，如果存在则直接进入游戏
  useEffect(() => {
    const initializeApp = async () => {
      initLogger.log('');
      initLogger.log('初始化开始...');

      // 1. 首先加载功法数据库（异步）
      initLogger.log('📚 加载功法数据库...');
      const dbLoaded = await loadMartialArtsDatabase();
      initLogger.log('📚 功法数据库加载结果:', dbLoaded ? '成功' : '失败');

      setIsDatabaseReady(dbLoaded);

      // 2. 检查是否存在存档
      initLogger.log('检查是否存在存档');
      const exists = hasSavedGame();
      initLogger.log('hasSavedGame() 返回:', exists);
      setSavedGameExists(exists);
      initLogger.log('savedGameExists 设置为:', exists);

      if (exists) {
        initLogger.log('检测到存档，直接进入游戏界面');

        const savedData = await readGameData();
        initLogger.log('readGameData 返回:', savedData ? '有数据' : 'null');
        if (savedData) {
          initLogger.log('功法数据:', savedData.stats?.martialArts);
          initLogger.log('属性数据:', savedData.stats?.attributes);
          setGameState(prev => ({ ...prev, ...savedData }));
        }

        const lastContent = getLastMessageContent();
        initLogger.log('getLastMessageContent 返回长度:', lastContent.length);
        if (lastContent) {
          setCurrentMaintext(lastContent);
          setCurrentOptions(parseOptions(lastContent));
          initLogger.log('已设置 maintext 和 options');
        }

        setCurrentPage('game');
        initLogger.log('✅ 已跳转到游戏界面');
      } else {
        initLogger.log('未检测到存档，保持在开始界面');
      }
    };

    initializeApp().catch(error => {
      initLogger.error('❌ 初始化失败:', error);
    });
  }, []); // 空依赖数组，只在组件挂载时执行一次。React 的 setState 函数引用是稳定的，不需要放在依赖数组中

  // 初始化并应用设置到 DOM
  useEffect(() => {
    applySettingsToDOM(displaySettings);
  }, [displaySettings]);

  // 设置更改处理函数
  const handleSettingsChange = useCallback((newSettings: DisplaySettings) => {
    setDisplaySettings(newSettings);
    saveSettings(newSettings);
    applySettingsToDOM(newSettings);
  }, []);

  // 应用正则替换到主文本
  const processedMaintext = useMemo(() => {
    if (!currentMaintext || displaySettings.regexRules.length === 0) {
      return currentMaintext;
    }
    return applyRegexRules(currentMaintext, displaySettings.regexRules);
  }, [currentMaintext, displaySettings.regexRules]);

  // 续写江湖处理
  const handleContinue = useCallback(() => {
    gameLogger.log('');
    gameLogger.log('续写江湖 - 加载存档');

    readGameData().then(savedData => {
      gameLogger.log('readGameData 返回:', savedData ? '有数据' : 'null');
      if (savedData) {
        setGameState(prev => ({ ...prev, ...savedData }));
      }
    }).catch(err => {
      gameLogger.error('readGameData 失败:', err);
    });

    const lastContent = getLastMessageContent();
    gameLogger.log('getLastMessageContent 返回长度:', lastContent.length);
    if (lastContent) {
      setCurrentMaintext(lastContent);
      setCurrentOptions(parseOptions(lastContent));
      gameLogger.log('🔧 调试模式：直接显示完整消息内容');
    }

    setCurrentPage('game');
    gameLogger.log('✅ 加载完成，进入游戏');
  }, [setGameState, setCurrentMaintext, setCurrentOptions, setCurrentPage]);

  // 新游戏设置提交处理
  const handleSetupSubmit = useCallback(async (formData: NewGameFormData) => {
    setIsLoading(true);
    showLoading('正在初始化角色...');

    const openingMessageSummary = `[开局设置]
姓名: ${formData.name}
性别: ${formData.gender}
年龄: ${formData.age}
外貌: ${formData.appearance}
时间: ${formData.locationInfo.year}年${formData.locationInfo.month}月${formData.locationInfo.day}日
地点: ${formData.locationInfo.location}
出身: ${formData.origin}
武功: ${formData.martialArtId}
属性: 臂力${formData.initialAttributes.臂力} 根骨${formData.initialAttributes.根骨} 机敏${formData.initialAttributes.机敏} 悟性${formData.initialAttributes.悟性} 洞察${formData.initialAttributes.洞察} 风姿${formData.initialAttributes.风姿} 福缘${formData.initialAttributes.福缘}`;

    addDebugLog('prompt', openingMessageSummary);

    try {
      const result = await createOpeningStoryMessage(formData);

      if (result.success && result.content) {
        addDebugLog('assistant', `[预设开场白]\n${result.content}`);

        dismissToast();

        gameLogger.log('📖 从变量表重新读取游戏状态...');
        const savedData = await readGameData();
        gameLogger.log('readGameData 返回:', savedData ? '有数据' : 'null');
        if (savedData) {
          gameLogger.log('变量表中的 stats:', savedData.stats);
          setGameState(prev => ({ ...prev, ...savedData }));
        } else {
          gameLogger.warn('⚠️ 变量表读取失败，使用表单数据');
          setGameState(prev => ({
            ...prev,
            currentLocation: formData.locationInfo.location,
            worldTime: {
              year: formData.locationInfo.year,
              month: formData.locationInfo.month,
              day: formData.locationInfo.day,
              hour: 11
            },
            stats: {
              ...prev.stats,
              name: formData.name,
              gender: formData.gender,
              appearance: formData.appearance,
              birthYear: formData.locationInfo.year - formData.age,
              location: formData.locationInfo.location,
              identities: { [formData.origin]: '初入江湖的新人' },
              initialAttributes: formData.initialAttributes,
              realm: '三流-圆满',
              cultivation: 200,
              attributes: {
                hp: 1000,
                mp: 800,
                臂力: formData.initialAttributes.臂力 * 10,
                根骨: formData.initialAttributes.根骨 * 10,
                机敏: formData.initialAttributes.机敏 * 10,
                悟性: formData.initialAttributes.悟性 * 10,
                洞察: formData.initialAttributes.洞察 * 10
              },
              biography: formData.origin
            }
          }));
        }

        setCurrentMaintext(result.content);
        setCurrentOptions([]);
        gameLogger.log('✅ 开场白已设置到前端');
        gameLogger.log('开场白:', result.content);

        goToGame();
      } else {
        gameLogger.error('创建开局失败:', result.error);
        showError(`初始化失败：${result.error || '创建开局楼层时出错'}，请重试`);
      }
    } catch (error) {
      gameLogger.error('创建开局出错:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      showError(`生成失败：${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [addDebugLog, setIsLoading, showLoading, showError, dismissToast, setGameState, setCurrentMaintext, setCurrentOptions, goToGame]);

  const getModalTitle = (panel: ActivePanel) => {
    switch(panel) {
      case ActivePanel.CHARACTER: return "侠客状态";
      case ActivePanel.MARTIAL_ARTS: return "武学秘籍";
      case ActivePanel.EVENTS: return "江湖轶事";
      case ActivePanel.INVENTORY: return "行囊包裹";
      case ActivePanel.MAP: return "九州舆图";
      case ActivePanel.SOCIAL: return "江湖侠缘";
      case ActivePanel.SETTINGS: return "界面设置";
      default: return "";
    }
  };

  const renderModalContent = () => {
    switch(activePanel) {
      case ActivePanel.CHARACTER: return <CharacterPanel stats={gameState.stats} worldTime={gameState.worldTime} />;
      case ActivePanel.MARTIAL_ARTS: return <MartialArtsPanel martialArts={gameState.stats.martialArts} cultivation={gameState.stats.cultivation} userName={gameState.stats.name} />;
      case ActivePanel.EVENTS: return <EventsPanel events={gameState.events} />;
      case ActivePanel.MAP: return <MapPanel />;
      case ActivePanel.INVENTORY: return <InventoryPanel items={gameState.inventory} />;
      case ActivePanel.SOCIAL: return <SocialPanel npcs={gameState.social} />;
      case ActivePanel.SETTINGS: return (
        <SettingsPanel
          settings={displaySettings}
          onSettingsChange={handleSettingsChange}
          debugLogs={debugLogs}
          onClearDebugLogs={clearDebugLogs}
        />
      );
      default: return null;
    }
  };

  // 根据页面状态渲染不同内容
  if (currentPage === 'start') {
    return <StartScreen onStart={handleStart} />;
  }

  if (currentPage === 'splash') {
    return (
      <SplashScreen
        hasSavedGame={savedGameExists}
        onNewGame={handleNewGame}
        onContinue={handleContinue}
      />
    );
  }

  if (currentPage === 'setup') {
    return (
      <>
        <StatusToast
          state={toastState}
          onDismiss={dismissToast}
          autoHideDelay={8000}
        />
        <NewGameSetup
          onSubmit={handleSetupSubmit}
          onBack={handleSetupBack}
          isLoading={isLoading}
        />
      </>
    );
  }

  // 主游戏界面
  return (
    <div className="app-container">
      <StatusToast
        state={toastState}
        onDismiss={dismissToast}
        autoHideDelay={8000}
      />

      {/* Background Ambience Layer */}
      <div className="bg-layer">
        <div
          className="bg-img"
          style={displaySettings.backgroundImage ? {
            backgroundImage: `url(${displaySettings.backgroundImage})`,
            opacity: displaySettings.backgroundOpacity,
            filter: `grayscale(60%) sepia(20%) blur(${displaySettings.backgroundBlur}px)`,
          } : undefined}
        ></div>
        <div
          className="bg-gradient-vert"
          style={{
            background: `linear-gradient(
              to bottom,
              ${displaySettings.backgroundColor} 0%,
              ${displaySettings.backgroundColor}b3 20%,
              transparent 50%,
              ${displaySettings.backgroundColor}b3 80%,
              ${displaySettings.backgroundColor} 100%
            )`,
          }}
        ></div>
        <div className="bg-radial"></div>
      </div>

      <div className="max-w-1920">
        {/* 移动端菜单按钮 */}
        <button
          className={`nav-menu-toggle ${isSidebarOpen ? 'active' : ''}`}
          onClick={toggleSidebar}
          aria-label="切换菜单"
        >
          <div className="menu-icon">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>

        {/* 移动端侧边栏遮罩层 */}
        <div
          className={`nav-sidebar-overlay ${isSidebarOpen ? 'active' : ''}`}
          onClick={closeSidebar}
        />

        {/* Navigation Sidebar */}
        <nav className={`nav-sidebar ${isSidebarOpen ? 'open' : ''}`}>
            <div className="logo-box">
                <span className="logo-char">墨</span>
            </div>

            <NavButton icon={<Icons.Character />} label="状态" isActive={activePanel === ActivePanel.CHARACTER} onClick={() => handleNavClick(ActivePanel.CHARACTER)} />
            <NavButton icon={<Icons.Manual />} label="功法" isActive={activePanel === ActivePanel.MARTIAL_ARTS} onClick={() => handleNavClick(ActivePanel.MARTIAL_ARTS)} />
            <NavButton icon={<Icons.Inventory />} label="行囊" isActive={activePanel === ActivePanel.INVENTORY} onClick={() => handleNavClick(ActivePanel.INVENTORY)} />
            <NavButton icon={<Icons.Quest />} label="事件" isActive={activePanel === ActivePanel.EVENTS} onClick={() => handleNavClick(ActivePanel.EVENTS)} />
            <NavButton icon={<Icons.Map />} label="地图" isActive={activePanel === ActivePanel.MAP} onClick={() => handleNavClick(ActivePanel.MAP)} />
            <NavButton icon={<Icons.Social />} label="侠缘" isActive={activePanel === ActivePanel.SOCIAL} onClick={() => handleNavClick(ActivePanel.SOCIAL)} />
            <NavButton icon={<Icons.Settings />} label="设置" isActive={activePanel === ActivePanel.SETTINGS} onClick={() => handleNavClick(ActivePanel.SETTINGS)} />
        </nav>

        {/* Main Content */}
        <main className="main-column">
            <header className="game-header">
                <div className="location-group">
                    <div className="loc-value">
                        <Icons.Compass className="loc-icon" />
                        <span className="loc-name">{gameState.currentLocation}</span>
                    </div>
                    <div className="time-value">{gameState.gameTime}</div>
                </div>

                <div className="header-right">
                    <FullscreenButton className="header-fullscreen-btn header-fullscreen-btn-small" />

                    <div className="status-bars-container">
                        <div className="bar-group">
                            <span className="bar-label">血</span>
                            <div className="bar-bg">
                                <div className="bar-fill-hp" style={{ width: `${Math.min(100, gameState.stats.attributes.hp)}%` }}></div>
                            </div>
                        </div>
                        <div className="bar-group">
                            <span className="bar-label">气</span>
                            <div className="bar-bg">
                                <div className="bar-fill-mp" style={{ width: `${Math.min(100, gameState.stats.attributes.mp)}%` }}></div>
                            </div>
                        </div>
                    </div>

                    <div className="player-info">
                        <div className="player-name">{gameState.stats.name}</div>
                        <div className="player-realm">{gameState.stats.realm}</div>
                    </div>

                    <div className="avatar-small">
                        <div className="avatar-glow"></div>
                        <img src="https://picsum.photos/100/100?grayscale" alt="Avatar" />
                    </div>
                </div>
            </header>

            {/* 游戏主体内容区域 */}
            <section className="game-content-wrapper">
              <GameContent
                maintext={processedMaintext}
                options={currentOptions}
                onSelectOption={(option) => {
                  handleSendMessage(option);
                }}
                settings={displaySettings}
              />
            </section>

            {/* 底部聊天输入区域 */}
            <ChatInput
              onSend={handleSendMessage}
              placeholder="书写你的江湖故事..."
            />
        </main>
      </div>

      {/* Modals */}
      <Modal isOpen={activePanel !== ActivePanel.NONE} onClose={closeModal} title={getModalTitle(activePanel)} type={activePanel}>
        {renderModalContent()}
      </Modal>
    </div>
  );
};

const NavButton = ({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) => (
    <button
        onClick={onClick}
        className={`nav-btn ${isActive ? 'active' : ''}`}
    >
        {isActive && <div className="nav-btn-indicator"></div>}
        <div className="nav-icon-wrapper">
            {icon}
        </div>
        <span className="nav-label">{label}</span>
    </button>
);

export default App;
