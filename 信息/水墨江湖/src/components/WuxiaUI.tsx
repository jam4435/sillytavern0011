import React from 'react';
import { 
  User, CircleDollarSign, Gem, Utensils, Plus, Scroll, 
  Store, Swords, Gift, Mail, Briefcase, BookOpen, Hammer, 
  Compass, PawPrint, ChevronRight, Navigation
} from 'lucide-react';

export function PlayerInfo() {
  return (
    <div className="flex items-center gap-4 drop-shadow-md">
      <div className="wuxia circle-frame circle-frame-ink" style={{ width: 72, height: 72 }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <User size={36} className="text-[#E8E2D6]" strokeWidth={1.5} />
        </div>
      </div>
      <div className="flex flex-col text-shadow-light">
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold text-ink tracking-wider drop-shadow-sm">云无痕</span>
          <span className="text-stamp text-xs stamp-border ml-1 transform -rotate-3">侠</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-ink/90 font-bold drop-shadow-sm">40级</span>
          <div className="w-36 h-2 bg-ink/20 rounded-sm relative overflow-hidden shadow-inner">
            <div className="absolute inset-y-0 left-0 bg-[#4a6b53] w-[47%]"></div>
          </div>
          <span className="text-xs text-ink/70 drop-shadow-sm">23456/50000</span>
        </div>
        <div className="mt-1">
          <span className="text-sm text-ink/90 font-bold drop-shadow-sm">战力</span>
          <span className="text-xl font-bold text-ink ml-2 tracking-wide drop-shadow-sm">256980</span>
        </div>
      </div>
    </div>
  );
}

const ResourceItem = ({ icon: Icon, value }: { icon: any, value: string }) => (
  <div className="flex items-center gap-1 bg-[#2a2a2a]/80 backdrop-blur-sm rounded-full pl-1 pr-1 py-1 border border-white/10 shadow-sm relative overflow-hidden">
    <div className="w-6 h-6 rounded-full bg-[#c69c6d] flex items-center justify-center border border-[#e2c092]/50">
      <Icon size={14} className="text-[#3a2818]" />
    </div>
    <span className="text-[#ded9d0] text-sm font-medium px-2 tracking-wide">{value}</span>
    <button className="w-5 h-5 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center mr-0.5 transition-colors cursor-pointer">
      <Plus size={14} />
    </button>
  </div>
);

export function TopBar() {
  return (
    <div className="flex items-center gap-4">
      <ResourceItem icon={CircleDollarSign} value="128万" />
      <ResourceItem icon={Gem} value="3456" />
      <ResourceItem icon={Utensils} value="120/120" />
    </div>
  );
}

export function QuestPanel() {
  return (
    <div className="wuxia panel-rect panel-rect-xl relative w-[340px] opacity-100 flex flex-col p-6 mt-6 ml-4 drop-shadow-md" style={{ minHeight: '400px' }}>
      
      {/* Title area */}
      <div className="flex items-center mb-4 pb-2 relative">
        <div className="absolute -bottom-1 left-0 w-[60%] h-[2px] bg-ink/30" />
        <h2 className="text-xl font-bold text-ink tracking-widest pl-2 border-l-4 border-ink">任务</h2>
      </div>
      
      <div className="flex-1 flex flex-col gap-0 mt-2">
        {/* Quest 1 */}
        <div className="py-3 border-b border-ink/20 cursor-pointer group hover:bg-black/5 transition-all flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-stamp font-bold text-[14px] tracking-wide drop-shadow-sm">[主线]</span>
            <span className="text-ink font-bold text-[16px] tracking-wide drop-shadow-sm">初入江湖</span>
          </div>
          <div className="flex items-center justify-between w-full pl-1">
            <span className="text-ink-light text-[14px] tracking-wide font-medium">与小村村长对话</span>
            <span className="text-stamp text-[12px] font-bold border border-stamp px-1.5 py-0.5 bg-transparent rotate-[-5deg]">进行中</span>
          </div>
        </div>

        {/* Quest 2 */}
        <div className="py-3 border-b border-ink/20 cursor-pointer group hover:bg-black/5 transition-all flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-ink font-bold text-[14px] tracking-wide drop-shadow-sm">[日常]</span>
            <span className="text-ink font-bold text-[16px] tracking-wide drop-shadow-sm">门派修行</span>
          </div>
          <div className="flex items-center justify-between w-full pl-1">
            <span className="text-ink-light text-[14px] tracking-wide font-medium">完成门派修行 (0/10)</span>
            <button className="wuxia btn-wuxia btn-outline btn-xs !h-6 !text-[12px] !px-3">前往</button>
          </div>
        </div>

        {/* Quest 3 */}
        <div className="py-3 border-b border-ink/20 cursor-pointer group hover:bg-black/5 transition-all flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-ink font-bold text-[14px] tracking-wide drop-shadow-sm">[支线]</span>
            <span className="text-ink font-bold text-[16px] tracking-wide drop-shadow-sm">收集药材</span>
          </div>
          <div className="flex items-center justify-between w-full pl-1">
            <span className="text-ink-light text-[14px] tracking-wide font-medium">收集草药 (3/10)</span>
            <button className="wuxia btn-wuxia btn-outline btn-xs !h-6 !text-[12px] !px-3">前往</button>
          </div>
        </div>

        {/* Quest 4 */}
        <div className="py-3 cursor-pointer group hover:bg-black/5 transition-all flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-ink font-bold text-[14px] tracking-wide drop-shadow-sm">[支线]</span>
            <span className="text-ink font-bold text-[16px] tracking-wide drop-shadow-sm">挑战副本</span>
          </div>
          <div className="flex items-center justify-between w-full pl-1">
            <span className="text-ink-light text-[14px] tracking-wide font-medium">通关副本: 墨剑山庄</span>
            <button className="wuxia btn-wuxia btn-outline btn-xs !h-6 !text-[12px] !px-3">前往</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Minimap() {
  return (
    <div className="relative mb-6 drop-shadow-lg cursor-pointer group">
      <div className="wuxia circle-frame circle-frame-line transition-transform group-hover:scale-[1.02]" style={{ width: 160, height: 160 }}>
         <div className="absolute inset-0 opacity-40 bg-[url('https://www.transparenttextures.com/patterns/rice-paper-2.png')] rounded-full" />
         <svg className="absolute inset-0 w-full h-full opacity-60 text-ink" viewBox="0 0 100 100">
           <path d="M 10 40 Q 30 20 60 50 T 90 20" fill="none" stroke="currentColor" strokeWidth="2" />
           <path d="M 0 70 Q 40 90 50 60 T 100 80" fill="none" stroke="currentColor" strokeWidth="1.5" />
           <circle cx="65" cy="45" r="4" fill="currentColor" />
           <path d="M 30 30 L 40 30 L 35 20 Z M 25 40 L 45 40 L 35 30 Z" fill="currentColor" opacity="0.8" />
         </svg>
         <div className="absolute text-gold drop-shadow-md z-10" style={{ transform: 'rotate(-45deg)', top: '24px', right: '24px' }}>
           <Navigation size={24} fill="currentColor" />
         </div>
      </div>
      
      <div className="absolute top-8 -left-4 bg-[#e8e4db] px-2 py-3 shadow-md border-y border-l border-ink/40 flex flex-col items-center rounded-l-md">
        <span className="text-ink font-bold writing-vertical-rl tracking-widest text-sm">江湖</span>
        <ChevronRight size={16} className="text-ink mt-2 rotate-90" />
      </div>
    </div>
  );
}

const rightPanelItems = [
  { label: '商城', icon: Store },
  { label: '活动', icon: Swords },
  { label: '福利', icon: Gift },
  { label: '邮件', icon: Mail },
  { label: '背包', icon: Briefcase },
];

export function RightPanel() {
  return (
    <div className="flex flex-col items-center mr-2 mt-4">
      <Minimap />
      <div className="relative w-[160px] h-[480px] mt-2">
        <div className="absolute inset-0 flex flex-col justify-between items-center z-10 py-2">
           {rightPanelItems.map(({ label, icon: Icon }) => (
             <div key={label} className="flex-1 flex flex-col justify-center items-center cursor-pointer group hover:scale-110 transition-transform">
               <div className="relative flex items-center justify-center mb-1.5 drop-shadow-md" style={{ width: 56, height: 56 }}>
                 <div className="absolute inset-[3px] bg-[#1A1410] rounded" />
                 <div className="absolute inset-0 wuxia icon-base icon-square-dark" style={{ width: '100%', height: '100%' }} />
                 <Icon size={26} className="text-[#E8E2D6] relative z-10" />
               </div>
               <span className="text-[14px] font-bold text-ink drop-shadow-sm tracking-widest">{label}</span>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
}

const bottomPanelItems = [
  { label: '角色', icon: User },
  { label: '武学', icon: BookOpen },
  { label: '锻造', icon: Hammer },
  { label: '江湖', icon: Compass },
];

export function BottomPanel() {
  return (
    <div className="relative flex items-end mb-4 mr-10">
      <div className="relative w-[480px] h-[100px] flex items-center justify-between px-4 pt-2">
         {bottomPanelItems.map(({ label, icon: Icon }, idx) => (
           <div key={label} className="h-full flex flex-col justify-center items-center cursor-pointer group hover:scale-110 transition-transform">
             <div className="wuxia circle-frame circle-frame-ink flex items-center justify-center mb-1 drop-shadow-md" style={{ width: 72, height: 72, backgroundSize: '100% 100%' }}>
               <Icon size={32} className="text-[#1A1410]" strokeWidth={2} />
             </div>
             <span className={`text-[16px] font-bold tracking-widest drop-shadow-[0_2px_2px_rgba(255,255,255,0.6)] mt-1 ${idx === 3 ? 'text-ink font-extrabold text-[18px]' : 'text-ink-light'}`}>{label}</span>
           </div>
         ))}
      </div>
    </div>
  );
}

export function CenterTitle() {
  return (
    <div className="flex items-start gap-6 pl-20 drop-shadow-sm text-ink">
      <div className="flex flex-col items-center mt-8">
        <p className="writing-vertical-rl text-ink text-3xl font-bold tracking-[0.5em] text-shadow-light">
          仗剑天涯路
        </p>
        <p className="writing-vertical-rl text-ink text-3xl font-bold tracking-[0.5em] mt-3 text-shadow-light">
          江湖任逍遥
        </p>
        <span className="mt-8 text-stamp text-sm stamp-border drop-shadow-md">墨迹</span>
      </div>
      <h1 className="text-[160px] leading-none font-bold text-ink writing-vertical-rl tracking-widest font-wuxia text-shadow-sm" style={{ fontFamily: '"STXingkai", "Xingkai SC", var(--font-wuxia)' }}>
        江湖
      </h1>
      <div className="mt-8">
        <span className="text-stamp text-sm stamp-border font-bold drop-shadow-md">张三丰</span>
      </div>
    </div>
  );
}

export function BottomLeftArea() {
  return (
    <div className="absolute bottom-8 left-10 z-10 flex flex-col gap-6 w-full max-w-2xl pointer-events-none">
      <div className="pointer-events-auto w-fit max-w-lg">
        <div className="flex flex-col gap-2 text-[15px] font-medium tracking-wide">
          <p className="text-shadow-light">
            <span className="text-[#c69c6d] mr-2 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] font-bold">[系统]</span>
            <span className="text-[#e8e4db] font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">恭喜玩家“剑影流光”获得绝世武学“独孤九剑”！</span>
          </p>
          <p className="text-shadow-light">
            <span className="text-[#c64545] mr-2 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] font-bold">[系统]</span>
            <span className="text-[#e8e4db] font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">门派战将于明日 20:00 开启，请各位侠士准时参加！</span>
          </p>
        </div>
      </div>

      <div className="flex items-end gap-10">
        <div className="wuxia circle-frame circle-frame-ink flex items-center justify-center backdrop-blur-md pointer-events-auto cursor-pointer shadow-lg hover:brightness-110 transition-colors" style={{ width: 140, height: 140, backgroundSize: '100% 100%' }}>
          <div className="w-14 h-14 rounded-full bg-white/70 backdrop-blur-md shadow-[0_0_15px_rgba(255,255,255,0.4)]"></div>
        </div>
        
        <div className="flex flex-col items-center gap-1.5 group cursor-pointer pointer-events-auto mb-2">
          <div className="wuxia circle-frame circle-frame-ink flex items-center justify-center group-hover:scale-110 transition-transform drop-shadow-md" style={{ width: 56, height: 56, backgroundSize: '100% 100%' }}>
            <PawPrint size={26} className="text-[#1A1410]" strokeWidth={2} />
          </div>
          <span className="text-[15px] font-bold text-ink text-shadow-light tracking-widest drop-shadow-[0_1px_1px_rgba(255,255,255,0.6)] mt-1">坐骑</span>
        </div>
      </div>
    </div>
  );
}
