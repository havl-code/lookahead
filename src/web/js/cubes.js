// cubes.js - Cube inventory management

async function loadCubesTab() {
    try {
        const response = await fetch(`${API_BASE}/cubes`);
        AppState.allCubes = await response.json();
        
        if (AppState.allCubes.error) {
            console.error('Error loading cubes:', AppState.allCubes.error);
            return;
        }
        
        const tbody = document.getElementById('cubes-tbody');
        
        if (AppState.allCubes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">No cubes in inventory yet.</td></tr>';
            return;
        }
        
        tbody.innerHTML = AppState.allCubes.map(cube => `
            <tr>
                <td><strong>${cube.name || 'N/A'}</strong></td>
                <td>${cube.brand || '-'}</td>
                <td>${cube.model || '-'}</td>
                <td>${cube.purchase_date || '-'}</td>
                <td>${cube.is_active ? 
                    '<span style="color: #10b981; font-size: 16px;">●</span> Active' : 
                    '<span style="color: #999; font-size: 16px;">○</span> Inactive'
                }</td>
                <td>
                    <button class="action-btn" onclick="showEditCubeForm(${cube.id})">Edit</button>
                    ${cube.is_active ? 
                        `<button class="action-btn danger" onclick="deleteCube(${cube.id})">Deactivate</button>` :
                        `<button class="action-btn" onclick="reactivateCube(${cube.id})">Reactivate</button>`
                    }
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load cubes:', error);
    }
}

function showAddCubeForm() {
    document.getElementById('add-cube-form').style.display = 'block';
    const editForm = document.getElementById('edit-cube-form');
    if (editForm) editForm.style.display = 'none';
}

function hideAddCubeForm() {
    document.getElementById('add-cube-form').style.display = 'none';
}

async function addCube(event) {
    event.preventDefault();
    
    const name = document.getElementById('new-cube-name').value;
    const brand = document.getElementById('new-cube-brand').value;
    const model = document.getElementById('new-cube-model').value;
    const purchaseDate = document.getElementById('new-cube-date').value;
    const notes = document.getElementById('new-cube-notes').value;
    
    try {
        const response = await fetch(`${API_BASE}/cubes/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                brand: brand,
                model: model,
                purchase_date: purchaseDate,
                notes: notes
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            showSuccess('Cube added successfully');
            hideAddCubeForm();
            loadCubesTab();
            // Clear form
            document.getElementById('new-cube-name').value = '';
            document.getElementById('new-cube-brand').value = '';
            document.getElementById('new-cube-model').value = '';
            document.getElementById('new-cube-date').value = '';
            document.getElementById('new-cube-notes').value = '';
        }
    } catch (error) {
        showError(error.message);
    }
}

function showEditCubeForm(cubeId) {
    const cube = AppState.allCubes.find(c => c.id === cubeId);
    if (!cube) return;
    
    let editForm = document.getElementById('edit-cube-form');
    if (!editForm) {
        const cubeSection = document.querySelector('#tab-cubes .cubes-section');
        const addForm = document.getElementById('add-cube-form');
        
        const editFormHTML = `
            <div id="edit-cube-form" class="form-card" style="display: none;">
                <h3>Edit Cube</h3>
                <form onsubmit="updateCube(event)">
                    <input type="hidden" id="edit-cube-id">
                    <div class="form-group">
                        <label>Name: <span style="color: red;">*</span></label>
                        <input type="text" id="edit-cube-name" required placeholder="e.g., Main 3x3">
                    </div>
                    <div class="form-group">
                        <label>Brand:</label>
                        <input type="text" id="edit-cube-brand" placeholder="e.g., GAN, MoYu">
                    </div>
                    <div class="form-group">
                        <label>Model:</label>
                        <input type="text" id="edit-cube-model" placeholder="e.g., 14 MagLev">
                    </div>
                    <div class="form-group">
                        <label>Purchase Date / Started Using:</label>
                        <input type="date" id="edit-cube-date">
                    </div>
                    <div class="form-group">
                        <label>Notes:</label>
                        <textarea id="edit-cube-notes" rows="3" placeholder="Any additional notes..."></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Save Changes</button>
                        <button type="button" class="btn-secondary" onclick="hideEditCubeForm()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        
        addForm.insertAdjacentHTML('afterend', editFormHTML);
        editForm = document.getElementById('edit-cube-form');
    }
    
    // Populate form with cube data
    document.getElementById('edit-cube-id').value = cube.id;
    document.getElementById('edit-cube-name').value = cube.name || '';
    document.getElementById('edit-cube-brand').value = cube.brand || '';
    document.getElementById('edit-cube-model').value = cube.model || '';
    document.getElementById('edit-cube-date').value = cube.purchase_date || '';
    document.getElementById('edit-cube-notes').value = cube.notes || '';
    
    // Hide add form and show edit form
    document.getElementById('add-cube-form').style.display = 'none';
    editForm.style.display = 'block';
}

function hideEditCubeForm() {
    document.getElementById('edit-cube-form').style.display = 'none';
}

async function updateCube(event) {
    event.preventDefault();
    
    const cubeId = document.getElementById('edit-cube-id').value;
    const name = document.getElementById('edit-cube-name').value;
    const brand = document.getElementById('edit-cube-brand').value;
    const model = document.getElementById('edit-cube-model').value;
    const purchaseDate = document.getElementById('edit-cube-date').value;
    const notes = document.getElementById('edit-cube-notes').value;
    
    try {
        const response = await fetch(`${API_BASE}/cubes/${cubeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                brand: brand,
                model: model,
                purchase_date: purchaseDate,
                notes: notes
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            showSuccess('Cube updated successfully');
            hideEditCubeForm();
            loadCubesTab();
        }
    } catch (error) {
        showError(error.message);
    }
}

async function deleteCube(cubeId) {
    if (!confirm('Deactivate this cube? Past sessions will still reference it.')) return;
    
    try {
        const response = await fetch(`${API_BASE}/cubes/${cubeId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            showSuccess('Cube deactivated successfully');
            loadCubesTab();
        }
    } catch (error) {
        showError(error.message);
    }
}

async function reactivateCube(cubeId) {
    try {
        const response = await fetch(`${API_BASE}/cubes/${cubeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: 1 })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            showSuccess('Cube reactivated successfully');
            loadCubesTab();
        }
    } catch (error) {
        showError(error.message);
    }
}

async function loadCubesForDropdown() {
    try {
        const response = await fetch(`${API_BASE}/cubes`);
        const cubes = await response.json();
        
        const select = document.getElementById('new-cube-id');
        select.innerHTML = '<option value="">None</option>';
        
        cubes.forEach(cube => {
            if (cube.is_active) {
                const option = document.createElement('option');
                option.value = cube.id;
                option.textContent = `${cube.name}${cube.brand ? ' - ' + cube.brand : ''}`;
                select.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Failed to load cubes for dropdown:', error);
    }
}