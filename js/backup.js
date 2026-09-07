// backup.js - Export/Import a full JSON snapshot of local data.
//
// Data now lives only in this browser's IndexedDB, so clearing browser data (or switching
// browsers/machines) loses it with no equivalent of copying a .db file. This is the
// replacement backup mechanism: Export downloads everything as one JSON file, Import
// restores from that file (replacing all current local data).

async function exportBackup() {
    const [cubes, sessions, solves, settings] = await Promise.all([
        dbGetAll('cubes'), dbGetAll('sessions'), dbGetAll('solves'), dbGetAll('settings')
    ]);

    const payload = {
        app: 'speedcube-training-explorer',
        version: 1,
        exported_at: new Date().toISOString(),
        cubes, sessions, solves, settings
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `speedcube-backup-${todayDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function triggerImportBackup() {
    document.getElementById('backup-file-input').click();
}

async function handleImportBackupFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('Import this backup? This replaces ALL current data in this browser with the contents of the file.')) {
        event.target.value = '';
        return;
    }

    try {
        const payload = JSON.parse(await file.text());
        if (!Array.isArray(payload.cubes) || !Array.isArray(payload.sessions) || !Array.isArray(payload.solves)) {
            throw new Error('This file does not look like a valid backup.');
        }

        await Promise.all([dbClear('cubes'), dbClear('sessions'), dbClear('solves'), dbClear('settings')]);

        // One transaction per store (not one per record) - a real backup can hold
        // thousands of solves, and restoring them one dbPut() at a time was slow enough
        // to hang or crash the tab (the same bug that hit cstimer import).
        await dbBatch('cubes', 'readwrite', (tx) => {
            const store = tx.objectStore('cubes');
            payload.cubes.forEach(record => store.put(record));
        });
        await dbBatch('sessions', 'readwrite', (tx) => {
            const store = tx.objectStore('sessions');
            payload.sessions.forEach(record => store.put(record));
        });
        await dbBatch('solves', 'readwrite', (tx) => {
            const store = tx.objectStore('solves');
            payload.solves.forEach(record => store.put(record));
        });
        await dbBatch('settings', 'readwrite', (tx) => {
            const store = tx.objectStore('settings');
            (payload.settings || []).forEach(record => store.put(record));
        });

        alert('Backup restored. Reloading...');
        location.reload();
    } catch (e) {
        showError('Failed to restore backup: ' + e.message);
    } finally {
        event.target.value = '';
    }
}
