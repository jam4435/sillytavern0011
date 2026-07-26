import { useState } from 'react';
import { TEAMS } from '../data/teams';
import { getRoster } from '../utils/rosters';

export interface SetupResult {
  playerName: string;
  teamId: string;
  /** 主角附身的球员 key（players.json 的 name） */
  protagonistKey: string;
}

/** 带入现役球员：选球队 → 选附身球员 → 起名 */
export function SetupScreen(props: { onStart: (r: SetupResult) => void; onBack?: () => void }) {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [protagonistKey, setProtagonistKey] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');

  const conferences = ['West', 'East'] as const;

  return (
    <div className="setup-screen">
      {props.onBack && (
        <button className="cp-back setup-back" onClick={props.onBack}>
          ← 返回
        </button>
      )}
      <h1 className="setup-title">带入现役球员</h1>
      <p className="setup-sub">2015-16 赛季 · 选择你的球队与附身球员</p>

      <div className="setup-teams">
        {conferences.map(conf => (
          <div key={conf} className="setup-conf">
            <div className="setup-conf-title">{conf === 'West' ? '西部' : '东部'}</div>
            <div className="setup-team-grid">
              {TEAMS.filter(t => t.conference === conf).map(t => (
                <button
                  key={t.id}
                  className={`setup-team ${teamId === t.id ? 'active' : ''}`}
                  style={{ borderColor: t.colors.primary }}
                  onClick={() => {
                    setTeamId(t.id);
                    setProtagonistKey(null);
                  }}
                >
                  <span className="setup-team-id" style={{ background: t.colors.primary }}>
                    {t.id}
                  </span>
                  {t.cn}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {teamId && (
        <div className="setup-roster">
          <div className="setup-conf-title">选择附身球员（★为主角，可用其视角打全场）</div>
          <div className="setup-roster-grid">
            {getRoster(teamId).map(p => (
              <button
                key={p.name}
                className={`setup-player ${protagonistKey === p.name ? 'active' : ''}`}
                onClick={() => setProtagonistKey(p.name)}
              >
                <span className="sp-ovr">{p.overall}</span>
                <span className="sp-name">{p.cn}</span>
                <span className="sp-pos">{p.pos}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {protagonistKey && (
        <div className="setup-finish">
          <input
            placeholder="你的球员昵称（可留空使用真名）"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
          />
          <button
            className="setup-start"
            onClick={() =>
              props.onStart({
                playerName: playerName.trim() || protagonistKey,
                teamId: teamId!,
                protagonistKey: protagonistKey!,
              })
            }
          >
            开始生涯
          </button>
        </div>
      )}
    </div>
  );
}
