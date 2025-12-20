// theme.js - Dark mode toggle functionality

// Initialize theme on page load
(function() {
    // Check for saved theme preference or default to light mode
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
})();

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

function setTheme(theme) {
    // Set the data-theme attribute on html element
    document.documentElement.setAttribute('data-theme', theme);
    
    // Save preference to localStorage
    localStorage.setItem('theme', theme);
    
    // Update icon visibility
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    
    if (theme === 'dark') {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    } else {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    }
    
    // Update Plotly charts if they exist
    updateChartsTheme(theme);
}

function updateChartsTheme(theme) {
    // Update chart backgrounds and text colors for all Plotly charts
    if (typeof Plotly === 'undefined') return;
    
    const chartContainers = [
        'progress-chart',
        'distribution-chart',
        'breakdown-chart',
        'consistency-chart'
    ];
    
    const chartUpdate = {
        'plot_bgcolor': theme === 'dark' ? '#2a2a2a' : '#fafafa',
        'paper_bgcolor': theme === 'dark' ? '#2a2a2a' : '#fafafa',
        'font.color': theme === 'dark' ? '#ffffff' : '#000000',
        'xaxis.gridcolor': theme === 'dark' ? '#404040' : '#e0e0e0',
        'yaxis.gridcolor': theme === 'dark' ? '#404040' : '#e0e0e0',
        'xaxis.linecolor': theme === 'dark' ? '#555555' : '#ccc',
        'yaxis.linecolor': theme === 'dark' ? '#555555' : '#ccc'
    };
    
    chartContainers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container && container.data) {
            Plotly.relayout(containerId, chartUpdate);
        }
    });
}