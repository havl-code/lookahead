// cubes.js - Cube inventory management

let cubeSortState = {
    column: null,
    direction: 'asc'
};

async function loadCubesTab() {
    try {
        const response = await fetch(`${API_BASE}/cubes`);
        AppState.allCubes = await response.json();
        
        if (AppState.allCubes.error) {
            console.error('Error loading cubes:', AppState.allCubes.error);
            return;
        }
        
        renderCubesTable();
        
    } catch (error) {
        console.error('Failed to load cubes:', error);
    }
}

function renderCubesTable() {
    const tbody = document.getElementById('cubes-tbody');
    
    if (AppState.allCubes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">No cubes in inventory yet.</td></tr>';
        return;
    }
    
    tbody.innerHTML = AppState.allCubes.map(cube => `
        <tr>
            <td><strong>${cube.cube_type || '-'}</strong></td>
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
}

function sortCubes(column) {
    // Toggle direction if same column, otherwise reset to ascending
    if (cubeSortState.column === column) {
        cubeSortState.direction = cubeSortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        cubeSortState.column = column;
        cubeSortState.direction = 'asc';
    }
    
    // Sort the cubes array
    AppState.allCubes.sort((a, b) => {
        let aVal, bVal;
        
        switch(column) {
            case 'type':
                aVal = a.cube_type || '';
                bVal = b.cube_type || '';
                break;
            case 'brand':
                aVal = a.brand || '';
                bVal = b.brand || '';
                break;
            case 'model':
                aVal = a.model || '';
                bVal = b.model || '';
                break;
            case 'date':
                aVal = a.purchase_date || '';
                bVal = b.purchase_date || '';
                break;
            default:
                return 0;
        }
        
        if (aVal < bVal) return cubeSortState.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return cubeSortState.direction === 'asc' ? 1 : -1;
        return 0;
    });
    
    // Update sort arrows
    document.querySelectorAll('.sort-arrow-cube').forEach(arrow => {
        arrow.textContent = '';
        arrow.classList.remove('asc', 'desc');
    });
    
    const activeHeader = Array.from(document.querySelectorAll('.sortable-cube')).find(th => {
        return th.textContent.trim().toLowerCase().includes(column);
    });
    
    if (activeHeader) {
        const arrow = activeHeader.querySelector('.sort-arrow-cube');
        arrow.textContent = cubeSortState.direction === 'asc' ? '▲' : '▼';
        arrow.classList.add(cubeSortState.direction);
    }
    
    renderCubesTable();
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
    
    let cubeType = document.getElementById('new-cube-type').value;
    
    // If "Other" is selected, use custom type
    if (cubeType === 'other') {
        cubeType = document.getElementById('new-cube-custom-type').value;
    }
    
    const brand = document.getElementById('new-cube-brand').value;
    const model = document.getElementById('new-cube-model').value;
    const purchaseDate = document.getElementById('new-cube-date').value;
    const notes = document.getElementById('new-cube-notes').value;
    
    try {
        const response = await fetch(`${API_BASE}/cubes/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cube_type: cubeType,
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
            document.getElementById('new-cube-type').value = '';
            document.getElementById('new-cube-custom-type').value = '';
            document.getElementById('custom-type-group').style.display = 'none';
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
                        <label>Event Type: <span style="color: red;">*</span></label>
                        <select id="edit-cube-type" required>
                            <option value="">Select Type</option>
                            <option value="222">2x2x2</option>
                            <option value="333">3x3x3</option>
                            <option value="444">4x4x4</option>
                            <option value="555">5x5x5</option>
                            <option value="666">6x6x6</option>
                            <option value="777">7x7x7</option>
                            <option value="333oh">3x3x3 One-Handed</option>
                            <option value="333bf">3x3x3 Blindfolded</option>
                            <option value="clock">Clock</option>
                            <option value="minx">Megaminx</option>
                            <option value="pyram">Pyraminx</option>
                            <option value="skewb">Skewb</option>
                            <option value="sq1">Square-1</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div class="form-group" id="edit-custom-type-group" style="display: none;">
                        <label>Custom Type:</label>
                        <input type="text" id="edit-cube-custom-type" placeholder="Enter custom type">
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
        
        // Add event listener for custom type toggle
        document.getElementById('edit-cube-type').addEventListener('change', function() {
            const customTypeGroup = document.getElementById('edit-custom-type-group');
            if (this.value === 'other') {
                customTypeGroup.style.display = 'block';
                document.getElementById('edit-cube-custom-type').required = true;
            } else {
                customTypeGroup.style.display = 'none';
                document.getElementById('edit-cube-custom-type').required = false;
            }
        });
    }
    
    // Populate form with cube data
    document.getElementById('edit-cube-id').value = cube.id;
    
    // Handle cube type - check if it's a standard type or custom
    const standardTypes = ['222', '333', '444', '555', '666', '777', '333oh', '333bf', 'clock', 'minx', 'pyram', 'skewb', 'sq1'];
    const typeSelect = document.getElementById('edit-cube-type');
    
    if (cube.cube_type && standardTypes.includes(cube.cube_type)) {
        typeSelect.value = cube.cube_type;
        document.getElementById('edit-custom-type-group').style.display = 'none';
    } else if (cube.cube_type) {
        typeSelect.value = 'other';
        document.getElementById('edit-custom-type-group').style.display = 'block';
        document.getElementById('edit-cube-custom-type').value = cube.cube_type;
    } else {
        typeSelect.value = '';
    }
    
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
    let cubeType = document.getElementById('edit-cube-type').value;
    
    // If "Other" is selected, use custom type
    if (cubeType === 'other') {
        cubeType = document.getElementById('edit-cube-custom-type').value;
    }
    
    const brand = document.getElementById('edit-cube-brand').value;
    const model = document.getElementById('edit-cube-model').value;
    const purchaseDate = document.getElementById('edit-cube-date').value;
    const notes = document.getElementById('edit-cube-notes').value;
    
    try {
        const response = await fetch(`${API_BASE}/cubes/${cubeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cube_type: cubeType,
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
                const displayText = cube.cube_type ? 
                    `${cube.cube_type}${cube.brand ? ' - ' + cube.brand : ''}${cube.model ? ' ' + cube.model : ''}` :
                    `${cube.brand || 'Unknown'}${cube.model ? ' ' + cube.model : ''}`;
                option.textContent = displayText;
                select.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Failed to load cubes for dropdown:', error);
    }
}