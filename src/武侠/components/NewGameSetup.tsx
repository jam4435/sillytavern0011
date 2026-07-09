import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterBuild, CharacterTrait, InitialAttributes, OriginCategory, RealmLevel, SetupStep } from '../types';
import { ATTRIBUTE_DESCRIPTIONS, ATTRIBUTE_NAMES, getTraitType } from '../types';
import {
  calculateAttributeCost,
  calculateLuckAttributeCost,
  CHARACTER_TRAITS,
  DEFAULT_ATTRIBUTES,
  getOriginRealmAndCultivation,
  getTriggeredTraitsByAttribute,
  MAX_ATTRIBUTE_VALUE,
  MAX_LUCK_VALUE,
  MIN_ATTRIBUTE_VALUE,
  MIN_LUCK_VALUE,
  ORIGIN_OPTIONS,
  REALM_CULTIVATION_MAP,
  REALM_LEVELS,
  STORY_EVENTS,
  TALENT_TIERS,
  type EventLocation,
  type NewGameFormData,
} from '../utils/gameInitializer';
import {
  getAvatarFromRef,
  getAvatarsByGender,
  getDefaultAvatarRefForGender,
  toCustomAvatarRef,
  toPresetAvatarRef,
  type AvatarGender,
} from '../utils/avatarCatalog';
import {
  createAvatarEntityKey,
  imageFileToDataUrl,
  readAvatarSelection,
  resolveAvatarSource,
  saveAvatarSelection,
  saveCustomAvatar,
} from '../utils/avatarStorage';
import {
  getAllMartialArtNames,
  getMartialArtData,
  isDatabaseLoaded,
  loadMartialArtsDatabase,
  type MartialArtData,
  type MartialArtsRank
} from '../utils/martialArtsDatabase';
import { gameLogger } from '../utils/logger';

/**
 * 从境界字符串中提取大境界名，用于派生 CSS 类名 realm-<大境界>。
 * 兼容 OLD 格式（"三流初期" → "三流"）与裸 "不入流"（无小境界后缀，原样返回）。
 */
const realmMajor = (realm: string): string =>
  realm.replace(/(初期|中期|后期|圆满)$/, '');

// 武功品阶点数消耗（直接选择）- 统一到总点数池
const RANK_POINT_COST: Record<MartialArtsRank, number> = {
  '粗浅': 2,
  '传家': 4,
  '上乘': 8,
  '镇派': 12,
  '绝世': 18,
  '传说': 30,
};

// 武功混合池抽卡费用（统一费用，随机抽取任意品阶）
const MARTIAL_ARTS_DRAW_COST = 5; // 花费5点随机抽取武功

// 天赋抽卡费用（统一提高门槛）
const TRAIT_DRAW_COST = {
  positive: 5,  // 正面天赋抽卡费用（统一5点）
  negative: 0,  // 负面天赋抽卡（免费，但必须接受结果）
  mixed: 3,     // 混合池抽卡费用（随机正面或负面）
};

interface NewGameSetupProps {
  onSubmit: (formData: NewGameFormData) => void;
  onBack: () => void;
  isLoading: boolean;
}

// 角色存档 localStorage key
const SAVED_BUILDS_KEY = 'wuxia_character_builds';

// 自定义天赋 localStorage key
const CUSTOM_TRAITS_KEY = 'wuxia_custom_traits';
const PLAYER_AVATAR_ENTITY_KEY = createAvatarEntityKey('player');

// 自定义天赋接口
interface CustomTrait {
  id: string;
  name: string;
  description: string;
  cost: number;
  createdAt: number;
}

/**
 * 开局设置表单组件 - 高端玻璃拟态设计
 * 新版7步流程：天资 -> 属性 -> 天赋 -> 武功 -> 出身 -> 身份 -> 确认
 */
