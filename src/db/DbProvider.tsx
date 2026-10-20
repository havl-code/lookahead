import { createContext, type ReactNode, useContext } from 'react';
import type { LookaheadDb } from './database.ts';

const DbContext = createContext<LookaheadDb | null>(null);

/** Provides the database to the app, so tests can hand in a fresh one. */
export function DbProvider({
  db,
  children,
}: {
  readonly db: LookaheadDb;
  readonly children: ReactNode;
}) {
  return <DbContext value={db}>{children}</DbContext>;
}

export function useDb(): LookaheadDb {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb must be used inside a DbProvider');
  return db;
}
