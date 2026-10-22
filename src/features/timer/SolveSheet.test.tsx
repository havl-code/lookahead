import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Solve } from '../../db/schema.ts';
import type { EditResult } from '../../db/solveEditing.ts';
import { SolveSheet } from './SolveSheet.tsx';

vi.mock('../../db/hooks.ts', () => ({ useSolveAverages: () => undefined }));

const solve = {
  id: 1,
  session_id: 2,
  solve_number: 1,
  time_ms: 12_340,
  scramble: 'R U',
  penalty: 'OK',
  dnf: false,
  notes: '',
  timestamp: '2026-10-22T12:00:00.000Z',
} as Solve;

const success = <T,>(value: T): Promise<EditResult<T>> =>
  Promise.resolve({ status: 'success', value });

describe('solve sheet while an edit is pending', () => {
  it('keeps the sheet open and locks its mutation controls and note field', () => {
    const onClose = vi.fn();
    render(
      <SolveSheet
        solve={solve}
        pending
        onClose={onClose}
        onPenalty={() => success(true)}
        onNotes={() => success('')}
        onDelete={() => success(solve)}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Solve 1' });
    expect((screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'DNF' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).readOnly).toBe(true);

    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    fireEvent.click(dialog);
    expect(document.body.contains(dialog)).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });
});
