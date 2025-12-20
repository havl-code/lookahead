// app.js - Main application initialization and tab management

// Initialize app on page load
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    setupFileUpload();
});

// Tab Switching
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab content
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Add active class to clicked tab
    event.target.classList.add('active');
    
    // Load data for specific tabs
    if (tabName === 'sessions') {
        loadSessionsTab();
    } else if (tabName === 'cubes') {
        loadCubesTab();
    } else if (tabName === 'charts') {
        if (!AppState.chartsLoaded) {
            loadCharts();
            AppState.chartsLoaded = true;
        }
    }
}