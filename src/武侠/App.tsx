import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ChatInput from './components/ChatInput';
import CommandQueueButton from './components/CommandQueueButton';
import CommandQueuePopover from './components/CommandQueuePopover';
import FullscreenButton from './components/FullscreenButton';
import GameContent from './components/GameContent';
import { Icons } from './components/Icons';
import Modal from './components/Modal';
import NewGameSetup from './components/NewGameSetup';
import SaveLoadPanel from './components/SaveLoadPanel';
import {
  CharacterPanel,
  EventsPanel,
  InventoryPanel,
  MapPanel,
  MartialArtsPanel,
  SocialPanel,
} from './components/panels';
import OpeningScreen from './components/OpeningScreen';
import SettingsPanel from './components/SettingsPanel';
import SplashScreen from './components/SplashScreen';
import StartScreen from './components/StartScreen';
import StatusToast from './components/StatusToast';
import VariableChangeBar from './components/VariableChangeBar';
import {
  useDebugLogs,
  useCommandQueue,
  useEventListeners,
  useGameState,
  useMessageHandler,
  usePageFlow,
  useSummaryDetection,
  useToast,
  useVariableChangeTracker,
} from './hooks';
import { ActivePanel } from './types';
import { getRandomOpeningLine, initializeNewGameSession, type NewGameFormData } from './utils/gameInitializer';
import { gameLogger, getRuntimeDebugInfo, initLogger, variableTraceLogger } from './utils/logger';
import { getUserCurrentLocation } from './utils/mapUtils';
import { canRegenerateLastAssistantSwipe } from './utils/messageActions';
import {
  applyRegexRules,
  applySettingsToDOM,
  DisplaySettings,
  getLoadedPresetNameSafe,
  getRegexDebugSnapshot,
  getRegexRulesForDisplay,
  logRegexDebugSnapshot,
  loadSettings,
  renamePresetRegexBucket,
  saveSettings,
} from './utils/settingsManager';
import { resolveVariableEditorCapability } from './utils/variableEditorPolicy';
import {
  detectGameSessionState,
  getLastMessageContent,
  parseOptions,
  readGameDataPure,
  scheduleGameDataCompletion,
} from './utils/variableReader';

