// theme.js - Dark mode toggle functionality (optimized)

// Initialize theme on page load
(function() {
    // Check for saved theme preference or default to light mode
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme, true); // Skip chart updates on init
})();

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme, false);
}

function setTheme(theme, skipChartUpdate = false) {
    // Set the data-theme attribute on html element
    document.documentElement.setAttribute('data-theme', theme);
    
    // Save preference to localStorage
    localStorage.setItem('theme', theme);
    
    // Update icon visibility
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    
    if (sunIcon && moonIcon) {
        if (theme === 'dark') {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        } else {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        }
    }
    
    // Update Plotly charts if they exist (only when user toggles, not on init)
    if (!skipChartUpdate && typeof Plotly !== 'undefined') {
        // Use requestAnimationFrame to avoid blocking
        requestAnimationFrame(() => {
            updateChartsTheme(theme);
        });
    }
}

function updateChartsTheme(theme) {
    // Only update charts that are currently visible and rendered
    const chartContainers = [
        'progress-chart',
        'distribution-chart',
        'breakdown-chart',
        'consistency-chart'
    ];
    
    const isDark = theme === 'dark';
    const chartUpdate = {
        'plot_bgcolor': isDark ? '#2a2a2a' : '#fafafa',
        'paper_bgcolor': isDark ? '#2a2a2a' : '#fafafa',
        'font.color': isDark ? '#ffffff' : '#000000',
        'xaxis.gridcolor': isDark ? '#404040' : '#e0e0e0',
        'yaxis.gridcolor': isDark ? '#404040' : '#e0e0e0',
        'xaxis.linecolor': isDark ? '#555555' : '#ccc',
        'yaxis.linecolor': isDark ? '#555555' : '#ccc',
        'xaxis.title.font.color': isDark ? '#ffffff' : '#000000',
        'yaxis.title.font.color': isDark ? '#ffffff' : '#000000',
        'title.font.color': isDark ? '#ffffff' : '#000000'
    };
    
    // Only update visible charts to avoid lag
    const activeTab = document.querySelector('.tab-content.active');
    const isChartsTabActive = activeTab && activeTab.id === 'tab-charts';
    
    if (!isChartsTabActive) {
        // Charts tab not active, skip update
        return;
    }
    
    chartContainers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container && container.data && container.layout) {
            // Use Plotly.relayout which is faster than redrawing
            try {
                Plotly.relayout(containerId, chartUpdate).catch(err => {
                    console.warn(`Failed to update ${containerId}:`, err);
                });
            } catch (err) {
                console.warn(`Error updating ${containerId}:`, err);
            }
        }
    });
}