// backup.js: export or import a full JSON backup of your data, and export solves as CSV
//
// Export downloads everything (cubes, sessions, solves, WCA ID) as one JSON file; Import
// restores from such a file, replacing all current data. Backups made with the older
// browser-only version (2.x) use the same format, so they can be imported here too.

registerActions('click', {
    'export-backup': () => exportBackup(),
    'import-backup': () => triggerImportBackup(),
    'export-csv': () => exportSolvesCsv(),
    'export-session-csv': () => exportSolvesCsv(solvesView.sessionId)
});
registerActions('change', { 'import-backup-file': (input, event) => handleImportBackupFile(event) });

function download(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function exportBackup() {
    download(`${API_BASE}/backup/export`);
}

// Every solve as a spreadsheet (CSV), or just one session's
function exportSolvesCsv(sessionId = null) {
    download(`${API_BASE}/export/solves.csv${sessionId ? `?session_id=${sessionId}` : ''}`);
}

function triggerImportBackup() {
    document.getElementById('backup-file-input').click();
}

async function handleImportBackupFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const replace = await confirmDialog(
        `Restore "${file.name}"? Everything in the app now is replaced with what's in the file.`,
        { title: 'Restore a backup', confirmLabel: 'Replace everything' });
    if (!replace) {
        event.target.value = '';
        return;
    }

    try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiFetch(`/backup/import`, { method: 'POST', body: formData });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Unknown error');
        }

        const leftOut = result.solves_left_out
            ? ` (${countLabel(result.solves_left_out, 'solve')} without a session were left out)` : '';
        showSuccess(`Backup restored${leftOut}. What you had before is kept in data/backups. Reloading...`);
        setTimeout(() => location.reload(), 800);  // long enough to read the message
    } catch (e) {
        showError(`Couldn't restore the backup: ${e.message}`);
    } finally {
        event.target.value = '';
    }
}
