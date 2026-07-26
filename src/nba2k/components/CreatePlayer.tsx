import { useMemo, useState } from 'react';
import type { Position } from '../engine/types';
import { TEAMS } from '../data/teams';
import type { CustomPlayerForm } from '../utils/customPlayer';
import { ARCHETYPES, HEIGHT_BY_POS, buildCustomPlayer, radarOf } from '../utils/customPlayer';

const POSITIONS: { pos: Position; label: string }[] = [
  { pos: 'PG', label: '控球后卫' },
  { pos: 'SG', label: '得分后卫' },
  { pos: 'SF', label: '小前锋' },
  { pos: 'PF', label: '大前锋' },
  { pos: 'C', label: '中锋' },
];

/** 五维雷达图（SVG 五边形） */
function Radar(props: { data: { label: string; value: number }[] }) {
  const C = 105;
  const R = 62;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
  };
  const ring = (f: number) => [0, 1, 2, 3, 4].map(i => pt(i, R * f)).join(' ');
  const shape = props.data.map((d, i) => pt(i, (d.value / 99) * R)).join(' ');
  return (
    <svg className="cp-radar" viewBox="0 0 210 210">
      {[1, 0.66, 0.33].map(f => (
        <polygon key={f} points={ring(f)} className="radar-ring" />
      ))}
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1={C} y1={C} x2={pt(i, R).split(',')[0]} y2={pt(i, R).split(',')[1]} className="radar-axis" />
      ))}
      <polygon points={shape} className="radar-shape" />
      {props.data.map((d, i) => {
        const [x, y] = pt(i, R + 14).split(',').map(Number);
        return (
          <text key={d.label} x={x} y={y} className="radar-label">
            {d.label} {d.value}
          </text>
        );
      })}
    </svg>
  );
}

export function CreatePlayer(props: { onCreate: (form: CustomPlayerForm) => void; onBack: () => void }) {
  const [name, setName] = useState('');
  const [pos, setPos] = useState<Position>('SG');
  const [archetypeId, setArchetypeId] = useState('all_round');
  const [height, setHeight] = useState(HEIGHT_BY_POS.SG.def);
  const [number, setNumber] = useState(8);
  const [teamId, setTeamId] = useState<string | null>(null);

  const arch = ARCHETYPES.find(a => a.id === archetypeId)!;
  const preview = useMemo(
    () => buildCustomPlayer({ name: name || '新秀', pos, archetypeId, height_cm: height, number, teamId: teamId ?? 'GSW' }),
    [name, pos, archetypeId, height, number, teamId],
  );
  const range = HEIGHT_BY_POS[pos];
  const ready = name.trim().length > 0 && teamId;

  return (
    <div className="create-player">
      <div className="cp-head">
        <button className="cp-back" onClick={props.onBack}>
          ← 返回
        </button>
        <h2>自定义新秀</h2>
        <span className="cp-ovr-chip">
          总评 <b>{preview.overall}</b> · 潜力 <b>{preview.attrs.potential}</b>
        </span>
      </div>

      <div className="cp-grid">
        <div className="cp-col">
          <label className="cp-label">姓名</label>
          <input className="cp-input" placeholder="你的球员姓名" value={name} onChange={e => setName(e.target.value)} maxLength={12} />

          <label className="cp-label">位置</label>
          <div className="cp-pos-row">
            {POSITIONS.map(p => (
              <button
                key={p.pos}
                className={`cp-pos ${pos === p.pos ? 'active' : ''}`}
                onClick={() => {
                  setPos(p.pos);
                  setHeight(HEIGHT_BY_POS[p.pos].def);
                }}
              >
                <b>{p.pos}</b>
                <span>{p.label}</span>
              </button>
            ))}
          </div>

          <label className="cp-label">
            身高 <b>{height} cm</b>
          </label>
          <input
            type="range"
            className="cp-slider"
            min={range.min}
            max={range.max}
            value={height}
            onChange={e => setHeight(Number(e.target.value))}
          />

          <label className="cp-label">
            球衣号码 <b>#{number}</b>
          </label>
          <input
            type="range"
            className="cp-slider"
            min={0}
            max={99}
            value={number}
            onChange={e => setNumber(Number(e.target.value))}
          />
        </div>

        <div className="cp-col">
          <label className="cp-label">球员模板</label>
          <div className="cp-arch-list">
            {ARCHETYPES.map(a => (
              <button key={a.id} className={`cp-arch ${archetypeId === a.id ? 'active' : ''}`} onClick={() => setArchetypeId(a.id)}>
                <span className="arch-name">
                  {a.name}
                  {a.fits.includes(pos) ? <i className="arch-fit">适配 {pos}</i> : null}
                </span>
                <span className="arch-tag">{a.tagline}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="cp-col cp-preview">
          <label className="cp-label">能力预览 · {arch.name}</label>
          <Radar data={radarOf(preview.attrs)} />
          <label className="cp-label">加盟球队</label>
          <select className="cp-input" value={teamId ?? ''} onChange={e => setTeamId(e.target.value || null)}>
            <option value="">— 选择球队 —</option>
            {TEAMS.map(t => (
              <option key={t.id} value={t.id}>
                [{t.conference === 'West' ? '西' : '东'}] {t.cn}
              </option>
            ))}
          </select>
          <button
            className="cp-create"
            disabled={!ready}
            onClick={() => props.onCreate({ name: name.trim(), pos, archetypeId, height_cm: height, number, teamId: teamId! })}
          >
            签下这份新秀合同
          </button>
        </div>
      </div>
    </div>
  );
}
