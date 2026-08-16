// The event timeline uses a deliberately simple 12-month, 30-day calendar.
// Month and day values are one-based everywhere outside this module.
export const WUXIA_MONTHS_PER_YEAR = 12;
export const WUXIA_DAYS_PER_MONTH = 30;
export const WUXIA_DAYS_PER_YEAR = WUXIA_MONTHS_PER_YEAR * WUXIA_DAYS_PER_MONTH;
export const WUXIA_HOURS_PER_DAY = 24;
export const WUXIA_MINUTES_PER_HOUR = 60;
export const WUXIA_MINUTES_PER_DAY = WUXIA_HOURS_PER_DAY * WUXIA_MINUTES_PER_HOUR;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function wuxiaCalendarDateToTotalDays(time) {
  const year = finiteNumber(time?.年);
  const month = finiteNumber(time?.月, 1);
  const day = finiteNumber(time?.日, 1);
  return year * WUXIA_DAYS_PER_YEAR + (month - 1) * WUXIA_DAYS_PER_MONTH + (day - 1);
}

export function wuxiaCalendarTimeToTotalMinutes(time) {
  return (
    wuxiaCalendarDateToTotalDays(time) * WUXIA_MINUTES_PER_DAY +
    finiteNumber(time?.时) * WUXIA_MINUTES_PER_HOUR +
    finiteNumber(time?.分)
  );
}

export function wuxiaCalendarTimeToTotalHours(time) {
  return wuxiaCalendarTimeToTotalMinutes(time) / WUXIA_MINUTES_PER_HOUR;
}

export function totalDaysToWuxiaCalendarDate(totalDays) {
  const normalizedDays = Math.floor(finiteNumber(totalDays));
  const year = Math.floor(normalizedDays / WUXIA_DAYS_PER_YEAR);
  const dayOfYear = normalizedDays - year * WUXIA_DAYS_PER_YEAR;
  return {
    年: year,
    月: Math.floor(dayOfYear / WUXIA_DAYS_PER_MONTH) + 1,
    日: (dayOfYear % WUXIA_DAYS_PER_MONTH) + 1,
  };
}

export function totalMinutesToWuxiaCalendarTime(totalMinutes) {
  const normalizedMinutes = Math.floor(finiteNumber(totalMinutes));
  const totalDays = Math.floor(normalizedMinutes / WUXIA_MINUTES_PER_DAY);
  const minuteOfDay = normalizedMinutes - totalDays * WUXIA_MINUTES_PER_DAY;
  return {
    ...totalDaysToWuxiaCalendarDate(totalDays),
    时: Math.floor(minuteOfDay / WUXIA_MINUTES_PER_HOUR),
    分: minuteOfDay % WUXIA_MINUTES_PER_HOUR,
  };
}

export function totalHoursToWuxiaCalendarTime(totalHours) {
  const normalizedHours = Math.floor(finiteNumber(totalHours));
  const totalDays = Math.floor(normalizedHours / WUXIA_HOURS_PER_DAY);
  const hourOfDay = normalizedHours - totalDays * WUXIA_HOURS_PER_DAY;
  return {
    ...totalDaysToWuxiaCalendarDate(totalDays),
    时: hourOfDay,
  };
}
