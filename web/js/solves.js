// solves.js: changing one solve's penalty or note, and deleting it with Undo, for the timer and
// the Sessions tab. Deleting doesn't ask first: an Undo toast shows for a few seconds instead,
// and puts the solve back exactly as it was, at its old number.

const UNDO_SECONDS = 8;
const MAX_SOLVE_NOTES = 1000;  // the same as the server's limit (MAX_NOTES in validation.py)
const PENALTIES = ['OK', '+2', 'DNF'];

// A solve's penalty as one of PENALTIES. A DNF counts whatever else it says, and a solve with
// no penalty set is OK.
function solvePenalty(solve) {
    if (solve.dnf || solve.result_seconds === null) return 'DNF';
    return solve.penalty === '+2' ? '+2' : 'OK';
}

// The <option>s for a penalty menu, with the solve's own penalty chosen
function penaltyOptions(solve) {
    const current = solvePenalty(solve);
    return PENALTIES.map(p => `<option value="${p}" ${p === current ? 'selected' : ''}>${p}</option>`).join('');
}

// Change a solve's penalty, its note, or both. Resolves to the solve as it is now (as the
// Sessions tab lists it), or null if it couldn't be changed, after a toast saying why.
async function updateSolve(solveId, changes) {
    try {
        const response = await apiFetch(`/solves/${solveId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changes)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result.solve;
    } catch (error) {
        showError(`Couldn't change the solve: ${error.message}`);
        return null;
    }
}

// Ask for a solve's note and save it. Resolves to the solve as it is now, or null if nothing
// changed.
async function editSolveNote(solve) {
    const current = solve.notes || '';
    const notes = await promptDialog(
        `A note for solve #${solve.solve_number}, such as how it went. Leave it empty to remove the note.`,
        { title: current ? 'Edit Note' : 'Add a Note', value: current, confirmLabel: 'Save Note', maxLength: MAX_SOLVE_NOTES });
    if (notes === null || notes.trim() === current) return null;
    return updateSolve(solve.id, { notes });
}

// Delete a solve and offer Undo. `refresh` redraws whatever shows the solves: it runs once the
// solve is gone, and again if it's put back. Resolves to true if the solve was deleted.
async function deleteSolve(solveId, refresh) {
    let deleted;
    try {
        const response = await apiFetch(`/solves/${solveId}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        deleted = result.deleted;
    } catch (error) {
        showError(`Couldn't delete the solve: ${error.message}`);
        return false;
    }
    await refresh();
    showToast(`Solve #${deleted.solve_number} deleted.`, {
        actionLabel: 'Undo', onAction: () => restoreSolve(deleted, refresh), duration: UNDO_SECONDS * 1000
    });
    return true;
}

async function restoreSolve(solve, refresh) {
    try {
        const response = await apiFetch('/solves/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(solve)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
    } catch (error) {
        showError(`Couldn't put the solve back: ${error.message}`);
        return;
    }
    await refresh();
    showSuccess('Solve put back.');
}
