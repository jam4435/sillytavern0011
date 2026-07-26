import { TEAMS } from '../data/teams';

export type StartMode = 'possess' | 'custom';

/**
 * 开局标题画面：球馆聚光灯 + 复古球衣海报风。
 * 纯 CSS 氛围（聚光灯渐变、木地板纹理、中圈弧线、LED 跑马灯），无外部资源。
 */
export function SplashScreen(props: { onSelect: (mode: StartMode) => void }) {
  const ticker = [...TEAMS, ...TEAMS];
  return (
    <div className="splash">
      <div className="splash-court-arc" aria-hidden />
      <div className="splash-court-arc arc-2" aria-hidden />
      <div className="splash-stripe" aria-hidden />

      <div className="splash-stage">
        <div className="splash-kicker">2015-16 SEASON · CAREER SIMULATION</div>
        <h1 className="splash-logo">
          <span className="logo-nba">NBA</span>
          <span className="logo-2k">2K16</span>
        </h1>
        <div className="splash-cn">生 涯 模 拟</div>
        <div className="splash-rule">
          <i />
          <em>你的传奇，由骰子与汗水写成</em>
          <i />
        </div>

        <div className="splash-modes">
          <button className="mode-card" onClick={() => props.onSelect('possess')}>
            <span className="mode-num">01</span>
            <span className="mode-title">带入现役球员</span>
            <span className="mode-desc">附身库里、科比、詹姆斯…以巨星之躯书写另一种结局</span>
            <span className="mode-go">进入 →</span>
          </button>
          <button className="mode-card alt" onClick={() => props.onSelect('custom')}>
            <span className="mode-num">02</span>
            <span className="mode-title">自定义新秀</span>
            <span className="mode-desc">捏出你自己：位置、模板、身高——从落选秀到名人堂</span>
            <span className="mode-go">创建 →</span>
          </button>
        </div>
      </div>

      <div className="splash-ticker" aria-hidden>
        <div className="ticker-track">
          {ticker.map((t, i) => (
            <span key={`${t.id}-${i}`} className="ticker-item">
              <b style={{ color: t.colors.primary }}>{t.id}</b> {t.cn}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
