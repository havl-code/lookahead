// app.js: starts the app and switches between tabs

async function init() {
    // Holding this connection open tells the server the page is still open. The server stops
    // itself shortly after the last page closes, and the browser reconnects after a reload.
    new EventSource(`${API_BASE}/presence`);
    await loadGreeting();   // show the personalised greeting first
    switchTab('dashboard'); // this also loads the dashboard's data, so don't load it separately
}

const TAB_LOADERS = {
    dashboard: () => loadDashboard(),
    timer: () => loadTimerTab(),
    sessions: () => loadSessionsTab(),
    cubes: () => loadCubesTab(),
    import: () => loadImportTab(),
    analytics: () => loadAnalyticsTab()
};

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.toggle('active', tab.id === `tab-${tabName}`);
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    window.scrollTo(0, 0);
    TAB_LOADERS[tabName]();
}

// Start the app when the page loads
document.addEventListener('DOMContentLoaded', init);
