// app.js - Main application initialization

// Initialize app
async function init() {
    await loadGreeting();  // Load personalized greeting first
    switchTab('dashboard');
    loadDashboard();
}

// Switch between tabs
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Add active class to clicked tab button
    const tabButtons = document.querySelectorAll('.tab');
    tabButtons.forEach(tab => {
        if (tab.textContent.toLowerCase() === tabName) {
            tab.classList.add('active');
        }
    });
    
    // Load tab content
    switch(tabName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'timer':
            loadTimerTab();
            break;
        case 'sessions':
            loadSessionsTab();
            break;
        case 'cubes':
            loadCubesTab();
            break;
        case 'import':
            loadImportTab();
            break;
        case 'charts':
            loadChartsTab();
            break;
    }
}

// Start app when page loads
document.addEventListener('DOMContentLoaded', init);