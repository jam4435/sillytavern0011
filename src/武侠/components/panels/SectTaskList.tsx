import React, { useState } from 'react';
import type { FactionTask, FactionTaskMap } from '../../types';
import { Icons } from '../Icons';

export interface SectTaskListProps {
  tasks?: FactionTaskMap;
  activeSectName?: string;
  onClaimTask: (taskName: string, task: FactionTask) => Promise<void>;
  onRequestTask: (sectName: string) => void;
  onNavigateLocation?: (location: string) => void;
  isBusy?: boolean;
}

export const SectTaskList: React.FC<SectTaskListProps> = ({
  tasks = {},
  activeSectName,
  onClaimTask,
  onRequestTask,
  onNavigateLocation,
  isBusy = false,
}) => {
  const [claimingTaskName, setClaimingTaskName] = useState<string | null>(null);

  const taskEntries = Object.entries(tasks);
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

  return (
    <div className="sect-task-list-container">
      {/* 头部状态与接取按钮 */}
      <div className="task-list-header">
        <div className="task-count-info">
          <span className="task-count-label">当前差事</span>
          <span className={`task-count-badge ${isMaxTasks ? 'full' : ''}`}>
            {taskCount} / 3
          </span>
        </div>
        {activeSectName && (
          <button
            type="button"
            className="request-task-btn"
            disabled={isMaxTasks || isBusy}
            onClick={() => onRequestTask(activeSectName)}
            title={isMaxTasks ? '当前执行中的差事已达上限（3个）' : '向师门长辈接取历练差事'}
          >
            <Icons.Plus size={14} className="btn-icon" />
            <span>接取差事</span>
          </button>
        )}
      </div>

      {/* 任务卡片列表 */}
      <div className="task-cards-list">
        {taskCount === 0 ? (
          <div className="task-empty-state">
            <Icons.Quest size={32} className="empty-icon" />
            <div className="empty-title">暂无进行中的差事</div>
            <div className="empty-desc">
              {activeSectName
                ? '点击上方【接取差事】按钮，向前辈请命外出历练。'
                : '加入门派势力后，可在此查看并接取历练差事。'}
            </div>
          </div>
        ) : (
          taskEntries.map(([taskName, task]) => {
            const isClaiming = claimingTaskName === taskName;
            const isCompleted = task.任务执行情况 === '已完成';
            const reward = task.任务奖励;

            return (
              <div
                key={taskName}
                className={`sect-task-card status-${task.任务执行情况} ${isCompleted ? 'is-completed' : ''}`}
              >
                <div className="task-card-header">
                  <div className="task-title-group">
                    <span className="task-sect-tag">{task.所属势力}</span>
                    <h4 className="task-name" title={taskName}>
                      {taskName}
                    </h4>
                  </div>
                  <span className={`task-status-badge ${task.任务执行情况}`}>
                    {task.任务执行情况}
                  </span>
                </div>

                <div className="task-card-body">
                  <p className="task-detail">{task.任务详情}</p>

                  <div className="task-meta-row">
                    <div className="task-location">
                      <Icons.Compass size={14} className="meta-icon" />
                      <span className="loc-text">{task.任务地点}</span>
                      {onNavigateLocation && (
                        <button
                          type="button"
                          className="nav-loc-btn"
                          onClick={() => onNavigateLocation(task.任务地点)}
                          title="在地图上查看此地点"
                        >
                          导航
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 奖励预览 */}
                  {reward && (
                    <div className="task-rewards-row">
                      <span className="reward-label">差事酬劳：</span>
                      {typeof reward.贡献增量 === 'number' && reward.贡献增量 > 0 && (
                        <span className="reward-pill contrib">
                          贡献 +{reward.贡献增量}
                        </span>
                      )}
                      {typeof reward.修为增量 === 'number' && reward.修为增量 > 0 && (
                        <span className="reward-pill cult">
                          修为 +{reward.修为增量}
                        </span>
                      )}
                      {reward.获得物品 &&
                        Object.keys(reward.获得物品).map(itemName => (
                          <span key={itemName} className="reward-pill item">
                            {itemName}
                          </span>
                        ))}
                    </div>
                  )}
                </div>

                {/* 底部交付结算按钮 */}
                {isCompleted && (
                  <div className="task-card-footer">
                    <button
                      type="button"
                      className="claim-reward-btn"
                      disabled={isBusy || isClaiming}
                      onClick={() => handleClaim(taskName, task)}
                    >
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
