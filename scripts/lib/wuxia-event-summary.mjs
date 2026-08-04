const ORDINARY_EVENT_KIND = 'ordinary';

export function buildOpeningEventSummary(events) {
  return events
    .filter(event => event.kind === ORDINARY_EVENT_KIND && !event.conditional && event.triggerTime)
    .map(event => {
      const triggerTime = event.triggerTime || {};
      const summaryTime = {
        年: triggerTime.年,
        月: triggerTime.月,
        日: triggerTime.日,
        ...(Object.prototype.hasOwnProperty.call(triggerTime, '时') ? { 时: triggerTime.时 } : {}),
      };
      return {
        事件名称: event.sourceName.replace('事件条目-', ''),
        事件地点: event.location,
        触发时间: summaryTime,
      };
    });
}
