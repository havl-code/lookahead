import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DbProvider } from '../../db/DbProvider.tsx';
import { saveTimedSolve } from '../../db/solves.ts';
import { createTestDb } from '../../test/db.ts';
import { SessionScreen } from './SessionScreen.tsx';

describe('session solve deletion', () => {
  it('keeps the selected solve sheet open and reports a rejected deletion', async () => {
    const db = createTestDb();
    const { solveId, sessionId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_340, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14),
    );
    vi.spyOn(db.solves, 'delete').mockRejectedValue(new Error('delete failed'));
    render(
      <DbProvider db={db}>
        <SessionScreen sessionId={sessionId} />
      </DbProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Solve 1:/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Solve 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText("Couldn't delete Solve 1. Please try again.")).toBeTruthy();
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(await db.solves.get(solveId)).toBeDefined();
    db.close();
  });
});
