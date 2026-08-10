import type { GameState } from './schema';

const DAY_MS = 86_400_000;

export function parseISODate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`无效日期: ${value}`);
  return parsed;
}

export function formatISODate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  return formatISODate(new Date(parseISODate(value).getTime() + days * DAY_MS));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / DAY_MS);
}

export function ageOnDate(birthDate: string, currentDate: string): number {
  const birth = parseISODate(birthDate);
  const current = parseISODate(currentDate);
  let age = current.getUTCFullYear() - birth.getUTCFullYear();
  const currentMonth = current.getUTCMonth();
  const birthMonth = birth.getUTCMonth();
  if (currentMonth < birthMonth || (currentMonth === birthMonth && current.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export function daysUntilDeadline(state: GameState): number {
  return Math.max(0, daysBetween(state.currentDate, state.scenario.deadline));
}

