// greeting.js - Personalized greeting functionality

// Load user settings and update greeting
async function loadGreeting() {
    try {
        const response = await fetch(`${API_BASE}/user/settings`);
        const data = await response.json();
        
        const greetingText = document.getElementById('greeting-text');
        const greetingSubtext = document.getElementById('greeting-subtext');
        const wcaSetupPrompt = document.getElementById('wca-setup-prompt');
        const wcaDisplay = document.getElementById('wca-display');
        const wcaIdDisplay = document.getElementById('wca-id-display');
        
        if (data.wca_id && data.wca_name) {
            // User has WCA ID set - show personalized greeting with full name
            const timeOfDay = getTimeOfDay();
            
            greetingText.textContent = `${timeOfDay}, ${data.wca_name}!`;
            greetingSubtext.textContent = 'Welcome to Speedcube Training Explorer';
            
            // Show WCA ID badge
            wcaIdDisplay.textContent = data.wca_id;
            wcaDisplay.style.display = 'flex';
            wcaSetupPrompt.style.display = 'none';
        } else {
            // No WCA ID set - show generic greeting and setup prompt
            greetingText.textContent = 'Welcome to Speedcube Training Explorer';
            greetingSubtext.textContent = 'Track your progress and compare with WCA rankings';
            
            wcaSetupPrompt.style.display = 'flex';
            wcaDisplay.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load greeting:', error);
        // Show generic greeting on error
        document.getElementById('greeting-text').textContent = 'Welcome to Speedcube Training Explorer';
        document.getElementById('greeting-subtext').textContent = 'Track your progress and compare with WCA rankings';
    }
}

// Get time-appropriate greeting
function getTimeOfDay() {
    const hour = new Date().getHours();
    
    if (hour >= 5 && hour < 12) {
        return 'Good morning';
    } else if (hour >= 12 && hour < 17) {
        return 'Good afternoon';
    } else if (hour >= 17 && hour < 22) {
        return 'Good evening';
    } else {
        return 'Hello';
    }
}

// Show WCA ID setup modal
function showWCASetupModal() {
    const modal = document.getElementById('wca-setup-modal');
    const input = document.getElementById('wca-id-input');
    const status = document.getElementById('wca-setup-status');
    const removeBtn = document.getElementById('remove-wca-btn');
    
    // Clear previous input and status
    status.textContent = '';
    status.className = '';
    
    // Check if user already has WCA ID
    fetch(`${API_BASE}/user/settings`)
        .then(res => res.json())
        .then(data => {
            if (data.wca_id) {
                input.value = data.wca_id;
                removeBtn.style.display = 'inline-block';
            } else {
                input.value = '';
                removeBtn.style.display = 'none';
            }
        })
        .catch(err => {
            console.error('Error loading WCA ID:', err);
            input.value = '';
            removeBtn.style.display = 'none';
        });
    
    modal.style.display = 'flex';
}

// Close WCA ID setup modal
function closeWCASetupModal() {
    const modal = document.getElementById('wca-setup-modal');
    modal.style.display = 'none';
}

// Save WCA ID
async function saveWCAID(event) {
    event.preventDefault();
    
    const input = document.getElementById('wca-id-input');
    const status = document.getElementById('wca-setup-status');
    const wcaId = input.value.trim().toUpperCase();
    
    // Show loading state
    status.textContent = 'Validating WCA ID...';
    status.className = '';
    
    try {
        const response = await fetch(`${API_BASE}/user/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ wca_id: wcaId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            status.textContent = `Success! Welcome, ${data.wca_name}!`;
            status.className = 'success';
            
            // Reload greeting after short delay
            setTimeout(() => {
                closeWCASetupModal();
                loadGreeting();
            }, 1500);
        } else {
            status.textContent = data.error || 'Failed to save WCA ID';
            status.className = 'error';
        }
    } catch (error) {
        console.error('Error saving WCA ID:', error);
        status.textContent = 'Network error. Please try again.';
        status.className = 'error';
    }
}

// Remove WCA ID
async function removeWCAID() {
    if (!confirm('Are you sure you want to remove your WCA ID?')) {
        return;
    }
    
    const status = document.getElementById('wca-setup-status');
    status.textContent = 'Removing...';
    status.className = '';
    
    try {
        const response = await fetch(`${API_BASE}/user/settings`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            status.textContent = 'WCA ID removed successfully';
            status.className = 'success';
            
            setTimeout(() => {
                closeWCASetupModal();
                loadGreeting();
            }, 1000);
        } else {
            status.textContent = 'Failed to remove WCA ID';
            status.className = 'error';
        }
    } catch (error) {
        console.error('Error removing WCA ID:', error);
        status.textContent = 'Network error. Please try again.';
        status.className = 'error';
    }
}

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('wca-setup-modal');
    if (event.target === modal) {
        closeWCASetupModal();
    }
});