const App: React.FC = () => {
  // 使用自定义 hooks
  const { latestDebugRound, beginDebugRound, patchLatestDebugRound, clearDebugLogs } = useDebugLogs();
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
  const { commands, setTravelCommand, cancelCommand, sendMessageWithCommands } = useCommandQueue();

  // 显示设置状态
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => loadSettings());
  const [currentPresetName, setCurrentPresetName] = useState(() => getLoadedPresetNameSafe());
  const [openingWelcomeLine, setOpeningWelcomeLine] = useState(() => getRandomOpeningLine());
  const [canRegenerate, setCanRegenerate] = useState(false);
  const [isCommandQueueOpen, setIsCommandQueueOpen] = useState(false);
  const [mapDraftDestination, setMapDraftDestination] = useState<string | null>(null);
  const {
    variableChanges,
    handleVariableTurnStart,
    handleGlobalMessageSent,
    handleVariableAssistantReply,
    handleVariableExtraDeclaredBlocks,
    handleVariableMessageBoundary,
    handleEraWriteDone,
    handleDirectVariableWriteDone,
    handleEraVariableWriteDone,
    markVariableApiWriteAsAi,
    clearVariableChanges,
  } = useVariableChangeTracker();

  // 使用消息处理 hook
  const { handleSendMessage, handleAutoAdvanceTurn, handleRegenerateLastAssistant } = useMessageHandler({
    setIsLoading,
    showLoading,
    showError,
    dismissToast,
    updateGameState,
    setCurrentMaintext,
    setCurrentOptions,
    beginDebugRound,
    patchLatestDebugRound,
    currentMaintext,
    currentOptions,
    summarySettings: displaySettings.summarySettings,
    onVariableTurnStart: handleVariableTurnStart,
    onVariableAssistantReply: handleVariableAssistantReply,
    onVariableExtraDeclaredBlocks: handleVariableExtraDeclaredBlocks,
    onVariableAiWriteTarget: markVariableApiWriteAsAi,
  });

  useEffect(() => {
    variableTraceLogger.log('[App] 组件已挂载', getRuntimeDebugInfo());
    return () => {
      variableTraceLogger.warn('[App] 组件即将卸载', getRuntimeDebugInfo());
    };
  }, []);

  // 使用事件监听 hook
  useEventListeners({
    updateGameState,
    setCurrentMaintext,
    setCurrentOptions,
    onMessageSent: handleGlobalMessageSent,
    onMessageBoundary: handleVariableMessageBoundary,
    onChatChanged: clearVariableChanges,
    onEraWriteDone: handleEraWriteDone,
    onDirectVariableWriteDone: handleDirectVariableWriteDone,
    onEraVariableWriteDone: handleEraVariableWriteDone,
  });

  // 使用自动总结检测 hook
  useSummaryDetection({
    summarySettings: displaySettings.summarySettings,
    onSummaryComplete: results => {
      gameLogger.log('[App] 自动总结完成:', results);
      if (results.totalFailed > 0) {
        showError(`总结完成，但有 ${results.totalFailed} 个角色处理失败`);
      }
    },
    onSummaryError: error => {
      gameLogger.error('[App] 自动总结失败:', error);
      showError(`自动总结失败: ${error.message}`);
    },
  });

  useEffect(() => {
    if (currentPage !== 'game' || isLoading) {
      setCanRegenerate(false);
      return;
    }

    setCanRegenerate(canRegenerateLastAssistantSwipe());
  }, [currentPage, currentMaintext, currentOptions, isLoading]);

  // 检查是否存在存档，如果存在则直接进入游戏
  useEffect(() => {
    const initializeApp = async () => {
      initLogger.log('');
      initLogger.log('初始化开始...');

      initLogger.log('检查游戏会话状态');
      const sessionState = detectGameSessionState();
      initLogger.log('detectGameSessionState() 返回:', sessionState);
      setSavedGameExists(sessionState !== 'empty');
      initLogger.log('savedGameExists 设置为:', sessionState !== 'empty');

      if (sessionState === 'active') {
        initLogger.log('检测到存档，直接进入游戏界面');

        const savedData = readGameDataPure();
        initLogger.log('readGameDataPure 返回:', savedData ? '有数据' : 'null');
        if (savedData) {
          initLogger.log('功法数据:', savedData.stats?.martialArts);
          initLogger.log('属性数据:', savedData.stats?.attributes);
          setGameState(prev => ({ ...prev, ...savedData }));
        }
        scheduleGameDataCompletion('startup-existing-save', { fullScan: true });

        const lastContent = getLastMessageContent();
        initLogger.log('getLastMessageContent 返回长度:', lastContent.length);
        if (lastContent) {
          setCurrentMaintext(lastContent);
          setCurrentOptions(parseOptions(lastContent));
          initLogger.log('已设置 maintext 和 options');
        }

        setCurrentPage('game');
        initLogger.log('✅ 已跳转到游戏界面');
      } else if (sessionState === 'opening') {
        initLogger.log('检测到已初始化但尚未开局的存档，进入开局输入界面');

        const savedData = readGameDataPure();
        initLogger.log('readGameDataPure 返回:', savedData ? '有数据' : 'null');
        if (savedData) {
          setGameState(prev => ({ ...prev, ...savedData }));
        }
        scheduleGameDataCompletion('startup-opening-save', { fullScan: true });
        setCurrentMaintext('');
        setCurrentOptions([]);
        setOpeningWelcomeLine(getRandomOpeningLine());
        setCurrentPage('opening');
        initLogger.log('✅ 已跳转到开局输入界面');
      } else {
        initLogger.log('未检测到存档，进入开始界面');
        setCurrentPage('start');
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.WuxiaRegexDebug = {
      dump: (reason?: string) => logRegexDebugSnapshot(displaySettings, currentPresetName, reason ?? '控制台手动调用'),
      getSnapshot: () => getRegexDebugSnapshot(displaySettings, currentPresetName),
    };

    return () => {
      if (window.WuxiaRegexDebug?.getSnapshot) {
        delete window.WuxiaRegexDebug;
      }
    };
  }, [currentPresetName, displaySettings]);

  const persistDisplaySettings = useCallback(
    (updater: DisplaySettings | ((previousSettings: DisplaySettings) => DisplaySettings)) => {
      setDisplaySettings(previousSettings => {
        const nextSettings =
          typeof updater === 'function'
            ? (updater as (previousSettings: DisplaySettings) => DisplaySettings)(previousSettings)
            : updater;
        saveSettings(nextSettings);
        return nextSettings;
      });
    },
    [],
  );

  // 设置更改处理函数
  const handleSettingsChange = useCallback(
    (newSettings: DisplaySettings) => {
      persistDisplaySettings(newSettings);
    },
    [persistDisplaySettings],
  );

  useEffect(() => {
    const syncCurrentPresetName = () => {
      setCurrentPresetName(getLoadedPresetNameSafe());
    };

    const presetChangedListener = eventOn(tavern_events.PRESET_CHANGED, data => {
      const nextPresetName = (data?.name || '').trim();
      setCurrentPresetName(nextPresetName || getLoadedPresetNameSafe());
    });
    const oaiPresetChangedListener = eventOn(tavern_events.OAI_PRESET_CHANGED_AFTER, syncCurrentPresetName);
    const presetRenamedListener = eventOn(tavern_events.PRESET_RENAMED, data => {
      const oldName = (data?.oldName || '').trim();
      const newName = (data?.newName || '').trim();
      if (!oldName || !newName || oldName === newName) {
        return;
      }

      persistDisplaySettings(previousSettings => renamePresetRegexBucket(previousSettings, oldName, newName));
      setCurrentPresetName(previousPresetName => (previousPresetName === oldName ? newName : previousPresetName));
    });

    return () => {
      presetChangedListener.stop();
      oaiPresetChangedListener.stop();
      presetRenamedListener.stop();
    };
  }, [persistDisplaySettings]);

  const activeRegexRules = useMemo(
    () => getRegexRulesForDisplay(displaySettings, currentPresetName),
    [displaySettings, currentPresetName],
  );
  const variableEditorCapability = useMemo(() => resolveVariableEditorCapability(), []);
  const queuedTravelLocations = useMemo(
    () =>
      commands.flatMap(command => (command.type === 'TRAVEL' && command.data.location ? [command.data.location] : [])),
    [commands],
  );
  const mapPreviewLocations = useMemo(
    () => (mapDraftDestination ? [mapDraftDestination] : queuedTravelLocations),
    [mapDraftDestination, queuedTravelLocations],
  );

  const handlePlayerSend = useCallback(
    async (message: string) => {
      await sendMessageWithCommands(message, handleSendMessage);
      setIsCommandQueueOpen(false);
    },
    [handleSendMessage, sendMessageWithCommands],
  );

  const handleMapNavClick = useCallback(() => {
    setMapDraftDestination(null);
    handleNavClick(ActivePanel.MAP);
  }, [handleNavClick]);

  const handleModalClose = useCallback(() => {
    if (activePanel === ActivePanel.MAP && mapDraftDestination) {
      const origin = getUserCurrentLocation() || gameState.currentLocation || '未知位置';
      setTravelCommand(mapDraftDestination, origin);
    }

    setMapDraftDestination(null);
    closeModal();
  }, [activePanel, closeModal, gameState.currentLocation, mapDraftDestination, setTravelCommand]);

  // 应用正则替换到主文本
  const processedMaintext = useMemo(() => {
    if (!currentMaintext || activeRegexRules.length === 0) {
      return currentMaintext;
    }
    return applyRegexRules(currentMaintext, activeRegexRules);
  }, [activeRegexRules, currentMaintext]);

  // 续写江湖处理
  const handleContinue = useCallback(() => {
    gameLogger.log('');
    gameLogger.log('续写江湖 - 加载存档');
    clearVariableChanges();

    const savedData = readGameDataPure();
    gameLogger.log('readGameDataPure 返回:', savedData ? '有数据' : 'null');
    if (savedData) {
      setGameState(prev => ({ ...prev, ...savedData }));
    }
    scheduleGameDataCompletion('continue-existing-save', { fullScan: true });

    const lastContent = getLastMessageContent();
    gameLogger.log('getLastMessageContent 返回长度:', lastContent.length);
    if (lastContent) {
      setCurrentMaintext(lastContent);
      setCurrentOptions(parseOptions(lastContent));
      gameLogger.log('🔧 调试模式：直接显示完整消息内容');
    }

    setCurrentPage('game');
    gameLogger.log('✅ 加载完成，进入游戏');
  }, [clearVariableChanges, setGameState, setCurrentMaintext, setCurrentOptions, setCurrentPage]);

  // 新游戏设置提交处理
  const handleSetupSubmit = useCallback(
    async (formData: NewGameFormData) => {
      setIsLoading(true);
      showLoading('正在初始化角色...');

      try {
        const result = await initializeNewGameSession(formData);

        if (result.success && result.content) {
          setOpeningWelcomeLine(result.content);

          dismissToast();

          gameLogger.log('📖 从变量表重新读取游戏状态...');
          const savedData = readGameDataPure();
          gameLogger.log('readGameDataPure 返回:', savedData ? '有数据' : 'null');
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
                hour: 11,
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
                realm: '三流圆满',
                cultivation: 200,
                attributes: {
                  hp: 1000,
                  mp: 800,
                  臂力: formData.initialAttributes.臂力 * 10,
                  根骨: formData.initialAttributes.根骨 * 10,
                  机敏: formData.initialAttributes.机敏 * 10,
                  悟性: formData.initialAttributes.悟性 * 10,
                  洞察: formData.initialAttributes.洞察 * 10,
                },
                biography: formData.origin,
              },
            }));
          }
          scheduleGameDataCompletion('new-game-setup-submit', { fullScan: true });

          setSavedGameExists(true);
          setCurrentMaintext('');
          setCurrentOptions([]);
          clearVariableChanges();
          gameLogger.log('✅ 欢迎语已设置到开局输入界面');
          gameLogger.log('欢迎语:', result.content);

          setCurrentPage('opening');
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
    },
    [
      clearVariableChanges,
      setIsLoading,
      showLoading,
      showError,
      dismissToast,
      setGameState,
      setCurrentMaintext,
      setCurrentOptions,
      setSavedGameExists,
      setCurrentPage,
    ],
  );

  const handleOpeningSend = useCallback(
    async (message: string) => {
      await handleSendMessage(message);

      const lastContent = getLastMessageContent();
      if (lastContent) {
        setCurrentMaintext(lastContent);
        setCurrentOptions(parseOptions(lastContent));
        setCurrentPage('game');
      }
    },
    [handleSendMessage, setCurrentMaintext, setCurrentOptions, setCurrentPage],
  );

  const getModalTitle = (panel: ActivePanel) => {
    switch (panel) {
      case ActivePanel.CHARACTER:
        return '侠客状态';
      case ActivePanel.MARTIAL_ARTS:
        return '武学秘籍';
      case ActivePanel.EVENTS:
        return '江湖轶事';
      case ActivePanel.INVENTORY:
        return '行囊包裹';
      case ActivePanel.MAP:
        return '九州舆图';
      case ActivePanel.SOCIAL:
        return '江湖侠缘';
      case ActivePanel.SETTINGS:
        return '界面设置';
      case ActivePanel.SAVE_LOAD:
        return '存档与分叉';
      default:
        return '';
    }
  };

  const renderModalContent = () => {
    switch (activePanel) {
      case ActivePanel.CHARACTER:
        return <CharacterPanel stats={gameState.stats} worldTime={gameState.worldTime} />;
      case ActivePanel.MARTIAL_ARTS:
        return (
          <MartialArtsPanel
            martialArts={gameState.stats.martialArts}
            cultivation={gameState.stats.cultivation}
            comprehension={gameState.stats.initialAttributes?.悟性 ?? 10}
          />
        );
      case ActivePanel.EVENTS:
        return <EventsPanel events={gameState.events} />;
      case ActivePanel.MAP:
        return (
          <MapPanel
            currentLocation={gameState.currentLocation}
            plannedLocations={mapPreviewLocations}
            onDestinationSelect={setMapDraftDestination}
          />
        );
      case ActivePanel.INVENTORY:
        return <InventoryPanel items={gameState.inventory} />;
      case ActivePanel.SOCIAL:
        return <SocialPanel npcs={gameState.social} />;
      case ActivePanel.SETTINGS:
        return (
          <SettingsPanel
            currentPresetName={currentPresetName}
            settings={displaySettings}
            onSettingsChange={handleSettingsChange}
            variableEditorCapability={variableEditorCapability}
            latestDebugRound={latestDebugRound}
            onClearDebugLogs={clearDebugLogs}
            onAutoAdvanceTurn={handleAutoAdvanceTurn}
            isGenerating={isLoading}
          />
        );
      case ActivePanel.SAVE_LOAD:
        return <SaveLoadPanel gameState={gameState} onClose={closeModal} />;
      default:
        return null;
    }
  };

  // 根据页面状态渲染不同内容
  if (currentPage === 'booting') {
    return <div className="booting-screen" aria-label="正在载入"></div>;
  }

  if (currentPage === 'start') {
    return <StartScreen onStart={handleStart} />;
  }

  if (currentPage === 'splash') {
    return <SplashScreen hasSavedGame={savedGameExists} onNewGame={handleNewGame} onContinue={handleContinue} />;
  }

  if (currentPage === 'setup') {
    return (
      <>
        <StatusToast state={toastState} onDismiss={dismissToast} autoHideDelay={8000} />
        <NewGameSetup onSubmit={handleSetupSubmit} onBack={handleSetupBack} isLoading={isLoading} />
      </>
    );
  }

  if (currentPage === 'opening') {
    return (
      <>
        <StatusToast state={toastState} onDismiss={dismissToast} autoHideDelay={8000} />
        <OpeningScreen
          welcomeLine={openingWelcomeLine}
          playerName={gameState.stats.name}
          location={gameState.currentLocation}
          isLoading={isLoading}
          onSend={handleOpeningSend}
        />
      </>
    );
  }

  // 主游戏界面
  return (
    <div className="app-container">
      <StatusToast state={toastState} onDismiss={dismissToast} autoHideDelay={8000} />

      {/* Background Ambience Layer */}
      <div className="bg-layer">
        <div
          className="bg-img"
          style={
            displaySettings.backgroundImage
              ? {
                  backgroundImage: `url(${displaySettings.backgroundImage})`,
                  opacity: displaySettings.backgroundOpacity,
                  ...(displaySettings.backgroundBlur > 0
                    ? { filter: `blur(${displaySettings.backgroundBlur}px)` }
                    : {}),
                }
              : undefined
          }
        ></div>
        <div
          className="bg-gradient-vert"
          style={{
            background: `linear-gradient(
              to bottom,
              ${displaySettings.backgroundColor}99 0%,
              ${displaySettings.backgroundColor}33 28%,
              transparent 52%,
              transparent 72%,
              ${displaySettings.backgroundColor}33 90%,
              ${displaySettings.backgroundColor}99 100%
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
        <div className={`nav-sidebar-overlay ${isSidebarOpen ? 'active' : ''}`} onClick={closeSidebar} />

        {/* Navigation Sidebar */}
        <nav className={`nav-sidebar ${isSidebarOpen ? 'open' : ''}`}>
          <div className="logo-box">
            <span className="logo-char">墨</span>
          </div>

          <NavButton
            icon={<Icons.Character />}
            label="状态"
            isActive={activePanel === ActivePanel.CHARACTER}
            onClick={() => handleNavClick(ActivePanel.CHARACTER)}
          />
          <NavButton
            icon={<Icons.Manual />}
            label="功法"
            isActive={activePanel === ActivePanel.MARTIAL_ARTS}
            onClick={() => handleNavClick(ActivePanel.MARTIAL_ARTS)}
          />
          <NavButton
            icon={<Icons.Inventory />}
            label="行囊"
            isActive={activePanel === ActivePanel.INVENTORY}
            onClick={() => handleNavClick(ActivePanel.INVENTORY)}
          />
          <NavButton
            icon={<Icons.Quest />}
            label="事件"
            isActive={activePanel === ActivePanel.EVENTS}
            onClick={() => handleNavClick(ActivePanel.EVENTS)}
          />
          <NavButton
            icon={<Icons.Map />}
            label="地图"
            isActive={activePanel === ActivePanel.MAP}
            onClick={handleMapNavClick}
          />
          <NavButton
            icon={<Icons.Social />}
            label="侠缘"
            isActive={activePanel === ActivePanel.SOCIAL}
            onClick={() => handleNavClick(ActivePanel.SOCIAL)}
          />
          <NavButton
            icon={<Icons.Settings />}
            label="设置"
            isActive={activePanel === ActivePanel.SETTINGS}
            onClick={() => handleNavClick(ActivePanel.SETTINGS)}
          />
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
              <button
                type="button"
                className={`header-action-btn ${activePanel === ActivePanel.SAVE_LOAD ? 'active' : ''}`}
                onClick={() => setActivePanel(ActivePanel.SAVE_LOAD)}
                title="存档与分叉"
                aria-label="存档与分叉"
              >
                <Icons.Variables size={14} />
              </button>
              <FullscreenButton className="header-fullscreen-btn header-fullscreen-btn-small" />

              <div className="status-bars-container">
                <div className="bar-group">
                  <span className="bar-label">血</span>
                  <div className="bar-bg">
                    <div
                      className="bar-fill-hp"
                      style={{ width: `${Math.min(100, gameState.stats.attributes.hp)}%` }}
                    ></div>
                  </div>
                </div>
                <div className="bar-group">
                  <span className="bar-label">气</span>
                  <div className="bar-bg">
                    <div
                      className="bar-fill-mp"
                      style={{ width: `${Math.min(100, gameState.stats.attributes.mp)}%` }}
                    ></div>
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
              onSelectOption={handlePlayerSend}
              settings={displaySettings}
            />
          </section>

          <div className="variable-change-dock">
            <VariableChangeBar summary={variableChanges || null} />
          </div>

          {/* 底部聊天输入区域 */}
          <ChatInput
            onSend={handlePlayerSend}
            extraActions={
              <div className="command-queue-anchor">
                <CommandQueueButton commands={commands} onClick={() => setIsCommandQueueOpen(open => !open)} />
                {isCommandQueueOpen && (
                  <CommandQueuePopover
                    commands={commands}
                    onCancel={cancelCommand}
                    onClose={() => setIsCommandQueueOpen(false)}
                  />
                )}
              </div>
            }
            onRegenerate={handleRegenerateLastAssistant}
            canRegenerate={canRegenerate}
            isRegenerating={isLoading}
            disabled={isLoading}
            placeholder="书写你的江湖故事..."
          />
        </main>
      </div>

      {/* Modals */}
      <Modal
        isOpen={activePanel !== ActivePanel.NONE}
        onClose={handleModalClose}
        title={getModalTitle(activePanel)}
        type={activePanel}
      >
        {renderModalContent()}
      </Modal>
    </div>
  );
};

const NavButton = ({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) => (
  <button onClick={onClick} className={`nav-btn ${isActive ? 'active' : ''}`}>
    {isActive && <div className="nav-btn-indicator"></div>}
    <div className="nav-icon-wrapper">{icon}</div>
    <span className="nav-label">{label}</span>
  </button>
);

export default App;
