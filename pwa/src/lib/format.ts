/**
 * A result in seconds as cubers write it: 12.34, then 1:23.45 from a minute up, whole seconds from
 * 10 minutes up (10:12), as the WCA records them (Regulation 9f2), and hours from an hour up
 * (1:02:05). Singles and averages are already truncated or rounded (see stats.ts); this only lays
 * them out. The same as the desktop app's formatClock.
 */
export function formatClock(seconds: number): string {
  if (seconds < 60) return seconds.toFixed(2);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  if (seconds < 600) return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
  const secs = String(Math.round(rest)).padStart(2, '0');
  if (minutes < 60) return `${minutes}:${secs}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${secs}`;
}

/** A result, or a dash when there isn't one (no solves yet, or a DNF average). */
export function formatResult(seconds: number | null): string {
  return seconds === null ? '-' : formatClock(seconds);
}

/** "1 solve", "2 solves", with the count written the New Zealand way (1,234). */
export function count(value: number, one: string, many: string): string {
  return `${value.toLocaleString('en-NZ')} ${value === 1 ? one : many}`;
}
