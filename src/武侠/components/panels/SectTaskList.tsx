import React, { useState } from 'react';
import type { FactionTask, FactionTaskMap } from '../../types';
import { Icons } from '../Icons';

export interface SectTaskListProps {
  tasks?: FactionTaskMap;
  availableTasks?: FactionTaskMap;
  activeSectName?: string;
  onClaimTask: (taskName: string, task: FactionTask) => Promise<void>;
  onGenerateTaskOptions: (sectName: string) => Promise<void> | void;
  onAcceptTask: (sectName: string, taskName: string) => Promise<void>;
  onNavigateLocation?: (location: string) => void;
  isBusy?: boolean;
}

export const SectTaskList: React.FC<SectTaskListProps> = ({
  tasks = {},
  availableTasks = {},
  activeSectName,
  onClaimTask,
  onGenerateTaskOptions,
  onAcceptTask,
  onNavigateLocation,
  isBusy = false,
}) => {
  const [claimingTaskName, setClaimingTaskName] = useState<string | null>(null);
  const [acceptingTaskName, setAcceptingTaskName] = useState<string | null>(null);

  const taskEntries = Object.entries(tasks);
  const availableTaskEntries = Object.entries(availableTasks);
  const taskCount = taskEntries.length;
  const isMaxTasks = taskCount >= 3;

  const handleClaim = async (taskName: string, task: FactionTask) => {
    if (isBusy || claimingTaskName) return;
    setClaimingTaskName(taskName);
    try {
      await onClaimTask(taskName, task);
    } finally {
      setClaimingTaskName(null);
    }
  };

  const handleAccept = async (taskName: string) => {
    if (!activeSectName || isBusy || acceptingTaskName || isMaxTasks) return;
    setAcceptingTaskName(taskName);
    try {
      await onAcceptTask(activeSectName, taskName);
    } finally {
      setAcceptingTaskName(null);
    }
  };

  const renderRewards = (task: FactionTask) => {
    const reward = task.任务奖励;
    if (!reward) return null;
    return (
      <div className="task-rewards-row">
        <span className="reward-label">差事酬劳：</span>
        {typeof reward.贡献增量 === 'number' && reward.贡献增量 > 0 && (
          <span className="reward-pill contrib">贡献 +{reward.贡献增量}</span>
        )}
        {typeof reward.修为增量 === 'number' && reward.修为增量 > 0 && (
          <span className="reward-pill cult">修为 +{reward.修为增量}</span>
        )}
        {reward.获得物品 &&
          Object.keys(reward.获得物品).map(itemName => (
            <span key={itemName} className="reward-pill item">{itemName}</span>
          ))}
      </div>
    );
  };

  return (
    <div className="sect-task-list-container">
      <div className="task-list-header">
        <div className="task-count-info">
          <span className="task-count-label">当前差事</span>
          <span className={`task-count-badge ${isMaxTasks ? 'full' : ''}`}>{taskCount} / 3</span>
        </div>
        {activeSectName && (
          <button
            type="button"
            className="request-task-btn"
            disabled={isMaxTasks || isBusy}
            onClick={() => onGenerateTaskOptions(activeSectName)}
            title={isMaxTasks ? '当前执行中的差事已达上限（3个）' : '查看或刷新当前势力可选差事'}
          >
            <Icons.Plus size={14} className="btn-icon" />
            <span>{availableTaskEntries.length > 0 ? '刷新差事' : '查看差事'}</span>
          </button>
        )}
      </div>

      {activeSectName && (
        <section className="available-task-section">
          <div className="available-task-heading">
            <span>可选差事</span>
            <span className="available-task-count">{availableTaskEntries.length}</span>
          </div>
          {availableTaskEntries.length === 0 ? (
            <div className="available-task-empty">暂无可选差事，点击上方【查看差事】生成一批候选任务。</div>
          ) : (
            <div className="available-task-cards">
              {availableTaskEntries.map(([taskName, task]) => {
                const isAccepting = acceptingTaskName === taskName;
                return (
                  <div key={taskName} className="sect-task-card is-available">
                    <div className="task-card-header">
                      <div className="task-title-group">
                        <span className="task-sect-tag">{task.所属势力}</span>
                        <h4 className="task-name" title={taskName}>{taskName}</h4>
                      </div>
                      <span className="task-status-badge 可接">可接</span>
                    </div>
                    <div className="task-card-body">
                      <p className="task-detail">{task.任务详情}</p>
                      <div className="task-meta-row">
                        <div className="task-location">
                          <Icons.Compass size={14} className="meta-icon" />
                          <span className="loc-text">{task.任务地点}</span>
                        </div>
                      </div>
                      {renderRewards(task)}
                    </div>
                    <div className="task-card-footer candidate-footer">
                      <button
                        type="button"
                        className="accept-task-btn"
                        disabled={isBusy || isAccepting || isMaxTasks}
                        onClick={() => handleAccept(taskName)}
                      >
                        {isAccepting ? '接取中...' : isMaxTasks ? '差事已满' : '接取此差事'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <div className="task-cards-list">
        {taskCount === 0 ? (
          <div className="task-empty-state">
            <Icons.Quest size={32} className="empty-icon" />
            <div className="empty-title">暂无进行中的差事</div>
            <div className="empty-desc">
              {activeSectName ? '先查看可选差事，再从候选列表中选择一项接取。' : '加入门派势力后，可在此查看并接取历练差事。'}
            </div>
          </div>
        ) : (
          taskEntries.map(([taskName, task]) => {
            const isClaiming = claimingTaskName === taskName;
            const isCompleted = task.任务执行情况 === '已完成';
            return (
              <div key={taskName} className={`sect-task-card status-${task.任务执行情况} ${isCompleted ? 'is-completed' : ''}`}>
                <div className="task-card-header">
                  <div className="task-title-group">
                    <span className="task-sect-tag">{task.所属势力}</span>
                    <h4 className="task-name" title={taskName}>{taskName}</h4>
                  </div>
                  <span className={`task-status-badge ${task.任务执行情况}`}>{task.任务执行情况}</span>
                </div>
                <div className="task-card-body">
                  <p className="task-detail">{task.任务详情}</p>
                  <div className="task-meta-row">
                    <div className="task-location">
                      <Icons.Compass size={14} className="meta-icon" />
                      <span className="loc-text">{task.任务地点}</span>
                      {onNavigateLocation && (
                        <button type="button" className="nav-loc-btn" onClick={() => onNavigateLocation(task.任务地点)} title="在地图上查看此地点">
                          导航
                        </button>
                      )}
                    </div>
                  </div>
                  {renderRewards(task)}
                </div>
                {isCompleted && (
                  <div className="task-card-footer">
                    <button type="button" className="claim-reward-btn" disabled={isBusy || isClaiming} onClick={() => handleClaim(taskName, task)}>
                      {isClaiming ? '结算中...' : '交付差事 / 领取奖励'}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
