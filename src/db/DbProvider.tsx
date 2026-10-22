import { createContext, type ReactNode, useContext, useState } from 'react';
import type { LookaheadDb } from './database.ts';
import { SolveEditing } from './solveEditing.ts';
import { TimerSaving } from './timerSaving.ts';

const DbContext = createContext<LookaheadDb | null>(null);
const SavingContext = createContext<TimerSaving | null>(null);
const EditingContext = createContext<SolveEditing | null>(null);

/** Provides the database to the app, so tests can hand in a fresh one. */
export function DbProvider({
  db,
  children,
}: {
  readonly db: LookaheadDb;
  readonly children: ReactNode;
}) {
  const [saving] = useState(() => new TimerSaving(db));
  const [editing] = useState(() => new SolveEditing(db));
  return (
    <DbContext value={db}>
      <EditingContext value={editing}>
        <SavingContext value={saving}>{children}</SavingContext>
      </EditingContext>
    </DbContext>
  );
}

export function useDb(): LookaheadDb {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb must be used inside a DbProvider');
  return db;
}

export function useSolveEditing(): SolveEditing {
  const editing = useContext(EditingContext);
  if (!editing) throw new Error('useSolveEditing must be used inside a DbProvider');
  return editing;
}

export function useTimerSaving(): TimerSaving {
  const saving = useContext(SavingContext);
  if (!saving) throw new Error('useTimerSaving must be used inside a DbProvider');
  return saving;
}
