/**
 * Checks for what people type in, the same as the desktop app's speedcube/validation.py, so a bad
 * value gets a clear message rather than quietly bad data. The limits are there to catch
 * mistakes, not to get in anyone's way.
 */

// A practice limit, not a WCA rule. The WCA's default time limit is 10 minutes an attempt
// (Regulation A1a1) and its longest is 60 minutes, for Multi-Blind (H1b), but a practice solve,
// such as a first 7x7x7, can take longer than any competition would allow.
export const maxSolveMs = 2 * 60 * 60 * 1000;
export const maxNotes = 1000;
export const maxScramble = 2000;
export const maxCubeText = 200;

export type Checked<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

const ok = <T>(value: T): Checked<T> => ({ ok: true, value });
const fail = (error: string): Checked<never> => ({ ok: false, error });

/**
 * A typed time in ms: seconds (12.34), or minutes and seconds (1:23.45), or hours too (1:02:03).
 * A DNF may be 0 (or left blank), since a solve that never started has no time.
 */
export function solveTimeMs(text: string, allowZero = false): Checked<number> {
  const typed = text.trim().replace(',', '.');
  if (typed === '') return allowZero ? ok(0) : fail('A time is required.');
  const parts = typed.split(':');
  const seconds = parts.pop() ?? '';
  if (
    parts.length > 2 ||
    !parts.every((part) => /^\d+$/.test(part)) ||
    !/^(\d+\.?\d*|\.\d+)$/.test(seconds)
  )
    return fail('Write the time in seconds, such as 12.34, or as 1:23.45.');
  if (parts.length > 0 && (Number(seconds) >= 60 || (parts.length === 2 && Number(parts[1]) >= 60)))
    return fail('Minutes and seconds go up to 59, such as 1:59.99.');
  const total = [...parts, seconds].reduce((sum, part) => sum * 60 + Number(part), 0);
  const ms = Math.round(total * 1000);
  if (ms === 0 && !allowZero) return fail('A time must be more than 0 seconds.');
  if (ms > maxSolveMs) return fail('A solve can be at most 2 hours long.');
  return ok(ms);
}

/** Optional text, trimmed, up to `limit` characters. */
export function text(
  value: string,
  field: string,
  limit: number,
  required = false,
): Checked<string> {
  const trimmed = value.trim();
  if (required && !trimmed) return fail(`${field} is required.`);
  if (trimmed.length > limit)
    return fail(`${field} can be at most ${limit.toLocaleString('en-NZ')} characters.`);
  return ok(trimmed);
}

/** A YYYY-MM-DD date, or null when blank and not required. With `today`, a later date is refused. */
export function isoDate(
  value: string,
  field: string,
  { today, required = false }: { readonly today?: string; readonly required?: boolean } = {},
): Checked<string | null> {
  if (value === '') return required ? fail(`${field} is required.`) : ok(null);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return fail(`${field} must be a date written as YYYY-MM-DD.`);
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return fail(`${field} is not a real date.`);
  if (today !== undefined && value > today) return fail(`${field} can't be in the future.`);
  return ok(value);
}

// Four digits (the year of the first competition), four letters, and two digits.
const wcaIdPattern = /^\d{4}[A-Z]{4}\d{2}$/;

/** A WCA ID in capitals, such as 2003POCH01. */
export function wcaId(value: string): Checked<string> {
  const id = value.trim().toUpperCase();
  if (!id) return fail('Type your WCA ID.');
  if (!wcaIdPattern.test(id))
    return fail('A WCA ID is four digits, four letters, and two digits, such as 2003POCH01.');
  return ok(id);
}
