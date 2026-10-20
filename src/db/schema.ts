import type { SessionStats } from '../lib/stats.ts';

/*
 * Records use the desktop app's field names, the same ones its backups use, so a backup goes in
 * and out of either app without translating anything. Times are in milliseconds, dates are
 * YYYY-MM-DD on the device's calendar, and timestamps are ISO 8601 in UTC.
 */

export interface Cube {
  id: number;
  cube_type: string | null;
  brand: string | null;
  model: string | null;
  purchase_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string | null;
}

export interface Session extends SessionStats {
  id: number;
  date: string | null;
  event_id: string | null;
  cube_id: number | null;
  notes: string | null;
  created_at: string | null;
}

export interface Solve {
  id: number;
  session_id: number;
  solve_number: number;
  time_ms: number;
  scramble: string | null;
  /** 'OK' (or null, in older data), '+2', or 'DNF'. */
  penalty: string | null;
  dnf: boolean;
  notes: string | null;
  timestamp: string | null;
}

/** Settings that travel with backups: the WCA ID and name ('user'), and the timer's ('timer'). */
export interface SettingRow {
  id: string;
  wca_id: string | null;
  wca_name: string | null;
  /** JSON, for rows that hold more than the WCA fields. */
  value: string | null;
}