const NewGameSetup: React.FC<NewGameSetupProps> = ({ onSubmit, onBack, isLoading }) => {
  // ============================================
  // 新版7步流程状态
  // ============================================
  
  // 当前步骤 (新版使用 SetupStep 类型)
  const [currentStep, setCurrentStep] = useState<SetupStep>('talent');
  
  // 步骤1: 天资选择
  const [selectedTalentId, setSelectedTalentId] = useState<string>('talented'); // 默认选择良才
  const [savedBuilds, setSavedBuilds] = useState<CharacterBuild[]>([]);
  
  // 步骤2: 属性分配 (新点数系统)
  const [attributes, setAttributes] = useState<InitialAttributes>({ ...DEFAULT_ATTRIBUTES });
  
  // 步骤3: 天赋选择
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [drawnTraits, setDrawnTraits] = useState<string[]>([]); // 抽卡获得的天赋（不可取消）
  const [traitDrawCostUsed, setTraitDrawCostUsed] = useState(0); // 天赋抽卡消耗的点数
  const [traitSearchQuery, setTraitSearchQuery] = useState('');
  const [customTraitInput, setCustomTraitInput] = useState('');
  
  // 自定义天赋状态
  const [customTraits, setCustomTraits] = useState<CustomTrait[]>([]);
  const [newCustomTraitName, setNewCustomTraitName] = useState('');
  const [newCustomTraitDesc, setNewCustomTraitDesc] = useState('');
  const [newCustomTraitCost, setNewCustomTraitCost] = useState(0);
  const [showCustomTraitForm, setShowCustomTraitForm] = useState(false);
  
  // 基础信息状态 (后续步骤使用)
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'男' | '女'>('男');
  const [selectedAvatarRef, setSelectedAvatarRef] = useState<string>(
    () => readAvatarSelection(PLAYER_AVATAR_ENTITY_KEY)?.avatarRef || getDefaultAvatarRefForGender('男'),
  );
  const [appearance, setAppearance] = useState('');
  const [age, setAge] = useState(18);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  
  // 时间地点状态
  const [useEventLocation, setUseEventLocation] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState(STORY_EVENTS[0]?.id || '');
  const [eventSearchQuery, setEventSearchQuery] = useState(''); // 事件搜索关键词
  const [customLocation, setCustomLocation] = useState('');
  const [customYear, setCustomYear] = useState(1199);
  const [customMonth, setCustomMonth] = useState(8);
  const [customDay, setCustomDay] = useState(15);
  
  // 步骤4: 武功选择状态
  const [selectedMartialArts, setSelectedMartialArts] = useState<string[]>([]); // 已选武功名称列表
  const [drawnMartialArts, setDrawnMartialArts] = useState<string[]>([]); // 抽卡获得的武功（不可取消）
  const [martialArtsDrawCostUsed, setMartialArtsDrawCostUsed] = useState(0); // 武功抽卡消耗的点数
  const [martialArtsDatabase, setMartialArtsDatabase] = useState<MartialArtData[]>([]); // 功法数据库
  const [martialArtsLoading, setMartialArtsLoading] = useState(false);
  const [martialArtsFilter, setMartialArtsFilter] = useState<MartialArtsRank | 'all'>('all');
  const [martialArtsSearch, setMartialArtsSearch] = useState('');
  // 注意：武功点数已统一到总点数池，不再使用独立的 martialArtsPoints 状态
  
  // 步骤5: 出身选择状态
  const [selectedOrigin, setSelectedOrigin] = useState<string>(ORIGIN_OPTIONS[0]?.id || '');
  const [customOrigin, setCustomOrigin] = useState('');
  const [customRealm, setCustomRealm] = useState<RealmLevel>('三流圆满'); // 自定义出身的境界选择
  const [originCategoryFilter, setOriginCategoryFilter] = useState<OriginCategory | 'all'>('all'); // 出身类别筛选
  
  // 错误状态
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // 提示消息状态
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  
  // 显示提示消息
  const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    // 3秒后自动清除
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const genderAvatarOptions = useMemo(() => getAvatarsByGender(gender as AvatarGender), [gender]);
  const selectedAvatar = useMemo(() => getAvatarFromRef(selectedAvatarRef), [selectedAvatarRef]);
  const selectedAvatarSource = useMemo(
    () =>
      resolveAvatarSource({
        entityKey: PLAYER_AVATAR_ENTITY_KEY,
        avatarRef: selectedAvatarRef,
        name: name || '少侠',
        gender,
      }),
    [gender, name, selectedAvatarRef],
  );

  useEffect(() => {
    const isCustomAvatarRef = selectedAvatarRef?.startsWith('custom:');

    if (!selectedAvatarRef) {
      const nextAvatarRef = getDefaultAvatarRefForGender(gender);
      saveAvatarSelection(PLAYER_AVATAR_ENTITY_KEY, nextAvatarRef);
      setSelectedAvatarRef(nextAvatarRef);
      return;
    }

    if (!isCustomAvatarRef && !selectedAvatar) {
      const nextAvatarRef = getDefaultAvatarRefForGender(gender);
      saveAvatarSelection(PLAYER_AVATAR_ENTITY_KEY, nextAvatarRef);
      setSelectedAvatarRef(nextAvatarRef);
      return;
    }

    if (selectedAvatar && (selectedAvatar.gender !== gender || selectedAvatar.usage !== 'player')) {
      const nextAvatarRef = getDefaultAvatarRefForGender(gender);
      saveAvatarSelection(PLAYER_AVATAR_ENTITY_KEY, nextAvatarRef);
      setSelectedAvatarRef(nextAvatarRef);
    }
  }, [gender, selectedAvatar, selectedAvatarRef]);

  const handleAvatarUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      try {
        const imageData = await imageFileToDataUrl(file);
        saveCustomAvatar(PLAYER_AVATAR_ENTITY_KEY, imageData, file.name);
        const avatarRef = toCustomAvatarRef(PLAYER_AVATAR_ENTITY_KEY);
        saveAvatarSelection(PLAYER_AVATAR_ENTITY_KEY, avatarRef);
        setSelectedAvatarRef(avatarRef);
        showNotification('success', '自定义头像已保存');
      } catch (error) {
        showNotification('error', error instanceof Error ? error.message : '头像上传失败');
      } finally {
        if (avatarFileInputRef.current) {
          avatarFileInputRef.current.value = '';
        }
      }
    },
    [showNotification],
  );

  const handlePresetAvatarSelect = useCallback((avatarId: string) => {
    const avatarRef = toPresetAvatarRef(avatarId);
    saveAvatarSelection(PLAYER_AVATAR_ENTITY_KEY, avatarRef);
    setSelectedAvatarRef(avatarRef);
  }, []);
  
  // ============================================
  // 加载武功数据库
  // ============================================
  useEffect(() => {
    const loadDatabase = async () => {
      setMartialArtsLoading(true);
      try {
        await loadMartialArtsDatabase();
        if (isDatabaseLoaded()) {
          const allNames = getAllMartialArtNames();
          const allArts: MartialArtData[] = [];
          for (const name of allNames) {
            const data = getMartialArtData(name);
            if (data) {
              allArts.push(data);
            }
          }
          setMartialArtsDatabase(allArts);
        }
      } catch (e) {
        gameLogger.warn('无法加载武功数据库:', e);
      } finally {
        setMartialArtsLoading(false);
      }
    };
    loadDatabase();
  }, []);
  
  // ============================================
  // 计算属性
  // ============================================
  
  // 当前选中的天资
  const selectedTalent = useMemo(() => {
    return TALENT_TIERS.find(t => t.id === selectedTalentId);
  }, [selectedTalentId]);
  
  // 总可用点数
  const totalPoints = selectedTalent?.totalPoints ?? 30;
  
  // 计算属性消耗的点数（包含福缘，使用阶梯点数机制）
  const attributePointsUsed = useMemo(() => {
    let total = 0;
    for (const key of Object.keys(attributes) as Array<keyof InitialAttributes>) {
      if (key === '福缘') {
        // 福缘：使用福缘专用的阶梯点数计算（范围 [-6, 14]，基础值 0）
        total += calculateLuckAttributeCost(attributes[key]);
      } else {
        total += calculateAttributeCost(attributes[key]);
      }
    }
    return total;
  }, [attributes]);
  
  // 计算选中武功消耗的点数（统一到总点数池）
  // 注意：抽卡获得的武功不计入品阶cost，因为抽卡费用已经单独记录
  const martialArtsPointsUsed = useMemo(() => {
    let total = 0;
    for (const artName of selectedMartialArts) {
      // 抽卡获得的武功不计入品阶cost（抽卡费用已经单独记录）
      if (drawnMartialArts.includes(artName)) {
        continue;
      }
      const art = martialArtsDatabase.find(a => a.功法名称 === artName);
      if (art) {
        total += RANK_POINT_COST[art.功法品阶];
      }
    }
    return total;
  }, [selectedMartialArts, martialArtsDatabase, drawnMartialArts]);
  
  // 计算选中天赋消耗的点数（包含自定义天赋）
  // 注意：抽卡获得的天赋不计入cost，因为抽卡费用已经包含了天赋的价值
  const traitPointsUsed = useMemo(() => {
    let total = 0;
    for (const traitName of selectedTraits) {
      // 抽卡获得的天赋不计入cost（抽卡费用已经包含了天赋的价值）
      if (drawnTraits.includes(traitName)) {
        continue;
      }
      // 先查找预设天赋
      const trait = CHARACTER_TRAITS.find(t => t.name === traitName);
      if (trait && trait.cost !== undefined) {
        total += trait.cost;
      } else {
        // 再查找自定义天赋
        const customTrait = customTraits.find(t => t.name === traitName);
        if (customTrait) {
          total += customTrait.cost;
        }
      }
    }
    return total;
  }, [selectedTraits, customTraits, drawnTraits]);
  
  // 剩余点数（统一点数池：总点数 - 属性消耗 - 天赋消耗 - 武功消耗 - 抽卡消耗）
  const remainingPoints = totalPoints - attributePointsUsed - traitPointsUsed - martialArtsPointsUsed - traitDrawCostUsed - martialArtsDrawCostUsed;
  
  // 属性触发的天赋
  const attributeTriggeredTraits = useMemo(() => {
    const triggered: CharacterTrait[] = [];
    for (const key of Object.keys(attributes) as Array<keyof InitialAttributes>) {
      const traits = getTriggeredTraitsByAttribute(key, attributes[key]);
      triggered.push(...traits);
    }
    return triggered;
  }, [attributes]);
  
  // ============================================
  // 存档数据验证函数
  // ============================================
  
  /**
   * 验证 CharacterBuild 对象是否有效
   * 处理旧版存档兼容性
   */
  const validateCharacterBuild = useCallback((build: unknown): build is CharacterBuild => {
    if (!build || typeof build !== 'object') return false;
    const b = build as Record<string, unknown>;
    
    // 必需字段检查
    if (typeof b.id !== 'string' || !b.id) return false;
    if (typeof b.name !== 'string') return false;
    if (typeof b.createdAt !== 'number') return false;
    if (typeof b.talentTier !== 'string') return false;
    
    // attributes 检查
    if (!b.attributes || typeof b.attributes !== 'object') return false;
    
    // traits 和 martialArts 应该是数组
    if (!Array.isArray(b.traits)) return false;
    if (!Array.isArray(b.martialArts)) return false;
    
    return true;
  }, []);

  /**
   * 从 localStorage 加载并验证存档列表
   */
  const loadSavedBuilds = useCallback((): CharacterBuild[] => {
    try {
      const saved = localStorage.getItem(SAVED_BUILDS_KEY);
      if (!saved) return [];
      
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) {
        gameLogger.warn('存档数据格式错误，期望数组');
        return [];
      }
      
      // 过滤有效的存档并补全缺失字段
      const validBuilds = parsed.filter(validateCharacterBuild).map((build: CharacterBuild) => ({
        ...build,
        // 补全可能缺失的字段
        origin: build.origin || '',
        locationInfo: build.locationInfo || {
          year: 1199,
          month: 8,
          day: 15,
          location: '江湖',
        },
        characterInfo: build.characterInfo || {
          name: build.name,
          gender: '男' as const,
          appearance: '',
          age: 18,
        },
      }));
      
      return validBuilds;
    } catch (e) {
      gameLogger.error('加载存档失败:', e);
      showNotification('error', '加载存档失败');
      return [];
    }
  }, [validateCharacterBuild, showNotification]);
  
  // 加载已保存的角色存档
  useEffect(() => {
    const builds = loadSavedBuilds();
    setSavedBuilds(builds);
  }, [loadSavedBuilds]);
  
  // 加载自定义天赋
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_TRAITS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCustomTraits(parsed);
        }
      }
    } catch (e) {
      gameLogger.error('加载自定义天赋失败:', e);
    }
  }, []);
  
  // 保存自定义天赋
  const saveCustomTraits = useCallback((traits: CustomTrait[]) => {
    try {
      localStorage.setItem(CUSTOM_TRAITS_KEY, JSON.stringify(traits));
    } catch (e) {
      gameLogger.error('保存自定义天赋失败:', e);
      showNotification('error', '保存自定义天赋失败');
    }
  }, [showNotification]);
  
  // 添加自定义天赋
  const handleAddCustomTrait = useCallback(() => {
    if (!newCustomTraitName.trim()) {
      showNotification('error', '请输入天赋名称');
      return;
    }
    if (!newCustomTraitDesc.trim()) {
      showNotification('error', '请输入天赋描述');
      return;
    }
    
    // 检查天赋名称是否重复
    const isDuplicate = customTraits.some(t => t.name === newCustomTraitName.trim()) ||
                        CHARACTER_TRAITS.some(t => t.name === newCustomTraitName.trim());
    if (isDuplicate) {
      showNotification('error', '天赋名称已存在');
      return;
    }
    
    const newTrait: CustomTrait = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: newCustomTraitName.trim(),
      description: newCustomTraitDesc.trim(),
      cost: newCustomTraitCost,
      createdAt: Date.now(),
    };
    
    const updatedTraits = [...customTraits, newTrait];
    setCustomTraits(updatedTraits);
    saveCustomTraits(updatedTraits);
    
    // 重置表单
    setNewCustomTraitName('');
    setNewCustomTraitDesc('');
    setNewCustomTraitCost(0);
    setShowCustomTraitForm(false);
    
    showNotification('success', `自定义天赋「${newTrait.name}」已保存`);
  }, [newCustomTraitName, newCustomTraitDesc, newCustomTraitCost, customTraits, saveCustomTraits, showNotification]);
  
  // 删除自定义天赋
  const handleDeleteCustomTrait = useCallback((traitId: string, traitName: string) => {
    const confirmMessage = `确定要删除自定义天赋「${traitName}」吗？`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    const updatedTraits = customTraits.filter(t => t.id !== traitId);
    setCustomTraits(updatedTraits);
    saveCustomTraits(updatedTraits);
    
    // 如果该天赋已被选中，也从选中列表中移除
    if (selectedTraits.includes(traitName)) {
      setSelectedTraits(prev => prev.filter(name => name !== traitName));
    }
    
    showNotification('success', `自定义天赋「${traitName}」已删除`);
  }, [customTraits, saveCustomTraits, selectedTraits, showNotification]);

  // 获取当前选中的事件（移到存档操作函数之前，以便在 handleSaveBuild 中使用）
  const selectedEvent = useMemo(() => {
    return STORY_EVENTS.find(e => e.id === selectedEventId);
  }, [selectedEventId]);

  // ============================================
  // 存档操作函数
  // ============================================
  
  /**
   * 保存当前角色配置到存档
   */
  const handleSaveBuild = useCallback(() => {
    try {
      // 询问用户是否添加备注
      const note = window.prompt('为这个存档添加备注（可选）：\n用于区分同名角色，例如：剑客、医师、反派等', '');

      // 如果用户点击取消，note 为 null，则不保存
      if (note === null) {
        return;
      }

      // 获取当前事件（使用 selectedEventId 直接查找，避免依赖问题）
      const currentEvent = STORY_EVENTS.find(e => e.id === selectedEventId);

      const newBuild: CharacterBuild = {
        id: `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name.trim() || `未命名角色_${new Date().toLocaleDateString()}`,
        note: note.trim() || undefined, // 保存备注，空字符串则不保存
        createdAt: Date.now(),
        talentTier: selectedTalentId,
        attributes: { ...attributes },
        traits: [...selectedTraits],
        martialArts: [...selectedMartialArts],
        origin: selectedOrigin === 'custom' ? customOrigin : selectedOrigin,
        locationInfo: useEventLocation && currentEvent ? {
          year: currentEvent.year,
          month: currentEvent.month,
          day: currentEvent.day,
          location: currentEvent.location,
          eventName: currentEvent.name,
        } : {
          year: customYear,
          month: customMonth,
          day: customDay,
          location: customLocation,
        },
        characterInfo: {
          name: name.trim(),
          gender,
          avatarRef: selectedAvatarRef,
          appearance,
          age,
        },
      };

      const updatedBuilds = [...savedBuilds, newBuild];
      localStorage.setItem(SAVED_BUILDS_KEY, JSON.stringify(updatedBuilds));
      setSavedBuilds(updatedBuilds);
      showNotification('success', `存档「${newBuild.name}」保存成功！`);
    } catch (e) {
      gameLogger.error('保存存档失败:', e);
      showNotification('error', '保存存档失败，请检查浏览器存储空间');
    }
  }, [
    name, selectedTalentId, attributes, selectedTraits, selectedMartialArts,
    selectedOrigin, customOrigin, useEventLocation, selectedEventId,
    customYear, customMonth, customDay, customLocation,
    gender, selectedAvatarRef, appearance, age, savedBuilds, showNotification
  ]);
  
  /**
   * 加载指定存档
   */
  const handleLoadBuild = useCallback((buildToLoad: CharacterBuild) => {
    // 确认加载
    const confirmMessage = `确定要加载存档「${buildToLoad.name}」吗？当前未保存的配置将丢失。`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      // 恢复天资
      setSelectedTalentId(buildToLoad.talentTier);
      
      // 恢复属性
      setAttributes({ ...DEFAULT_ATTRIBUTES, ...buildToLoad.attributes });
      
      // 恢复天赋
      setSelectedTraits([...buildToLoad.traits]);
      
      // 恢复武功（点数消耗会通过 martialArtsPointsUsed 自动计算）
      setSelectedMartialArts([...buildToLoad.martialArts]);
      
      // 恢复出身
      if (buildToLoad.origin) {
        const isPresetOrigin = ORIGIN_OPTIONS.some(o => o.id === buildToLoad.origin);
        if (isPresetOrigin) {
          setSelectedOrigin(buildToLoad.origin);
          setCustomOrigin('');
        } else {
          setSelectedOrigin('custom');
          setCustomOrigin(buildToLoad.origin);
        }
      }
      
      // 恢复时间地点
      if (buildToLoad.locationInfo) {
        const loc = buildToLoad.locationInfo;
        if (loc.eventName) {
          const event = STORY_EVENTS.find(e => e.name === loc.eventName);
          if (event) {
            setUseEventLocation(true);
            setSelectedEventId(event.id);
          } else {
            setUseEventLocation(false);
            setCustomYear(loc.year);
            setCustomMonth(loc.month);
            setCustomDay(loc.day);
            setCustomLocation(loc.location);
          }
        } else {
          setUseEventLocation(false);
          setCustomYear(loc.year);
          setCustomMonth(loc.month);
          setCustomDay(loc.day);
          setCustomLocation(loc.location);
        }
      }
      
      // 恢复角色信息
      if (buildToLoad.characterInfo) {
        const info = buildToLoad.characterInfo;
        setName(info.name || '');
        setGender(info.gender || '男');
        const nextAvatarRef = info.avatarRef || getDefaultAvatarRefForGender(info.gender || '男');
        saveAvatarSelection(PLAYER_AVATAR_ENTITY_KEY, nextAvatarRef);
        setSelectedAvatarRef(nextAvatarRef);
        setAppearance(info.appearance || '');
        setAge(info.age || 18);
      }
      
      // 跳转到确认页面
      setCurrentStep('confirm');
      
      showNotification('success', `存档「${buildToLoad.name}」加载成功！`);
    } catch (e) {
      gameLogger.error('加载存档失败:', e);
      showNotification('error', '加载存档失败');
    }
  }, [martialArtsDatabase, showNotification]);
  
  /**
   * 删除指定存档
   */
  const handleDeleteBuild = useCallback((buildId: string, buildName: string) => {
    const confirmMessage = `确定要删除存档「${buildName}」吗？此操作不可撤销。`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const updatedBuilds = savedBuilds.filter(b => b.id !== buildId);
      localStorage.setItem(SAVED_BUILDS_KEY, JSON.stringify(updatedBuilds));
      setSavedBuilds(updatedBuilds);
      showNotification('success', `存档「${buildName}」已删除`);
    } catch (e) {
      gameLogger.error('删除存档失败:', e);
      showNotification('error', '删除存档失败');
    }
  }, [savedBuilds, showNotification]);

  /**
   * 编辑存档备注
   */
  const handleEditNote = useCallback((buildId: string, currentNote: string) => {
    const newNote = window.prompt('编辑备注：\n用于区分同名角色，例如：剑客、医师、反派等', currentNote);

    // 如果用户点击取消，newNote 为 null，则不修改
    if (newNote === null) {
      return;
    }

    try {
      const updatedBuilds = savedBuilds.map(b =>
        b.id === buildId
          ? { ...b, note: newNote.trim() || undefined }
          : b
      );
      localStorage.setItem(SAVED_BUILDS_KEY, JSON.stringify(updatedBuilds));
      setSavedBuilds(updatedBuilds);
      showNotification('success', '备注已更新');
    } catch (e) {
      gameLogger.error('更新备注失败:', e);
      showNotification('error', '更新备注失败');
    }
  }, [savedBuilds, showNotification]);

  // ============================================
  // 新版属性调整方法（基于点数消耗系统）
  // ============================================
  
  // 直接设置属性值（用于滑块拖动）- 新版基于点数消耗
  const setAttributeValue = useCallback((key: keyof InitialAttributes, newValue: number) => {
    setAttributes(prev => {
      // 根据属性类型确定有效范围
      let clampedValue: number;
      if (key === '福缘') {
        // 福缘的范围是 [-6, 14]
        clampedValue = Math.max(MIN_LUCK_VALUE, Math.min(MAX_LUCK_VALUE, newValue));
      } else {
        // 其他属性的范围是 [0, 20]
        clampedValue = Math.max(MIN_ATTRIBUTE_VALUE, Math.min(MAX_ATTRIBUTE_VALUE, newValue));
      }
      
      // 计算如果改变这个属性，新的总点数消耗
      const newAttrs = { ...prev, [key]: clampedValue };
      let newTotalCost = 0;
      for (const k of Object.keys(newAttrs) as Array<keyof InitialAttributes>) {
        if (k === '福缘') {
          // 福缘：使用福缘专用的阶梯点数计算
          newTotalCost += calculateLuckAttributeCost(newAttrs[k]);
        } else {
          newTotalCost += calculateAttributeCost(newAttrs[k]);
        }
      }
      
      // 检查点数是否足够（需要考虑天赋点数消耗）
      const availableForAttrs = totalPoints - traitPointsUsed;
      if (newTotalCost > availableForAttrs) {
        // 如果超出可用点数，不允许增加
        if (clampedValue > prev[key]) {
          return prev; // 拒绝增加
        }
      }
      
      return newAttrs;
    });
  }, [totalPoints, traitPointsUsed]);

  // ============================================
  // 步骤导航逻辑（新版7步流程）
  // ============================================
  
  // 步骤顺序
  const stepOrder: SetupStep[] = ['talent', 'attributes', 'traits', 'martial', 'origin', 'identity', 'confirm'];
  
  // 获取当前步骤索引
  const currentStepIndex = stepOrder.indexOf(currentStep);
  
  // 验证当前步骤是否可以进入下一步
  const validateCurrentStep = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    
    switch (currentStep) {
      case 'talent':
        // 天资选择：必须选择一个天资
        if (!selectedTalentId) {
          newErrors.talent = '请选择天资';
        }
        break;
      case 'attributes':
        // 属性分配：剩余点数不能为负
        if (remainingPoints < 0) {
          newErrors.attributes = '点数不足，请调整属性分配';
        }
        break;
      case 'traits':
        // 天赋选择：剩余点数不能为负
        if (remainingPoints < 0) {
          newErrors.traits = '点数不足，请调整天赋选择';
        }
        break;
      case 'martial':
        // 武功选择：剩余点数不能为负
        if (remainingPoints < 0) {
          newErrors.martial = '点数不足，请调整武功选择';
        }
        break;
      case 'origin':
        // 出身选择：如果选择自定义时间地点，必须填写地点
        if (!useEventLocation && !customLocation.trim()) {
          newErrors.location = '请输入所在地点';
        }
        break;
      case 'identity':
        // 身份设置：必须填写名号、外貌，年龄范围合法
        if (!name.trim()) {
          newErrors.name = '请输入侠客名号';
        } else if (name.length > 10) {
          newErrors.name = '名号不能超过10个字符';
        }
        if (!appearance.trim()) {
          newErrors.appearance = '请描述外貌特征（包含身材描述）';
        }
        if (age < 10 || age > 100) {
          newErrors.age = '年龄应在10-100之间';
        }
        break;
      default:
        break;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [currentStep, selectedTalentId, remainingPoints, useEventLocation, customLocation, name, appearance, age]);
  
  // 进入下一步
  const handleNextStep = useCallback(() => {
    if (validateCurrentStep()) {
      const nextIndex = currentStepIndex + 1;
      if (nextIndex < stepOrder.length) {
        setCurrentStep(stepOrder[nextIndex]);
      }
    }
  }, [validateCurrentStep, currentStepIndex, stepOrder]);
  
  // 返回上一步
  const handlePrevStep = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(stepOrder[prevIndex]);
    }
  }, [currentStepIndex, stepOrder]);
  
  // 是否可以进入下一步
  const canProceedToNext = useMemo(() => {
    switch (currentStep) {
      case 'talent':
        return !!selectedTalentId;
      case 'attributes':
        return remainingPoints >= 0;
      case 'traits':
        return remainingPoints >= 0;
      case 'martial':
        return remainingPoints >= 0;
      case 'origin':
        // 如果选择自定义时间地点，必须填写地点
        return useEventLocation || customLocation.trim().length > 0;
      case 'identity':
        // 必须填写名号、外貌，年龄范围合法
        return name.trim().length > 0 &&
               name.length <= 10 &&
               appearance.trim().length > 0 &&
               age >= 10 && age <= 100;
      default:
        return true;
    }
  }, [currentStep, selectedTalentId, remainingPoints, useEventLocation, customLocation, name, appearance, age]);
  
  // 验证身份信息（用于最终提交前的验证）
  const validateIdentityInfo = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = '请输入侠客名号';
    } else if (name.length > 10) {
      newErrors.name = '名号不能超过10个字符';
    }

    if (!appearance.trim()) {
      newErrors.appearance = '请描述外貌特征（包含身材描述）';
    }

    if (age < 10 || age > 100) {
      newErrors.age = '年龄应在10-100之间';
    }

    if (!useEventLocation && !customLocation.trim()) {
      newErrors.location = '请输入所在地点';
    }

    // 新版点数系统：检查剩余点数是否为负数即可
    // 不再使用旧的 validateAttributes 函数（它检查属性总和等于固定值）
    if (remainingPoints < 0) {
      newErrors.attributes = `点数不足，还需要 ${Math.abs(remainingPoints)} 点`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, appearance, age, useEventLocation, customLocation, remainingPoints]);

  // 提交表单
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证身份信息
    if (!validateIdentityInfo()) {
      return;
    }
    
    // 获取时间地点信息
    let locationInfo: EventLocation;
    if (useEventLocation && selectedEvent) {
      locationInfo = {
        year: selectedEvent.year,
        month: selectedEvent.month,
        day: selectedEvent.day,
        location: selectedEvent.location,
        eventName: selectedEvent.name,
      };
    } else {
      locationInfo = {
        year: customYear,
        month: customMonth,
        day: customDay,
        location: customLocation,
      };
    }

    // 获取出身信息
    const origin = selectedOrigin === 'custom' ? customOrigin :
      ORIGIN_OPTIONS.find(o => o.id === selectedOrigin)?.name || '';

    // 获取出身自带的物品和功法
    const selectedOriginData = ORIGIN_OPTIONS.find(o => o.id === selectedOrigin);
    const originItems = selectedOriginData?.items;
    const originMartialArts = selectedOriginData?.martial_arts;

    onSubmit({
      name: name.trim(),
      gender,
      avatarRef: selectedAvatarRef,
      appearance: appearance.trim(),
      age,
      locationInfo,
      initialAttributes: attributes,
      martialArtId: selectedMartialArts.length > 0 ? selectedMartialArts[0] : '',
      selectedMartialArts: selectedMartialArts, // 新版：传递所有已选功法名称列表
      selectedTraits: selectedTraits, // 传递选择的天赋列表
      origin,
      originId: selectedOrigin,
      customRealm: selectedOrigin === 'custom' ? customRealm : undefined,
      originItems, // 传递出身自带的物品
      originMartialArts, // 传递出身自带的功法
    });
  }, [name, gender, selectedAvatarRef, appearance, age, useEventLocation, selectedEvent,
      customYear, customMonth, customDay, customLocation, attributes,
      selectedMartialArts, selectedTraits, selectedOrigin, customOrigin, customRealm, onSubmit, validateIdentityInfo]);

  // 随机生成外貌（包含身材描述）
  const randomAppearance = () => {
    const maleAppearances = [
      '剑眉星目，器宇不凡，身形修长，稳健如松',
      '面如冠玉，唇红齿白，体格健壮，虎背熊腰',
      '英气逼人，目光如电，身姿矫健，动若脱兔',
      '眉清目秀，温文尔雅，体态匀称，气度从容',
      '容貌俊朗，神采飞扬，身材高大，气势不凡'
    ];
    const femaleAppearances = [
      '明眸皓齿，清丽脱俗，身材高挑，风姿绰约',
      '柳眉杏眼，肤若凝脂，娇小玲珑，灵动可人',
      '英姿飒爽，巾帼不让须眉，身姿矫健，英气勃勃'
    ];
    const options = gender === '男' ? maleAppearances : femaleAppearances;
    setAppearance(options[Math.floor(Math.random() * options.length)]);
  };

  // 获取选中的出身详情
  const selectedOriginDetails = useMemo(() => {
    return ORIGIN_OPTIONS.find(o => o.id === selectedOrigin);
  }, [selectedOrigin]);

  return (
    <div className="setup-screen">
      {/* 通知消息 */}
      {notification && (
        <div className={`notification-toast ${notification.type}`}>
          <span className="notification-icon">
            {notification.type === 'success' && '✓'}
            {notification.type === 'error' && '✕'}
            {notification.type === 'info' && 'ℹ'}
          </span>
          <span className="notification-message">{notification.message}</span>
        </div>
      )}

      {/* 动态背景 */}
      <div className="setup-bg">
        <div className="setup-bg-gradient" />
        <div className="setup-bg-particles" />
        <div className="setup-bg-ink" />
      </div>

      {/* 返回按钮 */}
      <button className="setup-back-btn" onClick={onBack} disabled={isLoading}>
        <span className="back-icon">←</span>
        <span className="back-text">返回</span>
      </button>

      {/* 步骤指示器 - 新版7步 */}
      <div className="setup-steps seven-steps">
        {/* 步骤1: 天资 */}
        <div className={`step-item ${currentStep === 'talent' ? 'active' : currentStepIndex > 0 ? 'completed' : ''}`}>
          <div className="step-number">{currentStepIndex > 0 ? '✓' : '一'}</div>
          <div className="step-label">天资</div>
        </div>
        <div className="step-connector">
          <div className={`step-line ${currentStepIndex >= 1 ? 'active' : ''}`} />
        </div>
        {/* 步骤2: 属性 */}
        <div className={`step-item ${currentStep === 'attributes' ? 'active' : currentStepIndex > 1 ? 'completed' : ''}`}>
          <div className="step-number">{currentStepIndex > 1 ? '✓' : '二'}</div>
          <div className="step-label">属性</div>
        </div>
        <div className="step-connector">
          <div className={`step-line ${currentStepIndex >= 2 ? 'active' : ''}`} />
        </div>
        {/* 步骤3: 天赋 */}
        <div className={`step-item ${currentStep === 'traits' ? 'active' : currentStepIndex > 2 ? 'completed' : ''}`}>
          <div className="step-number">{currentStepIndex > 2 ? '✓' : '三'}</div>
          <div className="step-label">天赋</div>
        </div>
        <div className="step-connector">
          <div className={`step-line ${currentStepIndex >= 3 ? 'active' : ''}`} />
        </div>
        {/* 后续步骤预留（子任务4-7实现） */}
        <div className={`step-item ${currentStep === 'martial' ? 'active' : currentStepIndex > 3 ? 'completed' : ''}`}>
          <div className="step-number">{currentStepIndex > 3 ? '✓' : '四'}</div>
          <div className="step-label">武功</div>
        </div>
        <div className="step-connector">
          <div className={`step-line ${currentStepIndex >= 4 ? 'active' : ''}`} />
        </div>
        <div className={`step-item ${currentStep === 'origin' ? 'active' : currentStepIndex > 4 ? 'completed' : ''}`}>
          <div className="step-number">{currentStepIndex > 4 ? '✓' : '五'}</div>
          <div className="step-label">出身</div>
        </div>
        <div className="step-connector">
          <div className={`step-line ${currentStepIndex >= 5 ? 'active' : ''}`} />
        </div>
        <div className={`step-item ${currentStep === 'identity' ? 'active' : currentStepIndex > 5 ? 'completed' : ''}`}>
          <div className="step-number">{currentStepIndex > 5 ? '✓' : '六'}</div>
          <div className="step-label">身份</div>
        </div>
        <div className="step-connector">
          <div className={`step-line ${currentStepIndex >= 6 ? 'active' : ''}`} />
        </div>
        <div className={`step-item ${currentStep === 'confirm' ? 'active' : ''}`}>
          <div className="step-number">七</div>
          <div className="step-label">确认</div>
        </div>
      </div>

      <div className="setup-content">
        <h2 className="setup-title">
          <span className="title-decoration left">『</span>
          <span className="title-text">创建侠客</span>
          <span className="title-decoration right">』</span>
        </h2>
        
        <form className="setup-form" onSubmit={handleSubmit}>
          {/* ============================================ */}
          {/* 步骤1: 天资选择 */}
          {/* ============================================ */}
          {currentStep === 'talent' && (
            <div className="step-content talent-step">
              {/* 天资选择卡片 */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">✨</span>
                  选择天资
                  <span className="points-badge">
                    可用 {totalPoints} 点
                  </span>
                </h3>
                <p className="section-desc">
                  天资决定了你的起始点数，点数越多可分配到属性和天赋的资源就越丰富。
                </p>
                {errors.talent && <p className="error-text center">{errors.talent}</p>}

                <div className="talent-grid">
                  {TALENT_TIERS.map((tier) => (
                    <div
                      key={tier.id}
                      className={`talent-card ${selectedTalentId === tier.id ? 'selected' : ''}`}
                      onClick={() => setSelectedTalentId(tier.id)}
                    >
                      <div className="talent-icon">{tier.icon}</div>
                      <div className="talent-info">
                        <span className="talent-name">{tier.name}</span>
                        <span className="talent-points">{tier.totalPoints} 点</span>
                      </div>
                      <p className="talent-desc">{tier.description}</p>
                      {selectedTalentId === tier.id && (
                        <div className="selected-indicator">
                          <span>✓</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 已保存的角色存档 */}
              {savedBuilds.length > 0 && (
                <div className="form-section glass-card">
                  <h3 className="section-title">
                    <span className="section-icon">📁</span>
                    已保存的角色
                    <span className="trait-count">{savedBuilds.length} 个</span>
                  </h3>
                  <p className="section-desc">
                    加载已保存的角色配置快速开始游戏，或删除不需要的存档。
                  </p>
                  <div className="saved-builds-list">
                    {savedBuilds.map((buildItem) => (
                      <div key={buildItem.id} className="saved-build-item">
                        <div className="build-info">
                          <span className="build-name">{buildItem.name}</span>
                          {buildItem.note && (
                            <span className="build-note" title={buildItem.note}>
                              {buildItem.note}
                            </span>
                          )}
                          <span className="build-talent">
                            {TALENT_TIERS.find(t => t.id === buildItem.talentTier)?.name || buildItem.talentTier}
                          </span>
                          <span className="build-date">
                            {new Date(buildItem.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="build-actions">
                          <button
                            type="button"
                            className="load-build-btn"
                            onClick={() => handleLoadBuild(buildItem)}
                            title="加载此存档"
                          >
                            加载
                          </button>
                          <button
                            type="button"
                            className="edit-note-btn"
                            onClick={() => handleEditNote(buildItem.id, buildItem.note || '')}
                            title="编辑备注"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="delete-build-btn"
                            onClick={() => handleDeleteBuild(buildItem.id, buildItem.name)}
                            title="删除此存档"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 下一步按钮 */}
              <div className="form-actions">
                <button
                  type="button"
                  className="next-btn"
                  onClick={handleNextStep}
                  disabled={isLoading || !canProceedToNext}
                >
                  <span className="btn-text">下一步</span>
                  <span className="btn-arrow">→</span>
                  <div className="btn-glow" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* 步骤2: 七维属性分配 */}
          {/* ============================================ */}
          {currentStep === 'attributes' && (
            <div className="step-content attributes-step">
              {/* 属性分配卡片 */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">⚔️</span>
                  七维属性分配
                  <span className={`points-badge ${remainingPoints === 0 ? 'complete' : remainingPoints < 0 ? 'error' : ''}`}>
                    剩余 {remainingPoints} 点
                  </span>
                </h3>
                <p className="section-desc">
                  基础值为6，调高消耗点数，调低可获得点数。极端值会触发对应天赋。
                </p>
                {errors.attributes && <p className="error-text center">{errors.attributes}</p>}

                <div className="attributes-grid new-style">
                  {(Object.keys(attributes) as Array<keyof InitialAttributes>).filter(key => key !== '福缘').map((key) => {
                    // 获取当前属性触发的天赋
                    const triggeredForAttr = attributeTriggeredTraits.filter(t =>
                      t.attributeThreshold?.attribute === key
                    );
                    const attrCost = calculateAttributeCost(attributes[key]);
                    
                    return (
                      <div key={key} className="attribute-card enhanced">
                        <div className="attr-header">
                          <span className="attr-name">
                            {ATTRIBUTE_NAMES[key]}
                          </span>
                          <span className="attr-value">{attributes[key]}</span>
                          <span className={`attr-cost ${attrCost > 0 ? 'positive' : attrCost < 0 ? 'negative' : ''}`}>
                            {attrCost > 0 ? `+${attrCost}` : attrCost < 0 ? attrCost : '±0'}
                          </span>
                        </div>
                        <p className="attr-desc">
                          {ATTRIBUTE_DESCRIPTIONS[key]}
                        </p>
                        <div className="attr-controls">
                          <button
                            type="button"
                            className="attr-btn minus"
                            onClick={() => setAttributeValue(key, attributes[key] - 1)}
                            disabled={attributes[key] <= MIN_ATTRIBUTE_VALUE}
                          >
                            −
                          </button>
                          <input
                            type="range"
                            className="attr-slider"
                            min={MIN_ATTRIBUTE_VALUE}
                            max={MAX_ATTRIBUTE_VALUE}
                            value={attributes[key]}
                            onChange={(e) => setAttributeValue(key, Number(e.target.value))}
                            disabled={isLoading}
                          />
                          <button
                            type="button"
                            className="attr-btn plus"
                            onClick={() => setAttributeValue(key, attributes[key] + 1)}
                            disabled={attributes[key] >= MAX_ATTRIBUTE_VALUE}
                          >
                            +
                          </button>
                        </div>
                        {/* 显示触发的天赋预览 */}
                        {triggeredForAttr.length > 0 && (
                          <div className="triggered-traits-preview">
                            {triggeredForAttr.map(trait => (
                              <span
                                key={trait.name}
                                className={`trait-tag ${getTraitType(trait) === '正面' ? 'positive' : 'negative'}`}
                                title={trait.description}
                              >
                                {trait.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 福缘单独一行居中显示，使用和其他属性一样的卡片样式 */}
                <div className="luck-row">
                  {(() => {
                    // 获取福缘触发的天赋
                    const triggeredForLuck = attributeTriggeredTraits.filter(t =>
                      t.attributeThreshold?.attribute === '福缘'
                    );
                    const luckCost = calculateLuckAttributeCost(attributes.福缘);
                    
                    return (
                      <div className="attribute-card enhanced luck-card">
                        <div className="attr-header">
                          <span className="attr-name">🍀 福缘</span>
                          <span className="attr-value">{attributes.福缘}</span>
                          <span className={`attr-cost ${luckCost > 0 ? 'positive' : luckCost < 0 ? 'negative' : ''}`}>
                            {luckCost > 0 ? `+${luckCost}` : luckCost < 0 ? luckCost : '±0'}
                          </span>
                        </div>
                        <p className="attr-desc">
                          气运与造化，影响随机事件和奇遇概率
                        </p>
                        <div className="attr-controls">
                          <button
                            type="button"
                            className="attr-btn minus"
                            onClick={() => setAttributeValue('福缘', attributes.福缘 - 1)}
                            disabled={attributes.福缘 <= MIN_LUCK_VALUE}
                          >
                            −
                          </button>
                          <input
                            type="range"
                            className="attr-slider"
                            min={MIN_LUCK_VALUE}
                            max={MAX_LUCK_VALUE}
                            value={attributes.福缘}
                            onChange={(e) => setAttributeValue('福缘', Number(e.target.value))}
                            disabled={isLoading}
                          />
                          <button
                            type="button"
                            className="attr-btn plus"
                            onClick={() => setAttributeValue('福缘', attributes.福缘 + 1)}
                            disabled={attributes.福缘 >= MAX_LUCK_VALUE}
                          >
                            +
                          </button>
                        </div>
                        {/* 显示触发的天赋预览 */}
                        {triggeredForLuck.length > 0 && (
                          <div className="triggered-traits-preview">
                            {triggeredForLuck.map(trait => (
                              <span
                                key={trait.name}
                                className={`trait-tag ${getTraitType(trait) === '正面' ? 'positive' : 'negative'}`}
                                title={trait.description}
                              >
                                {trait.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 属性触发天赋预览 */}
              {attributeTriggeredTraits.length > 0 && (
                <div className="form-section glass-card">
                  <h3 className="section-title">
                    <span className="section-icon">🔮</span>
                    属性触发天赋预览
                  </h3>
                  <p className="section-desc">
                    这些天赋由你的属性值自动触发，无法取消。
                  </p>
                  <div className="triggered-traits-list">
                    {attributeTriggeredTraits.map(trait => (
                      <div key={trait.name} className={`trait-preview-card ${getTraitType(trait) === '正面' ? 'positive' : 'negative'}`}>
                        <div className="trait-header">
                          <span className="trait-name">{trait.name}</span>
                        </div>
                        <p className="trait-desc">{trait.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 导航按钮 */}
              <div className="form-actions dual">
                <button
                  type="button"
                  className="back-step-btn"
                  onClick={handlePrevStep}
                  disabled={isLoading}
                >
                  <span className="btn-arrow">←</span>
                  <span className="btn-text">上一步</span>
                </button>
                <button
                  type="button"
                  className="next-btn"
                  onClick={handleNextStep}
                  disabled={isLoading || !canProceedToNext}
                >
                  <span className="btn-text">下一步</span>
                  <span className="btn-arrow">→</span>
                  <div className="btn-glow" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* 步骤3: 天赋选择 */}
          {/* ============================================ */}
          {currentStep === 'traits' && (
            <div className="step-content traits-step">
              {/* 已获得天赋（属性触发，不可取消） */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">🔒</span>
                  已获得天赋
                  <span className="trait-count">{attributeTriggeredTraits.length} 个</span>
                </h3>
                <p className="section-desc">
                  这些天赋由你的属性值自动触发，不可取消。
                </p>
                {attributeTriggeredTraits.length > 0 ? (
                  <div className="traits-grid locked">
                    {attributeTriggeredTraits.map(trait => (
                      <div key={trait.name} className={`trait-card locked ${getTraitType(trait) === '正面' ? 'positive' : 'negative'}`}>
                        <div className="trait-header">
                          <span className="trait-name">{trait.name}</span>
                        </div>
                        <p className="trait-desc">{trait.description}</p>
                        <div className="trait-lock-icon">🔒</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-hint">暂无属性触发的天赋</p>
                )}
              </div>

              {/* 天赋抽卡区域 */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">🎴</span>
                  天赋抽取
                  <span className={`points-badge ${remainingPoints >= 0 ? '' : 'error'}`}>
                    剩余 {remainingPoints} 点
                  </span>
                </h3>
                <p className="section-desc">
                  花费点数随机抽取天赋，正面池必得正面天赋，负面池必得负面天赋（免费但必须接受）。
                </p>
                
                <div className="gacha-section trait-gacha">
                  <div className="gacha-pools trait-pools">
                    {/* 正面天赋抽卡 */}
                    <div className={`gacha-pool positive ${remainingPoints < TRAIT_DRAW_COST.positive ? 'disabled' : ''}`}>
                      <div className="pool-header">
                        <span className="pool-rank positive">正面天赋</span>
                        <span className="pool-count">
                          {CHARACTER_TRAITS.filter(t => !t.attributeThreshold && (t.cost ?? 0) > 0 && !selectedTraits.includes(t.name)).length}种可抽
                        </span>
                      </div>
                      <div className="pool-cost">
                        花费 <span className="cost-value">{TRAIT_DRAW_COST.positive}</span> 点
                      </div>
                      <button
                        type="button"
                        className="gacha-btn positive-btn"
                        disabled={remainingPoints < TRAIT_DRAW_COST.positive}
                        onClick={() => {
                          const availableTraits = CHARACTER_TRAITS.filter(
                            t => !t.attributeThreshold && (t.cost ?? 0) > 0 && !selectedTraits.includes(t.name)
                          );
                          if (availableTraits.length === 0) {
                            showNotification('info', '没有可抽取的正面天赋了');
                            return;
                          }
                          const randomIndex = Math.floor(Math.random() * availableTraits.length);
                          const drawnTrait = availableTraits[randomIndex];
                          setSelectedTraits(prev => [...prev, drawnTrait.name]);
                          setDrawnTraits(prev => [...prev, drawnTrait.name]); // 标记为抽卡获得，不可取消
                          setTraitDrawCostUsed(prev => prev + TRAIT_DRAW_COST.positive); // 记录抽卡费用
                          showNotification('success', `🎉 抽中了「${drawnTrait.name}」！（消耗${TRAIT_DRAW_COST.positive}点，不可取消）`);
                        }}
                      >
                        🎲 抽取正面
                      </button>
                    </div>
                    
                    {/* 负面天赋抽卡（免费） */}
                    <div className="gacha-pool negative">
                      <div className="pool-header">
                        <span className="pool-rank negative">负面天赋</span>
                        <span className="pool-count">
                          {CHARACTER_TRAITS.filter(t => !t.attributeThreshold && (t.cost ?? 0) < 0 && !selectedTraits.includes(t.name)).length}种可抽
                        </span>
                      </div>
                      <div className="pool-cost">
                        <span className="free-tag">免费</span> 但必须接受
                      </div>
                      <button
                        type="button"
                        className="gacha-btn negative-btn"
                        onClick={() => {
                          const availableTraits = CHARACTER_TRAITS.filter(
                            t => !t.attributeThreshold && (t.cost ?? 0) < 0 && !selectedTraits.includes(t.name)
                          );
                          if (availableTraits.length === 0) {
                            showNotification('info', '没有可抽取的负面天赋了');
                            return;
                          }
                          const randomIndex = Math.floor(Math.random() * availableTraits.length);
                          const drawnTrait = availableTraits[randomIndex];
                          setSelectedTraits(prev => [...prev, drawnTrait.name]);
                          setDrawnTraits(prev => [...prev, drawnTrait.name]); // 标记为抽卡获得，不可取消
                          // 负面天赋抽卡免费，但会获得该天赋的点数返还
                          setTraitDrawCostUsed(prev => prev + (drawnTrait.cost ?? 0)); // 负面天赋cost为负数，所以加上后相当于减去点数
                          showNotification('info', `抽中了「${drawnTrait.name}」，获得 ${Math.abs(drawnTrait.cost ?? 0)} 点！（不可取消）`);
                        }}
                      >
                        🎲 抽取负面
                      </button>
                    </div>
                    
                    {/* 混合池抽卡 */}
                    <div className={`gacha-pool mixed ${remainingPoints < TRAIT_DRAW_COST.mixed ? 'disabled' : ''}`}>
                      <div className="pool-header">
                        <span className="pool-rank mixed">混合池</span>
                        <span className="pool-count">
                          {CHARACTER_TRAITS.filter(t => !t.attributeThreshold && !selectedTraits.includes(t.name)).length}种可抽
                        </span>
                      </div>
                      <div className="pool-cost">
                        花费 <span className="cost-value">{TRAIT_DRAW_COST.mixed}</span> 点
                      </div>
                      <button
                        type="button"
                        className="gacha-btn mixed-btn"
                        disabled={remainingPoints < TRAIT_DRAW_COST.mixed}
                        onClick={() => {
                          const availableTraits = CHARACTER_TRAITS.filter(
                            t => !t.attributeThreshold && !selectedTraits.includes(t.name)
                          );
                          if (availableTraits.length === 0) {
                            showNotification('info', '没有可抽取的天赋了');
                            return;
                          }
                          const randomIndex = Math.floor(Math.random() * availableTraits.length);
                          const drawnTrait = availableTraits[randomIndex];
                          setSelectedTraits(prev => [...prev, drawnTrait.name]);
                          setDrawnTraits(prev => [...prev, drawnTrait.name]); // 标记为抽卡获得，不可取消
                          setTraitDrawCostUsed(prev => prev + TRAIT_DRAW_COST.mixed); // 记录抽卡费用
                          const traitCost = drawnTrait.cost ?? 0;
                          if (traitCost > 0) {
                            showNotification('success', `🎉 抽中了正面天赋「${drawnTrait.name}」！（消耗${TRAIT_DRAW_COST.mixed}点，不可取消）`);
                          } else if (traitCost < 0) {
                            showNotification('info', `抽中了负面天赋「${drawnTrait.name}」！（消耗${TRAIT_DRAW_COST.mixed}点，不可取消）`);
                          } else {
                            showNotification('info', `抽中了中性天赋「${drawnTrait.name}」！（消耗${TRAIT_DRAW_COST.mixed}点，不可取消）`);
                          }
                        }}
                      >
                        🎲 随机抽取
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 可选天赋列表 */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">✨</span>
                  直接选择
                  <span className={`points-badge ${remainingPoints >= 0 ? '' : 'error'}`}>
                    剩余 {remainingPoints} 点
                  </span>
                </h3>
                <p className="section-desc">
                  正面天赋消耗点数，负面天赋返还点数。直接选择你想要的天赋。
                </p>
                {errors.traits && <p className="error-text center">{errors.traits}</p>}

                {/* 搜索和筛选 */}
                <div className="trait-filters">
                  <div className="search-wrapper">
                    <input
                      type="text"
                      className="trait-search"
                      placeholder="搜索天赋名称或描述..."
                      value={traitSearchQuery}
                      onChange={(e) => setTraitSearchQuery(e.target.value)}
                    />
                    <span className="search-icon">🔍</span>
                  </div>
                </div>

                {/* 天赋列表 - 添加独立滚动容器 */}
                <div className="traits-scroll-container">
                  <div className="traits-grid selectable">
                    {CHARACTER_TRAITS
                      .filter(trait => !trait.attributeThreshold) // 排除属性触发型天赋
                      .filter(trait => {
                        if (!traitSearchQuery) return true;
                        const query = traitSearchQuery.toLowerCase();
                        return trait.name.toLowerCase().includes(query) ||
                               trait.description.toLowerCase().includes(query);
                      })
                      .map(trait => {
                        const isSelected = selectedTraits.includes(trait.name);
                        const isDrawn = drawnTraits.includes(trait.name); // 是否通过抽卡获得
                        const traitCost = trait.cost ?? 0;
                        const canAfford = traitCost <= 0 || remainingPoints >= traitCost || isSelected;
                        const traitType = getTraitType(trait);
                        
                        return (
                          <div
                            key={trait.name}
                            className={`trait-card selectable ${isSelected ? 'selected' : ''} ${isDrawn ? 'drawn locked' : ''} ${traitType === '正面' ? 'positive' : traitType === '负面' ? 'negative' : 'neutral'} ${!canAfford ? 'disabled' : ''}`}
                            onClick={() => {
                              if (isDrawn) return; // 抽卡获得的天赋不能取消
                              if (!canAfford && !isSelected) return;
                              if (isSelected) {
                                setSelectedTraits(prev => prev.filter(name => name !== trait.name));
                              } else {
                                setSelectedTraits(prev => [...prev, trait.name]);
                              }
                            }}
                          >
                            <div className="trait-header">
                              <span className="trait-name">{trait.name}</span>
                              <span className={`trait-cost ${isDrawn ? 'drawn' : traitCost > 0 ? 'cost' : traitCost < 0 ? 'gain' : ''}`}>
                                {isDrawn ? '已抽取' : traitCost > 0 ? `-${traitCost}` : traitCost < 0 ? `+${Math.abs(traitCost)}` : '0'}
                              </span>
                            </div>
                            <p className="trait-desc">{trait.description}</p>
                            {isSelected && (
                              <div className="selected-indicator">
                                <span>{isDrawn ? '🔒' : '✓'}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* 自定义天赋 */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">✏️</span>
                  自定义天赋
                  <span className="trait-count">{customTraits.length} 个已保存</span>
                </h3>
                <p className="section-desc">
                  创建自定义天赋，设置名称、描述和点数消耗。正数消耗点数，负数返还点数。
                </p>
                
                {/* 已保存的自定义天赋列表 */}
                {customTraits.length > 0 && (
                  <div className="custom-traits-list">
                    <h4 className="subsection-title">已保存的自定义天赋</h4>
                    <div className="traits-grid selectable custom-traits-scroll">
                      {customTraits.map(trait => {
                        const isSelected = selectedTraits.includes(trait.name);
                        const canAfford = trait.cost <= 0 || remainingPoints >= trait.cost || isSelected;
                        const traitType = trait.cost > 0 ? '正面' : trait.cost < 0 ? '负面' : '中性';
                        
                        return (
                          <div
                            key={trait.id}
                            className={`trait-card selectable custom ${isSelected ? 'selected' : ''} ${traitType === '正面' ? 'positive' : traitType === '负面' ? 'negative' : 'neutral'} ${!canAfford ? 'disabled' : ''}`}
                            onClick={() => {
                              if (!canAfford && !isSelected) return;
                              if (isSelected) {
                                setSelectedTraits(prev => prev.filter(name => name !== trait.name));
                              } else {
                                setSelectedTraits(prev => [...prev, trait.name]);
                              }
                            }}
                          >
                            <div className="trait-header">
                              <span className="trait-name">{trait.name}</span>
                              <span className={`trait-cost ${trait.cost > 0 ? 'cost' : trait.cost < 0 ? 'gain' : ''}`}>
                                {trait.cost > 0 ? `-${trait.cost}` : trait.cost < 0 ? `+${Math.abs(trait.cost)}` : '0'}
                              </span>
                            </div>
                            <p className="trait-desc">{trait.description}</p>
                            {isSelected && (
                              <div className="selected-indicator">
                                <span>✓</span>
                              </div>
                            )}
                            <button
                              type="button"
                              className="delete-custom-trait-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCustomTrait(trait.id, trait.name);
                              }}
                              title="删除此自定义天赋"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* 添加自定义天赋表单 */}
                {showCustomTraitForm ? (
                  <div className="custom-trait-form">
                    <h4 className="subsection-title">添加新天赋</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">天赋名称 *</label>
                        <div className="input-wrapper">
                          <input
                            type="text"
                            className="form-input"
                            value={newCustomTraitName}
                            onChange={(e) => setNewCustomTraitName(e.target.value)}
                            placeholder="例如：少林弟子"
                            maxLength={10}
                          />
                          <div className="input-glow" />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">点数消耗</label>
                        <div className="cost-input-wrapper">
                          <button
                            type="button"
                            className="cost-btn minus"
                            onClick={() => setNewCustomTraitCost(prev => prev - 1)}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            className="form-input cost-input"
                            value={newCustomTraitCost}
                            onChange={(e) => setNewCustomTraitCost(Number(e.target.value))}
                          />
                          <button
                            type="button"
                            className="cost-btn plus"
                            onClick={() => setNewCustomTraitCost(prev => prev + 1)}
                          >
                            +
                          </button>
                        </div>
                        <span className="cost-hint">
                          {newCustomTraitCost > 0 ? `消耗 ${newCustomTraitCost} 点` :
                           newCustomTraitCost < 0 ? `返还 ${Math.abs(newCustomTraitCost)} 点` : '不消耗点数'}
                        </span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">天赋描述 *</label>
                      <div className="input-wrapper">
                        <textarea
                          className="form-textarea"
                          value={newCustomTraitDesc}
                          onChange={(e) => setNewCustomTraitDesc(e.target.value)}
                          placeholder="描述这个天赋的效果和背景..."
                          rows={2}
                        />
                        <div className="input-glow" />
                      </div>
                    </div>
                    <div className="custom-trait-actions">
                      <button
                        type="button"
                        className="cancel-btn"
                        onClick={() => {
                          setShowCustomTraitForm(false);
                          setNewCustomTraitName('');
                          setNewCustomTraitDesc('');
                          setNewCustomTraitCost(0);
                        }}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="save-trait-btn"
                        onClick={handleAddCustomTrait}
                      >
                        保存天赋
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="add-custom-trait-btn"
                    onClick={() => setShowCustomTraitForm(true)}
                  >
                    <span className="btn-icon">+</span>
                    <span className="btn-text">添加自定义天赋</span>
                  </button>
                )}
                
                {/* 旧版自定义天赋描述输入 - 保留用于 AI 解析 */}
                <div className="custom-trait-input">
                  <h4 className="subsection-title">自由描述（可选）</h4>
                  <p className="hint-text">输入额外的天赋描述，AI 会根据描述为你生成相应的效果。</p>
                  <div className="input-wrapper">
                    <textarea
                      className="form-textarea"
                      value={customTraitInput}
                      onChange={(e) => setCustomTraitInput(e.target.value)}
                      placeholder="例如：我曾经在少林寺学过三年武功..."
                      rows={2}
                      disabled={isLoading}
                    />
                    <div className="input-glow" />
                  </div>
                </div>
              </div>

              {/* 导航按钮 */}
              <div className="form-actions dual">
                <button
                  type="button"
                  className="back-step-btn"
                  onClick={handlePrevStep}
                  disabled={isLoading}
                >
                  <span className="btn-arrow">←</span>
                  <span className="btn-text">上一步</span>
                </button>
                <button
                  type="button"
                  className="next-btn"
                  onClick={handleNextStep}
                  disabled={isLoading || !canProceedToNext}
                >
                  <span className="btn-text">下一步</span>
                  <span className="btn-arrow">→</span>
                  <div className="btn-glow" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* 步骤4: 武功选择 */}
          {/* ============================================ */}
          {currentStep === 'martial' && (
            <div className="step-content martial-step">
              {/* 抽卡区域 */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">🎴</span>
                  武功抽取
                  <span className={`points-badge ${remainingPoints >= 0 ? '' : 'error'}`}>
                    剩余 {remainingPoints} 点
                  </span>
                </h3>
                <p className="section-desc">
                  花费点数随机抽取武功，费用比直接选择更低。抽中的武功必须接受！
                </p>
                
                <div className="gacha-section">
                  <div className="gacha-pools">
                    {/* 武功混合池抽卡（统一费用，随机抽取任意品阶） */}
                    <div className={`gacha-pool mixed ${remainingPoints < MARTIAL_ARTS_DRAW_COST ? 'disabled' : ''}`}>
                      <div className="pool-header">
                        <span className="pool-rank mixed">混合池</span>
                        <span className="pool-count">
                          {martialArtsDatabase.filter(a => !selectedMartialArts.includes(a.功法名称)).length}种可抽
                        </span>
                      </div>
                      <div className="pool-cost">
                        花费 <span className="cost-value">{MARTIAL_ARTS_DRAW_COST}</span> 点
                      </div>
                      <p className="pool-desc">随机抽取任意品阶武功，抽中后不可取消！</p>
                      <button
                        type="button"
                        className="gacha-btn mixed-btn"
                        disabled={remainingPoints < MARTIAL_ARTS_DRAW_COST || martialArtsDatabase.filter(a => !selectedMartialArts.includes(a.功法名称)).length === 0}
                        onClick={() => {
                          const availableArts = martialArtsDatabase.filter(a => !selectedMartialArts.includes(a.功法名称));
                          if (availableArts.length === 0) {
                            showNotification('info', '没有可抽取的武功了');
                            return;
                          }
                          // 随机抽取
                          const randomIndex = Math.floor(Math.random() * availableArts.length);
                          const drawnArt = availableArts[randomIndex];
                          setSelectedMartialArts(prev => [...prev, drawnArt.功法名称]);
                          setDrawnMartialArts(prev => [...prev, drawnArt.功法名称]); // 标记为抽卡获得，不可取消
                          setMartialArtsDrawCostUsed(prev => prev + MARTIAL_ARTS_DRAW_COST); // 记录抽卡费用
                          showNotification('success', `🎉 抽中了「${drawnArt.功法名称}」（${drawnArt.功法品阶}）！（消耗${MARTIAL_ARTS_DRAW_COST}点，不可取消）`);
                        }}
                      >
                        🎲 随机抽取武功
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 武功选择卡片 */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">⚔️</span>
                  直接选择
                  <span className={`points-badge ${remainingPoints >= 0 ? '' : 'error'}`}>
                    剩余 {remainingPoints} 点
                  </span>
                </h3>
                <p className="section-desc">
                  直接选择武功，费用较高但可以精确选择。
                </p>
                {errors.martial && <p className="error-text center">{errors.martial}</p>}

                {/* 筛选和搜索 */}
                <div className="martial-filters">
                  <div className="filter-tabs">
                    <button
                      type="button"
                      className={`filter-tab ${martialArtsFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setMartialArtsFilter('all')}
                    >
                      全部
                    </button>
                    {(['粗浅', '传家', '上乘', '镇派', '绝世'] as MartialArtsRank[]).map(rank => (
                      <button
                        key={rank}
                        type="button"
                        className={`filter-tab ${martialArtsFilter === rank ? 'active' : ''}`}
                        onClick={() => setMartialArtsFilter(rank)}
                      >
                        {rank} ({RANK_POINT_COST[rank]}点)
                      </button>
                    ))}
                  </div>
                  <div className="search-wrapper">
                    <input
                      type="text"
                      className="martial-search"
                      placeholder="搜索武功名称..."
                      value={martialArtsSearch}
                      onChange={(e) => setMartialArtsSearch(e.target.value)}
                    />
                    <span className="search-icon">🔍</span>
                  </div>
                </div>

                {/* 武功列表 - 添加独立滚动容器 */}
                {martialArtsLoading ? (
                  <div className="loading-hint">正在加载武功数据库...</div>
                ) : (
                  <div className="martial-scroll-container">
                    <div className="martial-arts-grid">
                      {martialArtsDatabase
                        .filter(art => {
                          if (martialArtsFilter !== 'all' && art.功法品阶 !== martialArtsFilter) return false;
                          if (martialArtsSearch && !art.功法名称.includes(martialArtsSearch)) return false;
                          return true;
                        })
                        .map(art => {
                          const isSelected = selectedMartialArts.includes(art.功法名称);
                          const isDrawn = drawnMartialArts.includes(art.功法名称); // 是否通过抽卡获得
                          const cost = RANK_POINT_COST[art.功法品阶];
                          const canAfford = remainingPoints >= cost || isSelected;
                          
                          return (
                            <div
                              key={art.功法名称}
                              className={`martial-card ${isSelected ? 'selected' : ''} ${isDrawn ? 'drawn locked' : ''} rank-${art.功法品阶} ${!canAfford ? 'disabled' : ''}`}
                              onClick={() => {
                                if (isDrawn) return; // 抽卡获得的武功不能取消
                                if (!canAfford && !isSelected) return;
                                if (isSelected) {
                                  // 取消选择（点数会通过 martialArtsPointsUsed 自动返还）
                                  setSelectedMartialArts(prev => prev.filter(n => n !== art.功法名称));
                                } else {
                                  // 选择武功（点数会通过 martialArtsPointsUsed 自动扣除）
                                  setSelectedMartialArts(prev => [...prev, art.功法名称]);
                                }
                              }}
                            >
                              <div className="martial-header">
                                <span className="martial-name">{art.功法名称}</span>
                                <span className={`martial-rank rank-${art.功法品阶}`}>{art.功法品阶}</span>
                              </div>
                              <span className="martial-type">{art.类型}</span>
                              <p className="martial-desc">{art.功法描述?.slice(0, 50)}...</p>
                              <span className="martial-cost">{isDrawn ? '已抽取' : `-${cost}点`}</span>
                              {isSelected && (
                                <div className="selected-indicator">
                                  <span>{isDrawn ? '🔒' : '✓'}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* 已选武功 */}
              {selectedMartialArts.length > 0 && (
                <div className="form-section glass-card">
                  <h3 className="section-title">
                    <span className="section-icon">📜</span>
                    已选武功
                    <span className="trait-count">{selectedMartialArts.length} 项</span>
                  </h3>
                  <div className="selected-martial-list">
                    {selectedMartialArts.map(artName => {
                      const art = martialArtsDatabase.find(a => a.功法名称 === artName);
                      const isDrawn = drawnMartialArts.includes(artName); // 是否通过抽卡获得
                      return (
                        <div key={artName} className={`selected-martial-item ${isDrawn ? 'drawn locked' : ''}`}>
                          <span className="martial-name">{artName}</span>
                          <span className={`martial-rank rank-${art?.功法品阶}`}>{art?.功法品阶}</span>
                          {isDrawn ? (
                            <span className="lock-icon" title="抽卡获得，不可移除">🔒</span>
                          ) : (
                            <button
                              type="button"
                              className="remove-btn"
                              onClick={() => {
                                // 移除武功（点数会通过 martialArtsPointsUsed 自动返还）
                                setSelectedMartialArts(prev => prev.filter(n => n !== artName));
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 导航按钮 */}
              <div className="form-actions dual">
                <button
                  type="button"
                  className="back-step-btn"
                  onClick={handlePrevStep}
                  disabled={isLoading}
                >
                  <span className="btn-arrow">←</span>
                  <span className="btn-text">上一步</span>
                </button>
                <button
                  type="button"
                  className="next-btn"
                  onClick={handleNextStep}
                  disabled={isLoading}
                >
                  <span className="btn-text">下一步</span>
                  <span className="btn-arrow">→</span>
                  <div className="btn-glow" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* 步骤5: 出身选择 */}
          {/* ============================================ */}
          {currentStep === 'origin' && (
            <div className="step-content origin-step">
              {/* 出身选择卡片 */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">🏠</span>
                  选择出身
                  {selectedOriginDetails && (
                    <span className={`realm-badge realm-${realmMajor(selectedOriginDetails.realm)}`}>
                      {selectedOriginDetails.realm}
                    </span>
                  )}
                </h3>
                <p className="section-desc">
                  出身决定了你的初始身份、背景故事和起始境界。不同出身对应不同的武学起点。
                </p>
                {errors.origin && <p className="error-text center">{errors.origin}</p>}

                {/* 出身类别筛选 */}
                <div className="origin-category-filter">
                  <button
                    type="button"
                    className={`category-tab ${originCategoryFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setOriginCategoryFilter('all')}
                  >
                    全部
                  </button>
                  {(['江湖门派', '世家豪门', '平民百姓', '特殊身份', '自定义'] as OriginCategory[]).map(category => (
                    <button
                      key={category}
                      type="button"
                      className={`category-tab ${originCategoryFilter === category ? 'active' : ''}`}
                      onClick={() => setOriginCategoryFilter(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                {/* 出身列表 - 按类别分组显示 */}
                <div className="origin-scroll-container">
                  <div className="origin-grid">
                    {ORIGIN_OPTIONS
                      .filter(origin => originCategoryFilter === 'all' || origin.category === originCategoryFilter)
                      .map(origin => (
                        <div
                          key={origin.id}
                          className={`origin-card ${selectedOrigin === origin.id ? 'selected' : ''} category-${origin.category}`}
                          onClick={() => setSelectedOrigin(origin.id)}
                        >
                          <div className="origin-header">
                            <span className="origin-icon">{origin.icon}</span>
                            <span className="origin-name">{origin.name}</span>
                          </div>
                          <span className={`origin-realm realm-${realmMajor(origin.realm)}`}>
                            {origin.realm}
                          </span>
                          <p className="origin-desc">{origin.description}</p>

                          {/* 显示出身自带的功法 */}
                          {origin.martial_arts && origin.martial_arts.length > 0 && (
                            <div className="origin-bonuses">
                              <div className="bonus-label">🥋 初始功法:</div>
                              <div className="bonus-items">
                                {origin.martial_arts.map((art, idx) => (
                                  <span key={idx} className="bonus-item martial-art">
                                    {art.name} ({art.mastery})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 显示出身自带的物品 */}
                          {origin.items && Object.keys(origin.items).length > 0 && (
                            <div className="origin-bonuses">
                              <div className="bonus-label">🎒 初始物品:</div>
                              <div className="bonus-items">
                                {Object.entries(origin.items).map(([itemName, itemInfo]) => (
                                  <span key={itemName} className="bonus-item item">
                                    {itemName} x{itemInfo.数量}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <span className="origin-category-tag">{origin.category}</span>
                          {selectedOrigin === origin.id && (
                            <div className="selected-indicator">
                              <span>✓</span>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>

                {/* 自定义出身 */}
                {selectedOrigin === 'custom' && (
                  <div className="custom-origin-section">
                    <h4 className="subsection-title">自定义出身设置</h4>
                    
                    {/* 自定义境界选择 */}
                    <div className="form-group">
                      <label className="form-label">起始境界</label>
                      <div className="realm-select-grid">
                        {REALM_LEVELS.map(realm => (
                          <button
                            key={realm}
                            type="button"
                            className={`realm-option ${customRealm === realm ? 'selected' : ''} realm-${realmMajor(realm)}`}
                            onClick={() => setCustomRealm(realm)}
                          >
                            {realm}
                          </button>
                        ))}
                      </div>
                      <p className="realm-hint">
                        当前选择: <strong>{customRealm}</strong> (修为值: {getOriginRealmAndCultivation('custom').cultivation})
                      </p>
                    </div>
                    
                    {/* 自定义出身描述 */}
                    <div className="form-group">
                      <label className="form-label">出身背景描述</label>
                      <div className="input-wrapper">
                        <textarea
                          className="form-textarea"
                          value={customOrigin}
                          onChange={(e) => setCustomOrigin(e.target.value)}
                          placeholder="描述你的出身背景，例如：曾是某大派的弃徒，因故流落江湖..."
                          rows={3}
                          disabled={isLoading}
                        />
                        <div className="input-glow" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 时间地点选择 */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">📍</span>
                  开局时间地点
                </h3>
                <p className="section-desc">
                  选择故事开始的时间和地点。
                </p>

                <div className="location-toggle">
                  <label className="toggle-option">
                    <input
                      type="radio"
                      checked={useEventLocation}
                      onChange={() => setUseEventLocation(true)}
                    />
                    <span>选择预设事件</span>
                  </label>
                  <label className="toggle-option">
                    <input
                      type="radio"
                      checked={!useEventLocation}
                      onChange={() => setUseEventLocation(false)}
                    />
                    <span>自定义时间地点</span>
                  </label>
                </div>

                {useEventLocation ? (
                  <div className="event-select-section">
                    {/* 事件搜索框 */}
                    <div className="search-wrapper event-search-wrapper">
                      <input
                        type="text"
                        className="event-search"
                        placeholder="搜索事件名称或地点..."
                        value={eventSearchQuery}
                        onChange={(e) => setEventSearchQuery(e.target.value)}
                      />
                      <span className="search-icon">🔍</span>
                      {eventSearchQuery && (
                        <span className="search-result-count">
                          找到 {STORY_EVENTS.filter(event => {
                            const query = eventSearchQuery.toLowerCase();
                            return event.name.toLowerCase().includes(query) ||
                                   event.location.toLowerCase().includes(query);
                          }).length} 个事件
                        </span>
                      )}
                    </div>
                    {/* 事件列表滚动容器 */}
                    <div className="event-scroll-container">
                      <div className="event-select">
                        {STORY_EVENTS
                          .filter(event => {
                            if (!eventSearchQuery) return true;
                            const query = eventSearchQuery.toLowerCase();
                            return event.name.toLowerCase().includes(query) ||
                                   event.location.toLowerCase().includes(query);
                          })
                          .map(event => (
                            <div
                              key={event.id}
                              className={`event-card ${selectedEventId === event.id ? 'selected' : ''}`}
                              onClick={() => setSelectedEventId(event.id)}
                            >
                              <span className="event-name">{event.name}</span>
                              <span className="event-time">{event.year}年{event.month}月{event.day}日</span>
                              <span className="event-location">{event.location}</span>
                              {selectedEventId === event.id && (
                                <div className="selected-indicator">
                                  <span>✓</span>
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="custom-location">
                    <div className="time-inputs">
                      <div className="form-group">
                        <label className="form-label">年份</label>
                        <input
                          type="number"
                          className="form-input"
                          value={customYear}
                          onChange={(e) => setCustomYear(Number(e.target.value))}
                          min={1000}
                          max={2000}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">月份</label>
                        <input
                          type="number"
                          className="form-input"
                          value={customMonth}
                          onChange={(e) => setCustomMonth(Number(e.target.value))}
                          min={1}
                          max={12}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">日期</label>
                        <input
                          type="number"
                          className="form-input"
                          value={customDay}
                          onChange={(e) => setCustomDay(Number(e.target.value))}
                          min={1}
                          max={30}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">地点</label>
                      <input
                        type="text"
                        className="form-input"
                        value={customLocation}
                        onChange={(e) => setCustomLocation(e.target.value)}
                        placeholder="例如：大宋/临安府/西湖"
                      />
                      {errors.location && <p className="error-text">{errors.location}</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* 导航按钮 */}
              <div className="form-actions dual">
                <button
                  type="button"
                  className="back-step-btn"
                  onClick={handlePrevStep}
                  disabled={isLoading}
                >
                  <span className="btn-arrow">←</span>
                  <span className="btn-text">上一步</span>
                </button>
                <button
                  type="button"
                  className="next-btn"
                  onClick={handleNextStep}
                  disabled={isLoading}
                >
                  <span className="btn-text">下一步</span>
                  <span className="btn-arrow">→</span>
                  <div className="btn-glow" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* 步骤6: 身份设置 */}
          {/* ============================================ */}
          {currentStep === 'identity' && (
            <div className="step-content identity-step">
              {/* 基础信息 */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">👤</span>
                  侠客身份
                </h3>
                <p className="section-desc">
                  设置你的侠客名号和基础信息。
                </p>

                <div className="identity-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">侠客名号 *</label>
                      <div className="input-wrapper">
                        <input
                          type="text"
                          className="form-input"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="请输入名号..."
                          maxLength={10}
                        />
                        <div className="input-glow" />
                      </div>
                      {errors.name && <p className="error-text">{errors.name}</p>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">性别</label>
                      <div className="gender-toggle">
                        <button
                          type="button"
                          className={`gender-btn ${gender === '男' ? 'active' : ''}`}
                          onClick={() => setGender('男')}
                        >
                          男
                        </button>
                        <button
                          type="button"
                          className={`gender-btn ${gender === '女' ? 'active' : ''}`}
                          onClick={() => setGender('女')}
                        >
                          女
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">年龄</label>
                      <input
                        type="number"
                        className="form-input"
                        value={age}
                        onChange={(e) => setAge(Number(e.target.value))}
                        min={10}
                        max={100}
                      />
                      {errors.age && <p className="error-text">{errors.age}</p>}
                    </div>
                  </div>

                  <div className="form-group avatar-form-group">
                    <label className="form-label">头像</label>
                    <div className="setup-avatar-panel">
                      <div className="setup-avatar-preview">
                        {selectedAvatarSource.src ? (
                          <img
                            src={selectedAvatarSource.src}
                            alt="当前头像"
                            style={selectedAvatarSource.objectPosition ? { objectPosition: selectedAvatarSource.objectPosition } : undefined}
                          />
                        ) : (
                          <span>{selectedAvatarSource.fallbackInitial}</span>
                        )}
                        <div className="setup-avatar-preview-copy">
                          <strong>{selectedAvatarSource.label}</strong>
                          <small>{selectedAvatarSource.source === 'custom' ? '自定义头像' : '当前选择'}</small>
                        </div>
                      </div>

                      <div className="setup-avatar-grid" aria-label="选择头像">
                        {genderAvatarOptions.map(avatar => {
                          const avatarRef = toPresetAvatarRef(avatar.id);
                          const isSelected = selectedAvatarRef === avatarRef;

                          return (
                            <button
                              key={avatar.id}
                              type="button"
                              className={`setup-avatar-choice ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => handlePresetAvatarSelect(avatar.id)}
                              aria-pressed={isSelected}
                            >
                              <img
                                src={avatar.src}
                                alt={avatar.label}
                                style={avatar.objectPosition ? { objectPosition: avatar.objectPosition } : undefined}
                              />
                              <span>{avatar.label}</span>
                            </button>
                          );
                        })}

                        <label className={`setup-avatar-choice upload ${selectedAvatarSource.source === 'custom' ? 'is-selected' : ''}`}>
                          <input
                            ref={avatarFileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                          />
                          <span className="setup-avatar-upload-mark">+</span>
                          <span>上传头像</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      外貌描述
                      <span className="label-hint">（包含身材特征，基于风姿{attributes.风姿}、臂力{attributes.臂力}和根骨{attributes.根骨}）</span>
                    </label>
                    <div className="input-with-btn">
                      <div className="input-wrapper">
                        <textarea
                          className="form-textarea"
                          value={appearance}
                          onChange={(e) => setAppearance(e.target.value)}
                          placeholder="描述你的外貌和身材特征..."
                          rows={3}
                        />
                        <div className="input-glow" />
                      </div>
                      <button
                        type="button"
                        className="random-btn"
                        onClick={randomAppearance}
                      >
                        🎲 随机
                      </button>
                    </div>
                    {errors.appearance && <p className="error-text">{errors.appearance}</p>}
                  </div>
                </div>
              </div>

              {/* 导航按钮 */}
              <div className="form-actions dual">
                <button
                  type="button"
                  className="back-step-btn"
                  onClick={handlePrevStep}
                  disabled={isLoading}
                >
                  <span className="btn-arrow">←</span>
                  <span className="btn-text">上一步</span>
                </button>
                <button
                  type="button"
                  className="next-btn"
                  onClick={handleNextStep}
                  disabled={isLoading}
                >
                  <span className="btn-text">下一步</span>
                  <span className="btn-arrow">→</span>
                  <div className="btn-glow" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* 步骤7: 确认页面 */}
          {/* ============================================ */}
          {currentStep === 'confirm' && (
            <div className="step-content confirm-step">
              {/* 角色预览 */}
              <div className="form-section glass-card">
                <h3 className="section-title">
                  <span className="section-icon">📋</span>
                  角色预览
                </h3>
                <p className="section-desc">
                  确认你的角色信息，一切准备就绪后踏入江湖！
                </p>

                <div className="character-preview">
                  {/* 基础信息 */}
                  <div className="preview-section">
                    <h4 className="preview-title">基础信息</h4>
                    <div className="preview-avatar-row">
                      <div className="preview-avatar">
                        {selectedAvatarSource.src ? (
                          <img
                            src={selectedAvatarSource.src}
                            alt="头像预览"
                            style={selectedAvatarSource.objectPosition ? { objectPosition: selectedAvatarSource.objectPosition } : undefined}
                          />
                        ) : (
                          <span>{selectedAvatarSource.fallbackInitial}</span>
                        )}
                      </div>
                      <div>
                        <span className="preview-label">头像</span>
                        <span className="preview-value">{selectedAvatarSource.label}</span>
                      </div>
                    </div>
                    <div className="preview-grid">
                      <div className="preview-item">
                        <span className="preview-label">名号</span>
                        <span className="preview-value">{name || '未设置'}</span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">性别</span>
                        <span className="preview-value">{gender}</span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">年龄</span>
                        <span className="preview-value">{age}岁</span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">天资</span>
                        <span className="preview-value">{selectedTalent?.name}</span>
                      </div>
                    </div>
                  </div>

                  {/* 属性 */}
                  <div className="preview-section">
                    <h4 className="preview-title">七维属性</h4>
                    <div className="preview-attributes">
                      {(Object.keys(ATTRIBUTE_NAMES) as Array<keyof InitialAttributes>).map(key => (
                        <span key={key}>{ATTRIBUTE_NAMES[key]} {attributes[key]}</span>
                      ))}
                    </div>
                  </div>

                  {/* 天赋 */}
                  <div className="preview-section">
                    <h4 className="preview-title">天赋 ({attributeTriggeredTraits.length + selectedTraits.length})</h4>
                    <div className="preview-traits">
                      {attributeTriggeredTraits.map(t => (
                        <span key={t.name} className={`trait-badge ${getTraitType(t) === '正面' ? 'positive' : 'negative'}`}>
                          {t.name}
                        </span>
                      ))}
                      {selectedTraits.map(traitName => {
                        const trait = CHARACTER_TRAITS.find(t => t.name === traitName);
                        return trait ? (
                          <span key={traitName} className={`trait-badge ${getTraitType(trait) === '正面' ? 'positive' : 'negative'}`}>
                            {trait.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>

                  {/* 武功 */}
                  <div className="preview-section">
                    <h4 className="preview-title">武功 ({selectedMartialArts.length})</h4>
                    <div className="preview-martial">
                      {selectedMartialArts.length > 0 ? (
                        selectedMartialArts.map(name => (
                          <span key={name} className="martial-badge">{name}</span>
                        ))
                      ) : (
                        <span className="empty-hint">未选择武功</span>
                      )}
                    </div>
                  </div>

                  {/* 出身和地点 */}
                  <div className="preview-section">
                    <h4 className="preview-title">出身与境界</h4>
                    <div className="preview-grid">
                      <div className="preview-item">
                        <span className="preview-label">出身</span>
                        <span className="preview-value">
                          {selectedOrigin === 'custom' ? customOrigin || '自定义' : selectedOriginDetails?.name}
                        </span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">起始境界</span>
                        <span className={`preview-value realm-badge realm-${realmMajor(selectedOrigin === 'custom' ? customRealm : selectedOriginDetails?.realm || '不入流')}`}>
                          {selectedOrigin === 'custom' ? customRealm : selectedOriginDetails?.realm}
                        </span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">起始修为</span>
                        <span className="preview-value">
                          {(() => {
                            const { cultivation } = getOriginRealmAndCultivation(selectedOrigin);
                            // 如果是自定义出身，使用自定义境界对应的修为
                            if (selectedOrigin === 'custom' && customRealm) {
                              // 自定义出身：用境界系统.json 的 realmCultivationMap 查起始修为（与 gameInitializer 同源）
                              return REALM_CULTIVATION_MAP[customRealm] ?? 0;
                            }
                            return cultivation;
                          })()}
                        </span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">时间</span>
                        <span className="preview-value">
                          {useEventLocation && selectedEvent
                            ? `${selectedEvent.year}年${selectedEvent.month}月${selectedEvent.day}日`
                            : `${customYear}年${customMonth}月${customDay}日`}
                        </span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">地点</span>
                        <span className="preview-value">
                          {useEventLocation && selectedEvent ? selectedEvent.location : customLocation}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="form-actions triple">
                <button
                  type="button"
                  className="back-step-btn"
                  onClick={handlePrevStep}
                  disabled={isLoading}
                >
                  <span className="btn-arrow">←</span>
                  <span className="btn-text">上一步</span>
                </button>
                <button
                  type="button"
                  className="save-btn"
                  onClick={handleSaveBuild}
                  disabled={isLoading}
                >
                  <span className="btn-icon">💾</span>
                  <span className="btn-text">保存存档</span>
                </button>
                <button
                  type="submit"
                  className="submit-btn"
                  disabled={isLoading || !name.trim()}
                >
                  <span className="btn-text">{isLoading ? '正在创建...' : '踏入江湖'}</span>
                  <span className="btn-icon">⚔️</span>
                  <div className="btn-glow" />
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default NewGameSetup;
