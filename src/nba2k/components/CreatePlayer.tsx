import { useMemo, useState } from 'react';
import type { CreationMode, CreationStyle, Position, UpgradeGroupKey, UpgradeGroupState } from '../engine/types';
import { TEAMS } from '../data/teams';
import { GROUP_KEYS, GROUP_LABELS, bodyBounds, defaultBody, groupBudget, initialGroups, overallOf } from '../engine/development';
import type { CustomPlayerForm } from '../utils/customPlayer';
import { compatibleArchetypes, previewRatings, radarOf, validateCreation } from '../utils/customPlayer';

const POSITIONS: { pos: Position; label: string }[] = [
  { pos: 'PG', label: '控卫' }, { pos: 'SG', label: '分卫' }, { pos: 'SF', label: '小前' }, { pos: 'PF', label: '大前' }, { pos: 'C', label: '中锋' },
];
const STYLES: CreationStyle[] = ['均衡', '外线', '内线'];

function Radar({ data }: { data: { label: string; value: number }[] }) {
  const center = 105; const radius = 62;
  const point = (index: number, r: number) => { const angle = -Math.PI / 2 + index * 2 * Math.PI / 5; return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`; };
  const shape = data.map((item, index) => point(index, item.value / 99 * radius)).join(' ');
  return <svg className="cp-radar" viewBox="0 0 210 210">
    {[1, .66, .33].map(f => <polygon key={f} points={[0, 1, 2, 3, 4].map(i => point(i, radius * f)).join(' ')} className="radar-ring" />)}
    <polygon points={shape} className="radar-shape" />
    {data.map((item, index) => { const [x, y] = point(index, radius + 16).split(',').map(Number); return <text key={item.label} x={x} y={y} className="radar-label">{item.label} {item.value}</text>; })}
  </svg>;
}

export function CreatePlayer(props: { onCreate: (form: CustomPlayerForm) => void; onBack: () => void }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<CreationMode>('2K16模式');
  const [style, setStyle] = useState<CreationStyle>('均衡');
  const [pos, setPos] = useState<Position>('SG');
  const [archetypeId, setArchetypeId] = useState('all_round');
  const [body, setBody] = useState(() => defaultBody('2K16模式', 'SG'));
  const [groups, setGroups] = useState<UpgradeGroupState>(() => initialGroups('2K16模式', '均衡'));
  const [number, setNumber] = useState(8);
  const [teamId, setTeamId] = useState('');

  const compatible = useMemo(() => compatibleArchetypes(pos), [pos]);
  const selectedArchetype = compatible.find(item => item.id === archetypeId) ?? compatible[0];
  const bounds = bodyBounds(mode, pos, body.heightCm);
  const budget = groupBudget(groups);
  const form: CustomPlayerForm = { name: name || '新秀', pos, mode, style, archetypeId: selectedArchetype?.id ?? 'all_round', height_cm: body.heightCm, weight_kg: body.weightKg, wingspan_cm: body.wingspanCm, groups, number, teamId };
  const ratings = useMemo(() => previewRatings(form), [pos, groups, body.heightCm, body.weightKg, body.wingspanCm]);
  const overall = overallOf(ratings, pos);
  const errors = validateCreation({ ...form, name });

  const resetBuild = (nextMode: CreationMode, nextPos: Position, nextStyle: CreationStyle, preset: string) => {
    setBody(defaultBody(nextMode, nextPos));
    setGroups(initialGroups(nextMode, nextStyle, preset));
  };
  const updateGroup = (key: UpgradeGroupKey, delta: number) => setGroups(current => ({ ...current, [key]: Math.max(4, Math.min(14, current[key] + delta)) }));

  return <div className="create-player v3-builder">
    <header className="cp-head">
      <button className="cp-back" onClick={props.onBack}>← 返回</button>
      <div><span className="cp-eyebrow">MYPLAYER LAB / BUILD V3</span><h2>塑造你的新秀</h2></div>
      <span className={`cp-ovr-chip ${overall < 70 || overall > 76 ? 'invalid' : ''}`}>OVR <b>{overall}</b><small>潜力 88</small></span>
    </header>

    <div className="cp-mode-switch">
      {(['2K16模式', '自由模拟模式'] as CreationMode[]).map(item => <button key={item} className={mode === item ? 'active' : ''} onClick={() => { setMode(item); resetBuild(item, pos, style, selectedArchetype?.id ?? 'all_round'); }}>{item}<small>{item === '2K16模式' ? '位置限制与现实上限' : '宽体型与自由原型'}</small></button>)}
    </div>

    <div className="cp-grid cp-grid-v3">
      <section className="cp-col cp-identity-card">
        <label className="cp-label">球员身份</label>
        <input className="cp-input" placeholder="球员姓名" value={name} onChange={event => setName(event.target.value)} maxLength={12} />
        <select className="cp-input" value={teamId} onChange={event => setTeamId(event.target.value)}><option value="">— 选择球队 —</option>{TEAMS.map(team => <option key={team.id} value={team.id}>{team.cn}</option>)}</select>
        <label className="cp-label">位置</label>
        <div className="cp-pos-row">{POSITIONS.map(item => <button key={item.pos} className={`cp-pos ${pos === item.pos ? 'active' : ''}`} onClick={() => {
          setPos(item.pos); const nextArch = compatibleArchetypes(item.pos)[0]?.id ?? 'all_round'; setArchetypeId(nextArch); resetBuild(mode, item.pos, style, nextArch);
        }}><b>{item.pos}</b><span>{item.label}</span></button>)}</div>
        {mode === '2K16模式' ? <><label className="cp-label">风格</label><div className="cp-style-row">{STYLES.map(item => <button key={item} className={style === item ? 'active' : ''} onClick={() => { setStyle(item); setGroups(initialGroups(mode, item)); }}>{item}</button>)}</div></> : <><label className="cp-label">原型预设</label><div className="cp-arch-list">{compatible.map(item => <button key={item.id} className={`cp-arch ${selectedArchetype?.id === item.id ? 'active' : ''}`} onClick={() => { setArchetypeId(item.id); setGroups(initialGroups(mode, style, item.id)); }}><b>{item.name}</b><span>{item.tagline}</span></button>)}</div></>}
      </section>

      <section className="cp-col cp-body-lab">
        <label className="cp-label">BODY PROFILE</label>
        {([
          ['身高', 'heightCm', bounds.height.min, bounds.height.max, 'cm'],
          ['体重', 'weightKg', bounds.weight.min, bounds.weight.max, 'kg'],
          ['臂展', 'wingspanCm', body.heightCm + bounds.wingspanOffset.min, Math.min(250, body.heightCm + bounds.wingspanOffset.max), 'cm'],
        ] as const).map(([label, key, min, max, unit]) => <div className="cp-measure" key={key}><div><span>{label}</span><b>{body[key]} {unit}</b></div><input type="range" className="cp-slider" min={min} max={max} value={body[key]} onChange={event => {
          const value = Number(event.target.value); setBody(current => key === 'heightCm' ? { ...current, heightCm: value, wingspanCm: Math.max(value + bounds.wingspanOffset.min, Math.min(Math.min(250, value + bounds.wingspanOffset.max), current.wingspanCm)) } : { ...current, [key]: value });
        }} /><small>{min}–{max} {unit}</small></div>)}
        <div className="cp-body-effects"><b>体型会进入比赛计算</b><span>长臂提升干扰/篮板覆盖；体重提升对抗；超大体型压低控球、横移和加速。</span></div>
        <label className="cp-label">球衣号码 <b>#{number}</b></label><input type="range" className="cp-slider" min={0} max={99} value={number} onChange={event => setNumber(Number(event.target.value))} />
        <Radar data={radarOf(ratings)} />
      </section>

      <section className="cp-col cp-attribute-board">
        <div className="cp-budget"><span>能力组预算</span><b className={budget === 100 ? 'ok' : ''}>{budget}/100</b><small>创建阶段每组 4–14</small></div>
        <div className="cp-group-list">{GROUP_KEYS.map(key => <div className="cp-group" key={key}><span>{GROUP_LABELS[key]}</span><button disabled={groups[key] <= 4} onClick={() => updateGroup(key, -1)}>−</button><b>{groups[key]}</b><button disabled={groups[key] >= 14} onClick={() => updateGroup(key, 1)}>＋</button><div className="cp-group-track"><i style={{ width: `${groups[key] / 20 * 100}%` }} /></div></div>)}</div>
        {errors.length > 0 && <div className="cp-errors">{errors.map(error => <span key={error}>{error}</span>)}</div>}
        <button className="cp-create" disabled={errors.length > 0 || overall < 70 || overall > 76} onClick={() => props.onCreate({ ...form, name: name.trim() })}>签下新秀合同 <span>OVR {overall}</span></button>
      </section>
    </div>
  </div>;
}
