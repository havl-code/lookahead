// app.js: starts the app and switches between tabs

async function init() {
    // Holding this connection open tells the server the page is still open. The server stops
    // itself shortly after the last page closes, and the browser reconnects after a reload.
    new EventSource(`${API_BASE}/presence`);
    checkServerUpToDate();
    await loadGreeting();   // show the personalised greeting first
    switchTab('dashboard'); // this also loads the dashboard's data, so don't load it separately
}

// The server only loads its code when it starts, but this page's files are read fresh, so a
// server left running through an update would be older than the page. Say so rather than let
// the two quietly disagree. (A server from before this check existed has no version at all.)
async function checkServerUpToDate() {
    try {
        const response = await fetch(`${API_BASE}/app`);
        const info = await response.json();
        document.getElementById('update-banner').hidden = Boolean(info.version) && !info.stale;
    } catch (error) {
        console.error('Error checking the app version:', error);
    }
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

registerActions('click', {
    'switch-tab': element => switchTab(element.dataset.tab),
    // The Dashboard's quick actions open a tab with its form ready
    'quick-add-session': () => { switchTab('sessions'); showAddSessionForm(); },
    'quick-add-cube': () => { switchTab('cubes'); showAddCubeForm(); }
});

// Start the app when the page loads
document.addEventListener('DOMContentLoaded', init);
